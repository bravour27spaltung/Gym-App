// Supabase Edge Function: nimmt rohe Apple-Health-Werte für einen Tag entgegen (HRV-
// und Ruhepuls-Mittelwert, dazu die rohen Schlaf-Kategorie-Samples) und ergänzt damit
// einen bereits bestehenden Recovery-Eintrag (fit_recovery_entries) – legt nie selbst
// einen neuen Eintrag an, das bleibt die tägliche PRS-Eingabe in der App.
//
// Warum hier statt in der Shortcuts-Oberfläche: Die Summenbildung über Schlafphasen
// (Enddatum minus Startdatum je Phase, nur "Asleep*"-Werte, nicht "InBed"/"Awake") ist
// in Shortcuts nur mit einer fehleranfälligen Schleife über Datums-Subtraktionen
// machbar. Hier ist es eine getestete, reine Funktion (siehe isAsleepValue/
// sumSleepHours, spiegelt die Logik aus src/lib/appleHealthImport.ts).
//
// Aufruf: POST .../functions/v1/recovery-import
// Header: Authorization: Bearer <Supabase-Access-Token des Nutzers>
// Body (JSON):
//   {
//     "date": "2026-09-29",
//     "hrv_ms": 45.3,            // optional, bereits gemittelt (Shortcuts kann das direkt)
//     "resting_hr": 52,          // optional, bereits gemittelt
//     "sleep_samples": [         // optional, ungefiltert – die Funktion filtert selbst
//       { "start": "2026-09-28T21:03:00Z", "end": "2026-09-28T21:40:00Z", "value": "HKCategoryValueSleepAnalysisAsleepCore" },
//       ...
//     ]
//   }
//
// Bereits vorhandene Werte werden nie überschrieben (gleiche Regel wie beim
// Apple-Health-Import in der App selbst, siehe lib/healthImport.ts).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Von Supabase automatisch für jede Edge Function bereitgestellt, kein manuelles
// Secret-Setzen nötig.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

interface SleepSample {
  start: string;
  end: string;
  value: string;
}

/** Nur diese Kategoriewerte zählen als "geschlafen" (nicht "im Bett" oder "wach"). */
function isAsleepValue(value: string): boolean {
  return typeof value === 'string' && value.includes('Asleep');
}

/** Summiert die Dauer aller Asleep-Phasen in Stunden; null ohne verwertbare Samples. */
function sumSleepHours(samples: unknown): number | null {
  if (!Array.isArray(samples) || samples.length === 0) return null;
  let totalMs = 0;
  for (const raw of samples as SleepSample[]) {
    if (!raw || !isAsleepValue(raw.value)) continue;
    const start = Date.parse(raw.start);
    const end = Date.parse(raw.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    totalMs += end - start;
  }
  if (totalMs <= 0) return null;
  const hours = totalMs / 3_600_000;
  return hours > 16 ? null : Math.round(hours * 100) / 100; // Konsistenz mit der DB-Grenze
}

function numOrNull(n: unknown, min: number, max: number): number | null {
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return n >= min && n <= max ? n : null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Nur POST erlaubt' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ ok: false, error: 'Kein Authorization-Header' }, 401);

  // Client mit dem JWT des Aufrufers: Row-Level-Security greift wie überall sonst in der
  // App auch hier über auth.uid() – kein Service-Role-Key nötig oder gewünscht.
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Ungültiges JSON' }, 400);
  }

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!date) return json({ ok: false, error: 'Ungültiges oder fehlendes Datum (YYYY-MM-DD erwartet)' }, 400);

  const hrvMs = numOrNull(body.hrv_ms, 0, 300);
  const restingHr = numOrNull(body.resting_hr, 30, 120);
  const sleepHours = sumSleepHours(body.sleep_samples);

  const { data: existing, error: selectError } = await supabase
    .from('fit_recovery_entries')
    .select('id, hrv_ms, resting_hr, sleep_hours')
    .eq('date', date)
    .maybeSingle();

  if (selectError) return json({ ok: false, error: selectError.message }, 500);
  if (!existing) {
    // Bewusst kein Auto-Anlegen: die PRS ist der tägliche, gewollt manuelle Kern des
    // Recovery-Eintrags. Ohne bestehenden Eintrag gibt es also nichts zu patchen.
    return json(
      { ok: false, error: `Kein Recovery-Eintrag für ${date} – zuerst die PRS in der App eintragen.` },
      404,
    );
  }

  const patch: Record<string, number | string> = {};
  if (existing.hrv_ms === null && hrvMs !== null) patch.hrv_ms = hrvMs;
  if (existing.resting_hr === null && restingHr !== null) patch.resting_hr = restingHr;
  if (existing.sleep_hours === null && sleepHours !== null) patch.sleep_hours = sleepHours;

  if (Object.keys(patch).length === 0) return json({ ok: true, patched: [] });
  patch.source = 'apple_health';

  const { error: updateError } = await supabase
    .from('fit_recovery_entries')
    .update(patch)
    .eq('id', existing.id as string);
  if (updateError) return json({ ok: false, error: updateError.message }, 500);

  return json({ ok: true, patched: Object.keys(patch).filter((k) => k !== 'source') });
});
