// Supabase Edge Function: nimmt rohe Apple-Health-Werte (Herzfrequenz, Schritte,
// Distanz) von einem iOS-Kurzbefehl entgegen, erkennt daraus Trainingsfenster der
// Apple Watch (siehe parse.ts) und legt sie in fit_football_watch_windows ab. Die App
// zeigt sie im Fußball-Tab als Vorschlag. Es wird nie selbst ein Fußball-Eintrag
// angelegt: Art der Einheit und RPE bleiben deine Eingabe.
//
// Aufruf: POST .../functions/v1/football-import[?dry=1]
// Header: x-import-token: <IMPORT_TOKEN>
// Body (JSON), alle drei Felder optional, Format siehe parse.ts / README.md:
//   { "hr": "<Start>|<Ende>|<Wert>\n...", "steps": "...", "distance": "..." }
//
// ?dry=1 liefert nur die erkannten Fenster, ohne etwas zu schreiben (zum Testen).
//
// Authentifizierung: ein langes zufälliges Geheimnis (IMPORT_TOKEN) statt eines
// Nutzer-JWT, weil ein Kurzbefehl keinen ablaufenden Supabase-Token erneuern kann. Die
// Funktion schreibt mit der Service-Rolle für genau einen Nutzer (IMPORT_USER_ID).
// Das Token berechtigt nur dazu, Vorschlags-Fenster anzulegen oder zu aktualisieren,
// nicht zum Lesen. Deshalb mit --no-verify-jwt deployen (siehe README.md).
//
// Secrets (supabase secrets set ...): IMPORT_TOKEN, IMPORT_USER_ID.
// SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY stellt Supabase automatisch bereit.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { detectWindows, parseSamples, type Sample, type WatchWindow } from './parse.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const IMPORT_TOKEN = Deno.env.get('IMPORT_TOKEN');
const IMPORT_USER_ID = Deno.env.get('IMPORT_USER_ID');

const MAX_BODY_BYTES = 2_000_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** Vergleich ohne frühes Abbrechen (kein Zeitkanal über die Länge des gemeinsamen Präfixes). */
function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

const UPSERT_CHUNK = 500;

/**
 * Speichert die Rohwerte (Upsert über Nutzer/Art/Start/Ende, wiederholbar ohne Dopplung),
 * damit die App beliebige Zeiträume auswerten kann. Doppelte Schlüssel im selben Aufruf
 * werden vorher zusammengefasst, sonst lehnt Postgres das Upsert ab. Herzfrequenzwerte
 * außerhalb von 30–220 bpm werden nicht gespeichert.
 */
async function storeSamples(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  userId: string,
  hr: Sample[],
  steps: Sample[],
  distance: Sample[],
): Promise<{ count: number; error: string | null }> {
  const rows = new Map<string, Record<string, unknown>>();
  const add = (kind: string, samples: Sample[]) => {
    for (const s of samples) {
      if (s.value < 0) continue;
      if (kind === 'hr' && (s.value < 30 || s.value > 220)) continue;
      const startAt = new Date(s.startMs).toISOString();
      const endAt = new Date(s.endMs).toISOString();
      rows.set(`${kind}|${startAt}|${endAt}`, { user_id: userId, kind, start_at: startAt, end_at: endAt, value: s.value });
    }
  };
  add('hr', hr);
  add('steps', steps);
  add('distance', distance);

  const all = [...rows.values()];
  for (let i = 0; i < all.length; i += UPSERT_CHUNK) {
    const { error } = await supabase
      .from('fit_health_samples')
      .upsert(all.slice(i, i + UPSERT_CHUNK), { onConflict: 'user_id,kind,start_at,end_at' });
    if (error) return { count: 0, error: error.message };
  }
  return { count: all.length, error: null };
}

interface ExistingRow {
  id: string;
  started_at: string;
  ended_at: string;
  session_id: string | null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Nur POST erlaubt' }, 405);

  if (!IMPORT_TOKEN || !IMPORT_USER_ID) {
    return json({ ok: false, error: 'IMPORT_TOKEN/IMPORT_USER_ID sind nicht als Secrets gesetzt' }, 500);
  }
  const given = req.headers.get('x-import-token') ?? '';
  if (!safeEqual(given, IMPORT_TOKEN)) return json({ ok: false, error: 'Ungültiges Token' }, 401);

  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return json({ ok: false, error: 'Anfrage zu groß' }, 413);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Ungültiges JSON' }, 400);
  }

  const hr = parseSamples(body.hr, 'hr');
  const steps = parseSamples(body.steps, 'steps');
  const distance = parseSamples(body.distance, 'distance');
  const invalid = hr.invalid + steps.invalid + distance.invalid;

  if (hr.samples.length === 0) {
    return json(
      { ok: false, error: 'Keine lesbaren Herzfrequenz-Messwerte (Feld "hr" prüfen)', invalid },
      400,
    );
  }

  const { windows, skipped } = detectWindows(hr.samples, steps.samples, distance.samples);
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  if (dry) return json({ ok: true, dry, windows, skipped, invalid, created: 0, updated: 0 });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const stored = await storeSamples(supabase, IMPORT_USER_ID, hr.samples, steps.samples, distance.samples);
  if (stored.error) return json({ ok: false, error: stored.error }, 500);

  if (windows.length === 0) {
    return json({ ok: true, dry: false, windows, skipped, invalid, samplesStored: stored.count, created: 0, updated: 0 });
  }

  // Bereits vorhandene Fenster, die sich zeitlich überlappen: so erzeugt ein erneuter
  // Aufruf (oder ein anderer Datenausschnitt desselben Trainings) keine Dopplung.
  const minStart = windows.reduce((m, w) => (w.startedAt < m ? w.startedAt : m), windows[0].startedAt);
  const maxEnd = windows.reduce((m, w) => (w.endedAt > m ? w.endedAt : m), windows[0].endedAt);
  const { data: existing, error: selectError } = await supabase
    .from('fit_football_watch_windows')
    .select('id, started_at, ended_at, session_id')
    .eq('user_id', IMPORT_USER_ID)
    .lt('started_at', maxEnd)
    .gt('ended_at', minStart);
  if (selectError) return json({ ok: false, error: selectError.message }, 500);

  const rows = (existing ?? []) as ExistingRow[];
  let created = 0;
  let updated = 0;
  let alreadyUsed = 0;

  const toRow = (w: WatchWindow) => ({
    started_at: w.startedAt,
    ended_at: w.endedAt,
    hr_samples: w.hrSamples,
    avg_heart_rate: w.avgHeartRate,
    max_heart_rate: w.maxHeartRate,
    steps: w.steps,
    distance_km: w.distanceKm,
  });

  for (const w of windows) {
    const overlap = rows.find(
      (r) => Date.parse(r.started_at) < Date.parse(w.endedAt) && Date.parse(r.ended_at) > Date.parse(w.startedAt),
    );
    if (overlap) {
      // Schon in einen Eintrag übernommen: nicht mehr anfassen.
      if (overlap.session_id) {
        alreadyUsed += 1;
        continue;
      }
      const { error } = await supabase.from('fit_football_watch_windows').update(toRow(w)).eq('id', overlap.id);
      if (error) return json({ ok: false, error: error.message }, 500);
      updated += 1;
      continue;
    }
    const { error } = await supabase
      .from('fit_football_watch_windows')
      .insert({ user_id: IMPORT_USER_ID, ...toRow(w) });
    if (error) return json({ ok: false, error: error.message }, 500);
    created += 1;
  }

  return json({ ok: true, dry: false, windows, skipped, invalid, samplesStored: stored.count, created, updated, alreadyUsed });
});
