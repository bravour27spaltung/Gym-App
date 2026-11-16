// Reine Logik für die Edge Function football-import (kein Deno-/Browser-/DB-Zugriff),
// damit sie sich mit vitest testen lässt (src/lib/footballWatch.test.ts).
//
// Eingabe sind Apple-Health-Werte, wie sie ein iOS-Kurzbefehl liefern kann: bevorzugt fertige
// Zahlen für den Zeitraum (avg_hr, max_hr, …), als Rückfall rohe Messwerte. Kurzbefehle geben
// Health-Samples beim Einbetten in JSON nur als Text weiter, deshalb ist das Rohformat eine
// Textzeile pro Messwert:
//
//     <Start>|<Ende>|<Wert>        z. B.  2026-10-01T19:14:03+02:00|2026-10-01T19:14:03+02:00|128 count/min
//
// (Ende darf fehlen: "<Start>|<Wert>".) Alternativ ein JSON-Array aus Objekten
// { start, end?, value } oder aus solchen Textzeilen. Datumsangaben brauchen eine Zeitzone
// (Z oder ±HH:MM bzw. ±HHMM): ohne sie ließe sich der Zeitpunkt nicht eindeutig bestimmen,
// die Zeile wird deshalb als ungültig gezählt, statt still falsch eingeordnet zu werden.

export interface Sample {
  startMs: number;
  endMs: number;
  value: number;
  /** Name der Health-Quelle (z. B. "Apple Watch von Steffen"), falls der Kurzbefehl sie mitschickt. */
  source?: string;
}

export interface ParsedSamples {
  samples: Sample[];
  /** Zeilen/Einträge, die nicht gelesen werden konnten (unbekanntes Format, Datum ohne Zeitzone, …). */
  invalid: number;
}

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

/** Faktor auf Kilokalorien; kJ (Kilojoule) wird umgerechnet, ohne Einheit gilt kcal. */
export function energyFactorToKcal(text: unknown): number {
  if (typeof text !== 'string') return 1;
  return /\d\s*kj\b|kilojoule/i.test(text) ? 1 / 4.184 : 1;
}

export type SampleKind = 'hr' | 'steps' | 'distance' | 'energy';

function toSample(start: unknown, end: unknown, value: unknown, kind: SampleKind, source?: string): Sample | null {
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
  if (kind === 'energy') v *= energyFactorToKcal(value);
  return source ? { startMs, endMs, value: v, source } : { startMs, endMs, value: v };
}

