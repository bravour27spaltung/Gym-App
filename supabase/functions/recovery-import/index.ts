// Supabase Edge Function: ergänzt einen bereits bestehenden Recovery-Eintrag
// (fit_recovery_entries) um Apple-Health-Werte: HRV, Ruhepuls und Schlaf. Legt nie selbst einen
// neuen Eintrag an, das bleibt die tägliche PRS-Eingabe in der App.
//
// SCHLAF: Der Eintrag eines Tages (Datum = Tag des Aufwachens) bekommt die NACHT, die an diesem
// Tag endet, als Ganzes, also auch den Teil vor Mitternacht. Dafür muss der Kurzbefehl die
// Schlafabschnitte nicht für "den Tag ab 0 Uhr" holen, sondern für ein großzügiges Fenster:
// "Startdatum liegt zwischen" Vortag 12:00 und Tag 18:00. Die Zuordnung zur Nacht erledigt diese
// Funktion (sleep.ts, identisch mit src/lib/sleep.ts). Ein zu enges Fenster (z. B. "heute ab
// 0 Uhr") schneidet dagegen den Abend ab und liefert zu wenig Schlaf.
//
// Gibt es noch keinen Eintrag, landen die Werte im Eingang (fit_recovery_health_inbox, Migration 0017)
// und werden von der App übernommen, sobald die PRS eingetragen ist.
//
// Aufruf: POST .../functions/v1/recovery-import[?dry=1]
// Authentifizierung, eine von zwei Möglichkeiten:
//   a) Header x-import-token: <IMPORT_TOKEN>  (für Kurzbefehle; Secrets IMPORT_TOKEN und
//      IMPORT_USER_ID, deployen mit --no-verify-jwt, siehe football-import/README.md)
//   b) Header Authorization: Bearer <Supabase-Access-Token des Nutzers>
// Body (JSON):
//   {
//     "date": "2026-10-03",            // Tag des Aufwachens, Pflicht
//     "tz_offset_min": 120,            // optional: UTC-Offset in Minuten, falls die Zeitstempel
//                                      // keinen Offset tragen (sonst wird er aus ihnen gelesen)
//     "sleep": "<Start>|<Ende>|<Phase>\n...",   // Schlafabschnitte, eine Zeile je Abschnitt
//     "hrv":   "<Start>|<Ende>|<ms>\n...",      // optional: HRV-Messungen (SDNN); Mittel in der Nacht
//     "hrv_ms": 45.3,                  // optional: bereits gemittelte HRV (Vorrang vor "hrv")
//     "resting_hr": 52,                // optional: Ruhepuls (bereits gemittelt)
//     "sleep_samples": [ { "start": "...", "end": "...", "value": "..." } ]  // statt "sleep"
//     "sleep_hours": 7.5               // VERALTET: fertige Summe; hat kein Nachtfenster und ist
//                                      // anfällig für den oben beschriebenen Fehler
//   }
//
// Bereits vorhandene Werte werden nie überschrieben. Einzige Ausnahme: ein aus Apple Health
// stammender Schlafwert OHNE Nachtfenster (aus der früheren Fenster-Methode) wird durch den
// Nachtwert ersetzt, weil er den Abend vor Mitternacht verlieren konnte.
//
// Zusätzlich werden Tief- und REM-Minuten der Nacht gespeichert (Migration 0018). Wachzeit und
// Leichtschlaf bewusst nicht: die Wacherkennung der Uhr ist schwach (siehe Migration).
//
// ?dry=1 zeigt nur, was geschrieben würde.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sleepNightForDate, sleepStageOf, type SleepSegment } from './sleep.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const IMPORT_TOKEN = Deno.env.get('IMPORT_TOKEN');
const IMPORT_USER_ID = Deno.env.get('IMPORT_USER_ID');

const MAX_BODY_BYTES = 2_000_000;
const POST_WAKE_MS = 60 * 60_000;

