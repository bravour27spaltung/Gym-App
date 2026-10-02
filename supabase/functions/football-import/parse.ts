// Reine Logik für die Edge Function football-import (kein Deno-/Browser-/DB-Zugriff),
// damit sie sich mit vitest testen lässt (src/lib/footballWatch.test.ts).
//
// Eingabe sind rohe Apple-Health-Messwerte, wie sie ein iOS-Kurzbefehl liefern kann.
// Kurzbefehle geben Health-Samples beim Einbetten in JSON nur als Text weiter, deshalb
// ist das Hauptformat eine Textzeile pro Messwert:
//
//     <Start>|<Ende>|<Wert>        z. B.  2026-10-01T19:14:03+02:00|2026-10-01T19:14:03+02:00|128 count/min
//
// (Ende darf fehlen: "<Start>|<Wert>".) Alternativ ein JSON-Array aus Objekten
// { start, end?, value }. Datumsangaben brauchen eine Zeitzone (Z oder ±HH:MM bzw.
// ±HHMM): ohne sie ließe sich der Zeitpunkt nicht eindeutig bestimmen, die Zeile wird
// deshalb als ungültig gezählt, statt still falsch eingeordnet zu werden.

export interface Sample {
  startMs: number;
  endMs: number;
  value: number;
}

export interface ParsedSamples {
  samples: Sample[];
  /** Zeilen/Einträge, die nicht gelesen werden konnten (unbekanntes Format, Datum ohne Zeitzone, …). */
  invalid: number;
}

export interface WatchWindow {
  startedAt: string;
  endedAt: string;
  hrSamples: number;
  avgHeartRate: number;
  maxHeartRate: number;
  steps: number | null;
  distanceKm: number | null;
}

export interface SkippedWindow {
  startedAt: string;
  endedAt: string;
  reason: string;
}

export interface DetectOptions {
  /** Ab dieser Lücke zwischen zwei Herzfrequenz-Messwerten beginnt ein neues Fenster. */
  gapMs: number;
  minDurationMs: number;
  maxDurationMs: number;
  minHrSamples: number;
}

/**
 * Ohne aktive Aufzeichnung versucht die Uhr laut Apple etwa alle 5 Minuten einen
 * Herzfrequenzwert zu liefern (Apple Whitepaper "Using Apple Watch to measure heart
 * rate, calorimetry, and activity", 11/2024). 45 Minuten Lücke trennen daher sicher zwei
 * Einheiten, ohne eine einzelne Einheit mit ein paar fehlenden Werten zu zerreißen.
 */
export const DEFAULT_DETECT_OPTIONS: DetectOptions = {
  gapMs: 45 * 60_000,
  minDurationMs: 20 * 60_000,
  maxDurationMs: 4 * 3_600_000,
  minHrSamples: 3,
};

const HR_MIN = 30;
const HR_MAX = 220;

const DATE_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?\s*(Z|[+-]\d{2}:?\d{2})$/;

/** ISO-8601-ähnliches Datum mit Zeitzone -> Millisekunden; null bei unbekanntem Format oder ohne Zeitzone. */
export function parseDateWithZone(input: unknown): number | null {
  if (typeof input !== 'string') return null;
  const m = input.trim().match(DATE_RE);
  if (!m) return null;
  const [, date, rawTime, rawZone] = m;
  const time = rawTime.length === 5 ? `${rawTime}:00` : rawTime;
  let zone = rawZone;
  if (zone !== 'Z' && !zone.includes(':')) zone = `${zone.slice(0, 3)}:${zone.slice(3)}`;
  const ms = Date.parse(`${date}T${time}${zone}`);
  return Number.isFinite(ms) ? ms : null;
}