/** Liest Textzeilen oder ein JSON-Array in Samples; Unlesbares wird gezählt, nie still verworfen. */
export function parseSamples(input: unknown, kind: SampleKind): ParsedSamples {
  const samples: Sample[] = [];
  let invalid = 0;

  if (input === undefined || input === null || input === '') return { samples, invalid };

  if (Array.isArray(input)) {
    // Kurzbefehle schicken das Ergebnis von „Wiederholen mit jedem“ als Liste von Textzeilen
    // („Start|Ende|Wert“); jeder String wird deshalb wie eine Textzeile gelesen.
    for (const item of input) {
      if (typeof item === 'string') {
        const sub = parseSamples(item, kind);
        samples.push(...sub.samples);
        invalid += sub.invalid;
        continue;
      }
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
    if (parts.length >= 4) s = toSample(parts[0], parts[1], parts[2], kind, parts.slice(3).join(' '));
    else if (parts.length === 3 && parseDateWithZone(parts[1]) === null) s = toSample(parts[0], undefined, parts[1], kind, parts[2]);
    else if (parts.length === 3) s = toSample(parts[0], parts[1], parts[2], kind);
    else if (parts.length === 2) s = toSample(parts[0], undefined, parts[1], kind);
    if (s) samples.push(s);
    else invalid += 1;
  }
  return { samples, invalid };
}

// ---------------------------------------------------------------------------------------------
// Zeitraum-Ergebnis (Neustart des Imports)
//
// Der Kurzbefehl liefert für den in der App gewählten Zeitraum entweder fertige Zahlen
// (avg_hr, max_hr, hr_count, steps_total, distance_km) oder, als Rückfall, Rohzeilen (hr, steps,
// distance), die hier im Zeitraum ausgewertet werden. Zusätzlich kommt der Zeitraum selbst als
// "range": "<Start>|<Ende>", unverändert aus der Kurzbefehl-Eingabe zurückgereicht (so muss der
// Kurzbefehl kein Datum umformatieren).
// ---------------------------------------------------------------------------------------------

export interface RangeResult {
  hrSamples: number;
  avgHeartRate: number | null;
  maxHeartRate: number | null;
  steps: number | null;
  distanceKm: number | null;
  /** Aktive Energie in kcal. */
  energyKcal: number | null;
}

export type RangeSource = 'values' | 'raw' | 'mixed' | 'none';

export type BuiltRange =
  | {
      ok: true;
      fromMs: number;
      toMs: number;
      result: RangeResult;
      source: RangeSource;
      /** Nicht lesbare Zeilen/Werte (unbekanntes Format, unplausible Zahl), nie still verworfen. */
      invalid: number;
    }
  | { ok: false; error: string };

export const MAX_RANGE_MS = 24 * 3_600_000;

/** "<Start>|<Ende>" (auch ; oder Zeilenumbruch als Trenner) oder die Felder from/to -> Millisekunden. */
export function parseRange(body: Record<string, unknown>): { fromMs: number; toMs: number } | null {
  let a: unknown = body.from;
  let b: unknown = body.to;
  if (typeof body.range === 'string') {
    const parts = body.range.split(/[|;\n]/).map((p) => p.trim()).filter((p) => p !== '');
    if (parts.length === 2) [a, b] = parts;
  }
  const fromMs = parseDateWithZone(a);
  const toMs = parseDateWithZone(b);
  if (fromMs === null || toMs === null || toMs <= fromMs) return null;
  return { fromMs, toMs };
}

/**
 * Summe von Intervall-Samples (Schritte, Distanz, Energie) im Zeitraum. Ein Sample, das die Grenze überlappt,
 * zählt anteilig nach Überlappung (Annahme: gleichmäßig verteilt); ohne Dauer zählt der Startzeitpunkt.
 * Schicken die Zeilen eine Quelle mit und kommt eine davon aus einer „Watch“, zählt nur die Watch: iPhone und
 * Watch erfassen Schritte und Distanz beide und würden sonst doppelt gezählt.
 */
export function sumInRange(samples: Sample[], fromMs: number, toMs: number): number | null {
  const usable = samples.filter((s) => s.value >= 0);
  const watch = usable.filter((s) => s.source !== undefined && /watch/i.test(s.source));
  const pool = watch.length > 0 ? watch : usable;
  let total = 0;
  let used = 0;
  for (const s of pool) {
    if (s.endMs > s.startMs) {
      const overlap = Math.min(s.endMs, toMs) - Math.max(s.startMs, fromMs);
      if (overlap <= 0) continue;
      total += (s.value * overlap) / (s.endMs - s.startMs);
    } else if (s.startMs >= fromMs && s.startMs < toMs) {
      total += s.value;
    } else continue;
    used += 1;
  }
  return used > 0 ? total : null;
}

/**
 * Wertet Rohwerte für [fromMs, toMs] aus: Ø/Max-Puls aus den Herzfrequenz-Messwerten (nur 30–220 bpm),
 * Schritte, Distanz und aktive Energie als Summe (siehe sumInRange). Ohne passende Werte bleibt das Feld null.
 * Der Puls-Mittelwert ist der einfache Mittelwert der Einzelmessungen, nicht zeitgewichtet.
 */
export function summarizeRange(
  hr: Sample[],
  steps: Sample[],
  distance: Sample[],
  fromMs: number,
  toMs: number,
  energy: Sample[] = [],
): RangeResult {
  const bpm = hr
    .filter((s) => s.startMs >= fromMs && s.startMs < toMs && s.value >= HR_MIN && s.value <= HR_MAX)
    .map((s) => s.value);
  const stepsSum = sumInRange(steps, fromMs, toMs);
  const distSum = sumInRange(distance, fromMs, toMs);
  const energySum = sumInRange(energy, fromMs, toMs);
  return {
    hrSamples: bpm.length,
    avgHeartRate: bpm.length > 0 ? Math.round(bpm.reduce((x, y) => x + y, 0) / bpm.length) : null,
    maxHeartRate: bpm.length > 0 ? Math.round(Math.max(...bpm)) : null,
    steps: stepsSum === null ? null : Math.round(stepsSum),
    distanceKm: distSum === null ? null : Math.round(distSum * 100) / 100,
    energyKcal: energySum === null ? null : Math.round(energySum),
  };
}

/** Zahl aus Zahl oder Text ("132", "132,5", "132 count/min"); null bei leer/unlesbar. */
function numberField(v: unknown): number | null {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return null;
  return parseNumber(v);
}

/**
 * Zählwert (Schritte, Anzahl Messwerte): ganze Zahl. Ein Punkt oder Komma vor genau drei Ziffern ist hier
 * ein Tausendertrenner ("6.200" und "6,200" sind 6200), anders als bei Dezimalwerten, wo "6.200" 6,2 hieße.
 */
function countField(v: unknown): number | null {
  if (typeof v === 'string') {
    const m = v.match(/\d[\d.,]*/);
    const t = m ? m[0].replace(/[.,]+$/, '') : '';
    if (/^\d{1,3}([.,]\d{3})+$/.test(t)) return Number(t.replace(/[.,]/g, ''));
  }
  return numberField(v);
}

const RAW_FIELDS = ['hr', 'steps', 'distance', 'energy'] as const;

/**
 * Typischer Verdrahtungsfehler im Kurzbefehl: Herzfrequenz und Distanz bekommen dieselbe Variable. Dann
 * stünden Distanzwerte als Puls in der Datenbank, deshalb ablehnen statt Unsinn zu speichern.
 */
export function findIdenticalFields(body: Record<string, unknown>): string | null {
  for (let i = 0; i < RAW_FIELDS.length; i++) {
    for (let j = i + 1; j < RAW_FIELDS.length; j++) {
      const a = body[RAW_FIELDS[i]];
      if (typeof a === 'string' && a.trim() !== '' && a === body[RAW_FIELDS[j]]) {
        return (
          `Die Felder ${RAW_FIELDS[i]} und ${RAW_FIELDS[j]} sind identisch. Im Kurzbefehl ist dieselbe Variable ` +
          'doppelt belegt: Herzfrequenz, Schritte, Distanz und Energie brauchen je ihre eigene Zeilenliste.'
        );
      }
    }
  }
  return null;
}

/**
 * Baut das Ergebnis für einen Zeitraum aus dem Body. Fertige Zahlen haben Vorrang je Feld, Rohzeilen
 * füllen den Rest. Unplausible Werte (Puls außerhalb 30–220, negative Zahlen, Distanz über 100 km)
 * werden nicht übernommen und als `invalid` gezählt.
 */
export function buildRangeResult(body: Record<string, unknown>): BuiltRange {
  const range = parseRange(body);
  if (!range) {
    const shown = typeof body.range === 'string' ? ` Erhalten: "${body.range.slice(0, 80)}".` : ' Feld "range" fehlt.';
    return {
      ok: false,
      error: `Zeitraum nicht lesbar. Erwartet "range": "<Start>|<Ende>" (ISO 8601 mit Z oder Offset, Ende nach Start).${shown}`,
    };
  }
  if (range.toMs - range.fromMs > MAX_RANGE_MS) {
    return { ok: false, error: 'Zeitraum länger als 24 Stunden' };
  }

  const identical = findIdenticalFields(body);
  if (identical) return { ok: false, error: identical };

  let invalid = 0;
  const pick = (v: unknown, min: number, max: number, read: (x: unknown) => number | null = numberField): number | null => {
    const n = read(v);
    if (n === null) {
      if (v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '')) invalid += 1;
      return null;
    }
    if (n < min || n > max) {
      invalid += 1;
      return null;
    }
    return n;
  };

  const avg = pick(body.avg_hr, HR_MIN, HR_MAX);
  const max = pick(body.max_hr, HR_MIN, HR_MAX);
  const count = pick(body.hr_count, 0, 100_000, countField);
  const stepsTotal = pick(body.steps_total, 0, 200_000, countField);
  let distanceKm: number | null = null;
  const rawDistance = body.distance_km;
  if (rawDistance !== undefined && rawDistance !== null && !(typeof rawDistance === 'string' && rawDistance.trim() === '')) {
    const n = numberField(rawDistance);
    const km = n === null ? null : n * distanceFactorToKm(rawDistance);
    if (km === null || km < 0 || km > 100) invalid += 1;
    else distanceKm = Math.round(km * 100) / 100;
  }

  const energyTotal = pick(body.energy_kcal, 0, 20_000);

  const hasValues = avg !== null || max !== null || stepsTotal !== null || distanceKm !== null || energyTotal !== null;

  const hr = parseSamples(body.hr, 'hr');
  const steps = parseSamples(body.steps, 'steps');
  const distance = parseSamples(body.distance, 'distance');
  const energy = parseSamples(body.energy, 'energy');
  invalid += hr.invalid + steps.invalid + distance.invalid + energy.invalid;
  const hasRaw = hr.samples.length + steps.samples.length + distance.samples.length + energy.samples.length > 0;
  const raw = hasRaw
    ? summarizeRange(hr.samples, steps.samples, distance.samples, range.fromMs, range.toMs, energy.samples)
    : null;

  const result: RangeResult = {
    hrSamples: count !== null ? Math.round(count) : (raw?.hrSamples ?? 0),
    avgHeartRate: avg !== null ? Math.round(avg) : (raw?.avgHeartRate ?? null),
    maxHeartRate: max !== null ? Math.round(max) : (raw?.maxHeartRate ?? null),
    steps: stepsTotal !== null ? Math.round(stepsTotal) : (raw?.steps ?? null),
    distanceKm: distanceKm !== null ? distanceKm : (raw?.distanceKm ?? null),
    energyKcal: energyTotal !== null ? Math.round(energyTotal) : (raw?.energyKcal ?? null),
  };
  // Distanz aus Rohzeilen: Ein Fußballzeitraum (höchstens 24 h) kommt nie auf über 100 km. Kommt das heraus,
  // stehen die Zeilenwerte meist in Metern statt Kilometern (Einheit in der Health-Suche nicht auf Kilometer).
  if (distanceKm === null && result.distanceKm !== null && result.distanceKm > 100) {
    return {
      ok: false,
      error: `Distanz ${result.distanceKm} km ist unplausibel. Stehen die Distanzwerte im Kurzbefehl in Metern? In "Health-Messungen suchen" die Einheit auf Kilometer stellen.`,
    };
  }
  // Ø darf nicht über Max liegen (vertauschte Felder im Kurzbefehl würden sonst still falsche Werte speichern).
  if (result.avgHeartRate !== null && result.maxHeartRate !== null && result.avgHeartRate > result.maxHeartRate) {
    return { ok: false, error: `avg_hr (${result.avgHeartRate}) liegt über max_hr (${result.maxHeartRate}): Felder im Kurzbefehl vertauscht?` };
  }

  const rawUsed = raw !== null && (raw.avgHeartRate !== null || raw.steps !== null || raw.distanceKm !== null || raw.energyKcal !== null);
  const source: RangeSource = hasValues && rawUsed ? 'mixed' : hasValues ? 'values' : rawUsed ? 'raw' : 'none';
  return { ok: true, fromMs: range.fromMs, toMs: range.toMs, result, source, invalid };
}