interface RawSample {
  start: string;
  end: string;
  value: string;
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

/**
 * Zählt als "geschlafen": alle Schlafphasen (Core/Deep/REM/Unspecified, auch deutsch Kern/Tief),
 * nicht "Im Bett" und nicht "Wach". Passt auf die HealthKit-Namen (…AsleepCore) und auf die
 * Texte, die der Kurzbefehl liefert.
 */
function isAsleepValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (/awake|wach|in ?bed|im bett/i.test(value)) return false;
  return /asleep|core|deep|rem|kern|tief|unspecified|nicht spezifiziert|schlaf/i.test(value);
}

/** Zeitstempel (ISO 8601 mit Offset oder Z) -> { ms, offsetMin } oder null. */
function parseStamp(s: string): { ms: number; offsetMin: number | null } | null {
  const ms = Date.parse(s.trim());
  if (!Number.isFinite(ms)) return null;
  const m = s.trim().match(/([+-])(\d{2}):?(\d{2})$/);
  if (m) return { ms, offsetMin: (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) };
  return { ms, offsetMin: /Z$/i.test(s.trim()) ? 0 : null };
}

/** Text "start|ende|wert" je Zeile oder Array von { start, end, value } -> Rohabschnitte. */
function toRaw(input: unknown): RawSample[] {
  if (Array.isArray(input)) {
    return (input as RawSample[]).filter((x) => x && typeof x.start === 'string' && typeof x.end === 'string');
  }
  if (typeof input !== 'string') return [];
  const out: RawSample[] = [];
  for (const line of input.split(/\r?\n/)) {
    const parts = line.split('|').map((p) => p.trim());
    if (parts.length >= 3 && parts[0] && parts[1]) out.push({ start: parts[0], end: parts[1], value: parts.slice(2).join('|') });
  }
  return out;
}

/**
 * Zahl aus dem Body. Der Kurzbefehl schickt Health-Werte je nach Feldtyp als Zahl oder als Text,
 * auch mit deutschem Komma oder Einheit ("52", "52,5", "52 count/min"); von Text wird die erste Zahl gelesen.
 */