/** Erste Zahl aus einem Text wie "128 count/min", "0,42 km" oder "1.234,5"; null ohne Zahl. */
export function parseNumber(text: unknown): number | null {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const m = text.match(/[-+]?\d[\d.,]*/);
  if (!m) return null;
  let s = m[0].replace(/[.,]+$/, '');
  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  if (lastDot !== -1 && lastComma !== -1) {
    // Beide Zeichen: das hintere ist das Dezimaltrennzeichen, das andere Tausendertrenner.
    const decimal = lastDot > lastComma ? '.' : ',';
    const thousands = decimal === '.' ? ',' : '.';
    s = s.split(thousands).join('').replace(decimal, '.');
  } else if (lastComma !== -1) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Faktor, um einen Distanztext auf Kilometer umzurechnen; ohne Einheit gilt km (wie im Export-Import der App). */
export function distanceFactorToKm(text: unknown): number {
  if (typeof text !== 'string') return 1;
  const t = text.toLowerCase();
  if (/\d\s*km\b|kilomet/.test(t)) return 1;
  if (/\d\s*mi\b|\bmile/.test(t)) return 1.609344;
  if (/\d\s*m\b|\bmeter|\bmetre/.test(t)) return 0.001;
  return 1;
}

export type SampleKind = 'hr' | 'steps' | 'distance';

function toSample(start: unknown, end: unknown, value: unknown, kind: SampleKind): Sample | null {
  const startMs = parseDateWithZone(start);
  if (startMs === null) return null;
  let endMs = startMs;
  if (end !== undefined && end !== null && !(typeof end === 'string' && end.trim() === '')) {
    const parsedEnd = parseDateWithZone(end);
    if (parsedEnd === null) return null;
    endMs = Math.max(startMs, parsedEnd);
  }
  let v = parseNumber(value);
  if (v === null) return null;
  if (kind === 'distance') v *= distanceFactorToKm(value);
  return { startMs, endMs, value: v };
}

/** Liest Textzeilen oder ein JSON-Array in Samples; Unlesbares wird gezählt, nie still verworfen. */
export function parseSamples(input: unknown, kind: SampleKind): ParsedSamples {
  const samples: Sample[] = [];
  let invalid = 0;

  if (input === undefined || input === null || input === '') return { samples, invalid };

  if (Array.isArray(input)) {
    for (const item of input) {
      const obj = item as { start?: unknown; end?: unknown; value?: unknown } | null;
      const s = obj && typeof obj === 'object' ? toSample(obj.start, obj.end, obj.value, kind) : null;
      if (s) samples.push(s);
      else invalid += 1;
    }
    return { samples, invalid };
  }

  if (typeof input !== 'string') return { samples, invalid: 1 };

  for (const rawLine of input.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '') continue;
    const parts = line.split(/[|;\t]/).map((p) => p.trim());
    let s: Sample | null = null;
    if (parts.length >= 3) s = toSample(parts[0], parts[1], parts.slice(2).join(' '), kind);
    else if (parts.length === 2) s = toSample(parts[0], undefined, parts[1], kind);
    if (s) samples.push(s);
    else invalid += 1;
  }
  return { samples, invalid };
}

const iso = (ms: number): string => new Date(ms).toISOString();

function sumInWindow(samples: Sample[], fromMs: number, toMs: number): number | null {
  let total = 0;
  let count = 0;
  for (const s of samples) {
    if (s.startMs < fromMs || s.startMs >= toMs) continue;
    total += s.value;
    count += 1;
  }
  return count > 0 ? total : null;
}

/**
 * Erkennt Trainingsfenster aus den Herzfrequenz-Messwerten: Die Uhr wird nur im Training
 * getragen, also bilden zusammenhängende Messwerte (Lücke < gapMs) eine Einheit. Start =
 * erster, Ende = letzter Messwert. Schritte und Distanz werden über die Startzeiten der
 * Samples im Fenster [Start, Ende) summiert; ohne Samples im Fenster bleiben sie null.
 *
 * Grenzen (bewusst nicht kaschiert): Bei seltener Messung liegt der erste/letzte Wert
 * einige Minuten nach dem echten Beginn bzw. vor dem echten Ende; die Dauer ist also
 * eine leichte Unterschätzung, und Schritte/Distanz am Rand fehlen. Fenster außerhalb
 * von Mindest-/Höchstdauer oder mit zu wenigen Messwerten werden mit Grund gemeldet statt
 * stillschweigend angelegt (z. B. Uhr den ganzen Tag getragen).
 */
export function detectWindows(
  hr: Sample[],
  steps: Sample[],
  distance: Sample[],
  options: DetectOptions = DEFAULT_DETECT_OPTIONS,
): { windows: WatchWindow[]; skipped: SkippedWindow[] } {
  const valid = hr
    .filter((s) => s.value >= HR_MIN && s.value <= HR_MAX)
    .sort((a, b) => a.startMs - b.startMs);

  const clusters: Sample[][] = [];
  for (const s of valid) {
    const current = clusters[clusters.length - 1];
    const last = current?.[current.length - 1];
    if (current && last && s.startMs - last.endMs < options.gapMs) current.push(s);
    else clusters.push([s]);
  }

  const windows: WatchWindow[] = [];
  const skipped: SkippedWindow[] = [];

  for (const c of clusters) {
    const startMs = c[0].startMs;
    const endMs = c.reduce((max, s) => Math.max(max, s.endMs, s.startMs), startMs);
    const base = { startedAt: iso(startMs), endedAt: iso(endMs) };
    const duration = endMs - startMs;

    if (c.length < options.minHrSamples) {
      skipped.push({ ...base, reason: `zu wenige Herzfrequenz-Messwerte (${c.length})` });
      continue;
    }
    if (duration < options.minDurationMs) {
      skipped.push({ ...base, reason: `zu kurz (${Math.round(duration / 60_000)} min)` });
      continue;
    }
    if (duration > options.maxDurationMs) {
      skipped.push({ ...base, reason: `zu lang (${Math.round(duration / 60_000)} min, Uhr länger getragen?)` });
      continue;
    }

    const values = c.map((s) => s.value);
    const avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
    const max = Math.round(Math.max(...values));
    const stepSum = sumInWindow(steps, startMs, endMs);
    const distSum = sumInWindow(distance, startMs, endMs);

    windows.push({
      ...base,
      hrSamples: c.length,
      avgHeartRate: avg,
      maxHeartRate: max,
      steps: stepSum === null ? null : Math.round(stepSum),
      distanceKm: distSum === null ? null : Math.round(distSum * 100) / 100,
    });
  }

  return { windows, skipped };
}