/** Klartext für die Antwort an den Kurzbefehl ("Ergebnis anzeigen"): was wurde gespeichert. */
export function describeRangeResult(r: RangeResult): string {
  const parts: string[] = [];
  if (r.avgHeartRate !== null) {
    const max = r.maxHeartRate !== null ? ` / max ${r.maxHeartRate}` : '';
    parts.push(`Ø ${r.avgHeartRate}${max} bpm (${r.hrSamples} Messwerte)`);
  }
  if (r.distanceKm !== null) parts.push(`${r.distanceKm.toLocaleString('de-DE', { maximumFractionDigits: r.distanceKm < 1 ? 2 : 1 })} km`);
  if (r.steps !== null) parts.push(`${r.steps.toLocaleString('de-DE')} Schritte`);
  if (r.energyKcal !== null) parts.push(`${r.energyKcal.toLocaleString('de-DE')} kcal aktiv`);
  return parts.length > 0
    ? `Gespeichert: ${parts.join(' · ')}`
    : 'Angekommen, aber ohne Werte: Health hat für den Zeitraum nichts geliefert (Berechtigungen, entsperrtes iPhone, Quelle Apple Watch prüfen).';
}

// ---------------------------------------------------------------------------------------------
// Archiv (Migration 0022): Rohwerte ohne Zeitraum dauerhaft ablegen
//
// Der Kurzbefehl erreicht in Health nur die neuesten ~250 Werte. Läuft er automatisch (z. B. abends), schickt er
// diese Werte ohne "range"; sie werden hier geprüft, dedupliziert und von der Funktion in fit_health_samples
// geschrieben. Die App rechnet daraus später jeden beliebigen Zeitraum (summarizeRange, dieselbe Logik wie oben).
// ---------------------------------------------------------------------------------------------

