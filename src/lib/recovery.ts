import { newId } from './workout';

/**
 * Recovery: eigener, bewusst einfacher Bereich – ein Eintrag pro Tag (Datum = Tag des
 * Aufwachens), im Kern eine Ein-Item-Skala (Perceived Recovery Status), dazu optional drei
 * kurze Wellness-Items und Health-Werte aus Apple Health (HRV, Ruhepuls, Schlafdauer samt
 * Nachtfenster). Dieses Modul enthält Eingabe und Speicherformat; die Auswertung steht in
 * recoveryAnalysis.ts, die Zuordnung des Schlafs zur Nacht in sleep.ts. Reine Logik ohne
 * Browser- oder Datenbankzugriff, damit sie sich testen lässt und offline funktioniert.
 *
 * PRS (Laurent et al. 2011, J Strength Cond Res) ist eine Ein-Item-Skala 0–10, die in Sekunden
 * ausgefüllt ist. Subjektive Marker wie diese reagierten in einem systematischen Review
 * sensitiver auf Trainingsbelastung als objektive wie HRV oder Ruhepuls (Saw, Main & Gastin
 * 2016, Br J Sports Med); beide Datenarten ergänzen sich.
 */

export type RecoverySource = 'manual' | 'apple_health';

/** Anker der PRS-Skala (Laurent et al. 2011), zur Anzeige unter der Auswahl. */
const PRS_ANCHORS: Record<number, string> = {
  0: 'Extrem müde, keine Erholung',
  2: 'Sehr schlecht erholt',
  4: 'Etwas erholt',
  6: 'Ausreichend erholt',
  8: 'Gut erholt',
  10: 'Vollständig erholt',
};

/** Textanker zur nächstgelegenen Stufe (0, 2, 4, 6, 8 oder 10). */
export function prsAnchor(value: number): string {
  const nearest = Math.max(0, Math.min(10, Math.round(value / 2) * 2));
  return PRS_ANCHORS[nearest] ?? '';
}

export interface RecoveryEntryInput {
  /** Datum im Format "YYYY-MM-DD". */
  date: string;
  /** Perceived Recovery Status, 0-10. */
  perceivedRecovery: number;
  soreness?: number | null;
  stress?: number | null;
  sleepQuality?: number | null;
  note: string;
  /** Aus einem Apple-Health-Export übernommen oder manuell eingetragen; alle optional. */
  hrvMs?: number | null;
  restingHr?: number | null;
  sleepHours?: number | null;
  /** Beginn/Ende der Nacht (ISO), wenn die Schlafdauer aus Apple Health stammt. */
  sleepStart?: string | null;
  sleepEnd?: string | null;
  /** Minuten in Tief- bzw. REM-Schlaf, nur zusammen mit einem Nachtfenster aus Apple Health. */
  deepSleepMin?: number | null;
  remSleepMin?: number | null;
  source?: RecoverySource;
}

export interface RecoveryPayload {
  entry: {
    id: string;
    date: string;
    perceived_recovery: number;
    soreness: number | null;
    stress: number | null;
    sleep_quality: number | null;
    note: string | null;
    hrv_ms: number | null;
    resting_hr: number | null;
    sleep_hours: number | null;
    /** Nur gesetzt, wenn ein Nachtfenster vorliegt (Migration 0016); sonst weggelassen. */
    sleep_start?: string;
    sleep_end?: string;
    /** Erst seit Migration 0018; nur gesetzt, wenn bekannt. */
    deep_sleep_min?: number;
    rem_sleep_min?: number;
    source: RecoverySource;
  };
}

/** Ganzzahl im Bereich 1-5 oder null bei ungültiger/fehlender Eingabe. */
function scale1to5(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 1 && r <= 5 ? r : null;
}

function nonNegOrNull(n: number | null | undefined, max: number): number | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

function restingHrOrNull(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 30 && r <= 120 ? r : null;
}

/** Gültiges Nachtfenster (Ende nach Beginn, höchstens 16 h) als ISO-Strings, sonst null. */
function validWindow(start: string | null | undefined, end: string | null | undefined): { start: string; end: string } | null {
  if (!start || !end) return null;
  const s = Date.parse(start);
  const e = Date.parse(end);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s || e - s > 16 * 3_600_000) return null;
  return { start: new Date(s).toISOString(), end: new Date(e).toISOString() };
}

function minutesOrNull(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0 || n > 960) return null;
  return Math.round(n);
}

/**
 * Baut die Datenbankzeile aus der Formulareingabe. Ohne gültiges Datum oder PRS
 * außerhalb 0-10 wird nichts gespeichert (null); ungültige Zusatz-/Health-Werte werden
 * zu null statt die ganze Eingabe abzulehnen.
 */
export function buildRecoveryPayload(input: RecoveryEntryInput): RecoveryPayload | null {
  if (input.date.trim() === '') return null;
  const prs = Math.round(input.perceivedRecovery);
  if (!Number.isFinite(prs) || prs < 0 || prs > 10) return null;

  const sleepHours = nonNegOrNull(input.sleepHours, 16);
  const window = sleepHours !== null ? validWindow(input.sleepStart, input.sleepEnd) : null;

  return {
    entry: {
      id: newId(),
      date: input.date,
      perceived_recovery: prs,
      soreness: scale1to5(input.soreness),
      stress: scale1to5(input.stress),
      sleep_quality: scale1to5(input.sleepQuality),
      note: input.note.trim() === '' ? null : input.note.trim(),
      hrv_ms: nonNegOrNull(input.hrvMs, 300),
      resting_hr: restingHrOrNull(input.restingHr),
      sleep_hours: sleepHours,
      ...(window ? { sleep_start: window.start, sleep_end: window.end } : {}),
      ...(window && minutesOrNull(input.deepSleepMin) !== null ? { deep_sleep_min: minutesOrNull(input.deepSleepMin) as number } : {}),
      ...(window && minutesOrNull(input.remSleepMin) !== null ? { rem_sleep_min: minutesOrNull(input.remSleepMin) as number } : {}),
      source: input.source ?? 'manual',
    },
  };
}