function toNumber(n: unknown): number | null {
  if (typeof n === 'number') return Number.isFinite(n) ? n : null;
  if (typeof n !== 'string') return null;
  const m = n.match(/-?\d+(?:[.,]\d+)?/);
  if (!m) return null;
  const v = Number(m[0].replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

function numOrNull(n: unknown, min: number, max: number): number | null {
  const v = toNumber(n);
  if (v === null) return null;
  return v >= min && v <= max ? v : null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'Nur POST erlaubt' }, 405);

  const length = Number(req.headers.get('content-length') ?? '0');
  if (length > MAX_BODY_BYTES) return json({ ok: false, error: 'Anfrage zu groß' }, 413);

  // Authentifizierung: Import-Token (Kurzbefehl) oder Nutzer-JWT.
  // deno-lint-ignore no-explicit-any
  let supabase: any;
  let userFilter: string | null = null;
  const tokenGiven = req.headers.get('x-import-token');
  if (tokenGiven !== null) {
    if (!IMPORT_TOKEN || !IMPORT_USER_ID || !SERVICE_ROLE_KEY) {
      return json({ ok: false, error: 'IMPORT_TOKEN/IMPORT_USER_ID sind nicht als Secrets gesetzt' }, 500);
    }
    if (!safeEqual(tokenGiven, IMPORT_TOKEN)) return json({ ok: false, error: 'Ungültiges Token' }, 401);
    supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    userFilter = IMPORT_USER_ID; // Service-Rolle umgeht RLS, daher immer explizit auf den Nutzer einschränken
  } else {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ ok: false, error: 'Weder x-import-token noch Authorization-Header' }, 401);
    // Client mit dem JWT des Aufrufers: Row-Level-Security greift über auth.uid().
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, error: 'Ungültiges JSON' }, 400);
  }

  const date = typeof body.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : null;
  if (!date) return json({ ok: false, error: 'Ungültiges oder fehlendes Datum (YYYY-MM-DD erwartet)' }, 400);

  // Schlaf: Nacht, die am Datum endet.
  const sleepRaw = toRaw(body.sleep ?? body.sleep_samples);
  const segments: SleepSegment[] = [];
  const offsets: number[] = [];
  // Diagnose für den Kurzbefehl: warum Zeilen nicht zählen.
  const skippedValues = new Set<string>();
  let badStamps = 0;
  let badStampExample: string | null = null;
  for (const raw of sleepRaw) {
    if (!isAsleepValue(raw.value)) {
      if (skippedValues.size < 6) skippedValues.add(String(raw.value));
      continue;
    }
    const a = parseStamp(raw.start);
    const b = parseStamp(raw.end);
    if (!a || !b || b.ms <= a.ms) {
      badStamps++;
      if (badStampExample === null) badStampExample = `${raw.start} | ${raw.end}`;
      continue;
    }
    segments.push({ startMs: a.ms, endMs: b.ms, stage: sleepStageOf(raw.value) });
    if (b.offsetMin !== null) offsets.push(b.offsetMin);
  }
  // UTC-Offset: ausdrücklich angegeben, sonst der häufigste aus den Zeitstempeln, sonst UTC.
  const explicitOffset = numOrNull(body.tz_offset_min, -720, 840);
  const offsetMin =
    explicitOffset ??
    (offsets.length > 0
      ? offsets.sort((x, y) => offsets.filter((v) => v === y).length - offsets.filter((v) => v === x).length)[0]
      : 0);
  const night = segments.length > 0 ? sleepNightForDate(segments, date, offsetMin) : null;

  // HRV: Mittel der Messungen in der Nacht (bis 1 h nach dem Aufwachen); ohne Nacht alle gelieferten.
  let hrvMs = numOrNull(body.hrv_ms, 0, 300);
  if (hrvMs === null && body.hrv !== undefined) {
    const values: number[] = [];
    for (const raw of toRaw(body.hrv)) {
      const t = parseStamp(raw.start);
      const v = Number(raw.value);
      if (!t || !Number.isFinite(v) || v <= 0 || v > 300) continue;
      if (night && (t.ms < night.startMs || t.ms > night.endMs + POST_WAKE_MS)) continue;
      values.push(v);
    }
    if (values.length > 0) hrvMs = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  }
  const restingHr = numOrNull(body.resting_hr, 30, 120);
  const legacySleepHours = numOrNull(body.sleep_hours, 0, 16);

  // Tief-/REM-Spalten gibt es erst seit Migration 0018; ohne sie läuft der Import wie bisher weiter.
  const selectEntry = (columns: string) => {
    let q = supabase.from('fit_recovery_entries').select(columns).eq('date', date);
    if (userFilter) q = q.eq('user_id', userFilter);
    return q.maybeSingle();
  };
  const baseCols = 'id, hrv_ms, resting_hr, sleep_hours, sleep_start, source';
  let stageColumns = true;
  let { data: existing, error: selectError } = await selectEntry(`${baseCols}, deep_sleep_min, rem_sleep_min`);
  if (selectError && /deep_sleep_min|rem_sleep_min/.test(selectError.message)) {
    stageColumns = false;
    ({ data: existing, error: selectError } = await selectEntry(baseCols));
  }
  if (selectError) return json({ ok: false, error: selectError.message }, 500);
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const sleepHoursNew = night ? night.hours : legacySleepHours;
  const info = {
    night: night
      ? {
          start: new Date(night.startMs).toISOString(),
          end: new Date(night.endMs).toISOString(),
          hours: night.hours,
          deepMin: night.deepMin,
          remMin: night.remMin,
        }
      : null,
    sleepSegmentsUsed: segments.length,
    // Was angekommen ist: Zeilen insgesamt, nicht als Schlaf erkannte Werte, unlesbare Zeitstempel.
    received: {
      sleepLines: sleepRaw.length,
      sleepFieldType: body.sleep === undefined ? 'fehlt' : typeof body.sleep,
      ignoredValues: [...skippedValues],
      unreadableTimestamps: badStamps,
      unreadableExample: badStampExample,
      // Ruhepuls/HRV: Rohwert aus dem Body und was daraus gelesen wurde (null = nicht verwertbar).
      hrvRaw: body.hrv_ms ?? null,
      restingHrRaw: body.resting_hr ?? null,
      hrvParsed: hrvMs,
      restingHrParsed: restingHr,
      firstLine: sleepRaw[0] ? `${sleepRaw[0].start}|${sleepRaw[0].end}|${sleepRaw[0].value}` : null,
    },
  };

  if (!existing) {
    // Kein Auto-Anlegen: die PRS ist der tägliche, gewollt manuelle Kern des Recovery-Eintrags.
    // Die Werte kommen stattdessen in den Eingang (fit_recovery_health_inbox); die App überträgt
    // sie in den Eintrag, sobald er angelegt ist. So ist die Reihenfolge von Automation und PRS egal.
    const inboxRow: Record<string, number | string | null> = {
      date,
      hrv_ms: hrvMs,
      resting_hr: restingHr,
      sleep_hours: sleepHoursNew,
      sleep_start: night ? new Date(night.startMs).toISOString() : null,
      sleep_end: night ? new Date(night.endMs).toISOString() : null,
    };
    if (stageColumns && night) {
      inboxRow.deep_sleep_min = night.deepMin;
      inboxRow.rem_sleep_min = night.remMin;
    }
    if (userFilter) inboxRow.user_id = userFilter;
    if (hrvMs === null && restingHr === null && sleepHoursNew === null) {
      return json({ ok: true, dry, queued: false, note: 'Keine verwertbaren Werte geliefert', ...info });
    }
    if (dry) return json({ ok: true, dry, wouldQueue: inboxRow, ...info });
    const { error: inboxError } = await supabase
      .from('fit_recovery_health_inbox')
      .upsert(inboxRow, { onConflict: 'user_id,date' });
    if (inboxError) return json({ ok: false, error: inboxError.message }, 500);
    return json({ ok: true, queued: true, ...info });
  }

  const patch: Record<string, number | string> = {};
  if (existing.hrv_ms === null && hrvMs !== null) patch.hrv_ms = hrvMs;
  if (existing.resting_hr === null && restingHr !== null) patch.resting_hr = restingHr;

  const legacyStored = existing.sleep_hours !== null && existing.sleep_start === null && existing.source === 'apple_health';
  const sleepMissing = existing.sleep_hours === null || legacyStored;
  if (sleepMissing && night) {
    patch.sleep_hours = night.hours;
    patch.sleep_start = new Date(night.startMs).toISOString();
    patch.sleep_end = new Date(night.endMs).toISOString();
  } else if (existing.sleep_hours === null && legacySleepHours !== null) {
    patch.sleep_hours = legacySleepHours;
  }
  // Tief-/REM-Minuten nur ergänzen, wenn noch nichts da ist (auch für eine heute schon importierte Nacht).
  if (stageColumns && night) {
    if (existing.deep_sleep_min == null && night.deepMin !== null) patch.deep_sleep_min = night.deepMin;
    if (existing.rem_sleep_min == null && night.remMin !== null) patch.rem_sleep_min = night.remMin;
  }

  if (Object.keys(patch).length === 0) return json({ ok: true, dry, patched: [], ...info });
  if (dry) return json({ ok: true, dry, wouldPatch: patch, ...info });
  patch.source = 'apple_health';

  let update = supabase.from('fit_recovery_entries').update(patch).eq('id', existing.id as string);
  if (userFilter) update = update.eq('user_id', userFilter);
  const { error: updateError } = await update;
  if (updateError) return json({ ok: false, error: updateError.message }, 500);

  return json({ ok: true, patched: Object.keys(patch).filter((k) => k !== 'source'), ...info });
});