export interface ArchiveRow {
  kind: SampleKind;
  startMs: number;
  endMs: number;
  value: number;
  /** Health-Quelle, '' wenn der Kurzbefehl keine mitschickt. */
  source: string;
}

export type BuiltArchive =
  | {
      ok: true;
      rows: ArchiveRow[];
      /** Nicht lesbare oder unplausible Zeilen, nie still verworfen. */
      invalid: number;
      /** Bereits im selben Aufruf vorhandene Dopplungen (gleiche Art/Zeit/Quelle), zusammengeführt. */
      duplicates: number;
      counts: Record<SampleKind, number>;
      oldestHrMs: number | null;
      newestHrMs: number | null;
    }
  | { ok: false; error: string };

/** Obergrenze je Aufruf (der Kurzbefehl schickt ~250 Werte je Art); schützt vor einem versehentlich riesigen Body. */
export const MAX_ARCHIVE_ROWS = 5000;
/** Ein einzelnes Intervall-Sample länger als das ist kein Messwert, sondern ein Verdrahtungsfehler. */
const MAX_SAMPLE_SPAN_MS = 24 * 3_600_000;
/** Zeitstempel weiter in der Zukunft als das gelten als falsch (Uhr/Zeitzone im Kurzbefehl). */
const FUTURE_TOLERANCE_MS = 10 * 60_000;

const ARCHIVE_LIMITS: Record<SampleKind, [number, number]> = {
  hr: [HR_MIN, HR_MAX],
  steps: [0, 200_000],
  distance: [0, 100],
  energy: [0, 20_000],
};

/**
 * Prüft die Rohzeilen (hr, steps, distance, energy) eines Archiv-Aufrufs und macht daraus Zeilen für die Datenbank.
 * Unplausible Werte (Puls außerhalb 30–220, negative Zahlen, Distanz über 100 km, Zeitstempel in der Zukunft,
 * Intervalle über 24 h) werden nicht gespeichert, sondern als `invalid` gezählt.
 */
export function buildArchive(body: Record<string, unknown>, nowMs: number): BuiltArchive {
  const identical = findIdenticalFields(body);
  if (identical) return { ok: false, error: identical };

  let invalid = 0;
  const byKey = new Map<string, ArchiveRow>();
  const counts: Record<SampleKind, number> = { hr: 0, steps: 0, distance: 0, energy: 0 };
  let duplicates = 0;
  let total = 0;

  for (const kind of RAW_FIELDS) {
    const parsed = parseSamples(body[kind], kind);
    invalid += parsed.invalid;
    for (const s of parsed.samples) {
      total += 1;
      const [min, max] = ARCHIVE_LIMITS[kind];
      if (
        s.value < min ||
        s.value > max ||
        s.endMs - s.startMs > MAX_SAMPLE_SPAN_MS ||
        s.startMs > nowMs + FUTURE_TOLERANCE_MS ||
        s.endMs > nowMs + FUTURE_TOLERANCE_MS
      ) {
        invalid += 1;
        continue;
      }
      const source = s.source ?? '';
      const key = `${kind}|${s.startMs}|${s.endMs}|${source}`;
      if (byKey.has(key)) duplicates += 1;
      else counts[kind] += 1;
      byKey.set(key, { kind, startMs: s.startMs, endMs: s.endMs, value: s.value, source });
    }
  }
  if (total > MAX_ARCHIVE_ROWS) return { ok: false, error: `Zu viele Werte in einem Aufruf (${total}, erlaubt ${MAX_ARCHIVE_ROWS})` };

  const rows = [...byKey.values()];
  const hrTimes = rows.filter((r) => r.kind === 'hr').map((r) => r.startMs);
  return {
    ok: true,
    rows,
    invalid,
    duplicates,
    counts,
    oldestHrMs: hrTimes.length > 0 ? Math.min(...hrTimes) : null,
    newestHrMs: hrTimes.length > 0 ? Math.max(...hrTimes) : null,
  };
}

/** Ab dieser Lücke zwischen dem zuletzt archivierten und dem ältesten neuen Pulswert gibt es einen Hinweis. */
export const ARCHIVE_GAP_MS = 30 * 60_000;

/**
 * Hinweis auf eine Lücke im Archiv: Der älteste Pulswert dieses Aufrufs liegt deutlich NACH dem zuletzt gespeicherten.
 * Dann reichten die ~250 Werte nicht bis zum letzten Lauf zurück (Kurzbefehl lief zu selten), oder die Uhr lag in der
 * Zeit nicht am Handgelenk. Aus den Daten allein lässt sich beides nicht unterscheiden; der Text sagt das so.
 * null, wenn nichts auffällt (oder noch nichts gespeichert war).
 */
export function archiveGap(lastStoredHrMs: number | null, oldestHrMs: number | null): { fromMs: number; toMs: number } | null {
  if (lastStoredHrMs === null || oldestHrMs === null) return null;
  return oldestHrMs - lastStoredHrMs > ARCHIVE_GAP_MS ? { fromMs: lastStoredHrMs, toMs: oldestHrMs } : null;
}

const clock = (ms: number): string =>
  new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

/** Klartext für die Antwort an den Kurzbefehl: was ist archiviert, wie weit reicht es zurück, gibt es eine Lücke. */
export function describeArchive(a: Extract<BuiltArchive, { ok: true }>, gap: { fromMs: number; toMs: number } | null, dry: boolean): string {
  const total = a.rows.length;
  if (total === 0) {
    return 'Angekommen, aber ohne verwertbare Werte: Health hat nichts geliefert oder alles war unlesbar' +
      (a.invalid > 0 ? ` (${a.invalid} Zeilen ungültig).` : ' (Berechtigungen, entsperrtes iPhone, Quelle prüfen).');
  }
  const parts = [`${a.counts.hr} Puls`, `${a.counts.steps} Schritte`, `${a.counts.distance} Distanz`, `${a.counts.energy} Energie`];
  let msg = `${dry ? 'Würde archivieren' : 'Archiviert'}: ${parts.join(' · ')}.`;
  if (a.oldestHrMs !== null && a.newestHrMs !== null) msg += ` Pulswerte von ${clock(a.oldestHrMs)} bis ${clock(a.newestHrMs)}.`;
  if (a.invalid > 0) msg += ` ${a.invalid} ungültige Zeilen übersprungen.`;
  if (gap) {
    msg +=
      ` Hinweis: zwischen ${clock(gap.fromMs)} und ${clock(gap.toMs)} fehlen Pulswerte im Archiv. Entweder lag die Uhr nicht ` +
      'am Handgelenk, oder der Kurzbefehl lief zu selten (die ~250 neuesten Werte reichten nicht bis zum letzten Lauf zurück).';
  }
  return msg;
}
