import type { HistRecoveryEntry } from './storage';
import { newId } from './workout';

/**
 * Recovery: eigener, bewusst einfacher Bereich – ein Eintrag pro Tag, im Kern eine
 * Ein-Item-Skala (Perceived Recovery Status), dazu optional ein paar kurze
 * Zusatzwerte und Health-Werte aus Apple Health. Reine Logik ohne Browser- oder
 * Datenbankzugriff, damit sie sich testen lässt und offline funktioniert.
 *
 * Warum PRS statt eines selbstgebauten Scores: Perceived Recovery Status (Laurent et
 * al. 2011, J Strength Cond Res) ist eine validierte Ein-Item-Skala 0-10, die mit
 * neuromuskulärer Leistungsfähigkeit und HRV korreliert und in Sekunden ausgefüllt
 * ist. Subjektive Wellness-Marker wie diese reagieren laut Saw, Main & Gastin (2016,
 * Br J Sports Med, systematisches Review) oft sensitiver auf Trainingsbelastung als
 * objektive Marker wie HRV/Ruhepuls – beide Datenarten ergänzen sich, siehe die
 * optionalen HRV/Ruhepuls/Schlaf-Felder unten (aus dem Apple-Health-Import,
 * healthImport.ts).
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

/**
 * Baut die Datenbankzeile aus der Formulareingabe. Ohne gültiges Datum oder PRS
 * außerhalb 0-10 wird nichts gespeichert (null); ungültige Zusatz-/Health-Werte werden
 * zu null statt die ganze Eingabe abzulehnen.
 */
export function buildRecoveryPayload(input: RecoveryEntryInput): RecoveryPayload | null {
  if (input.date.trim() === '') return null;
  const prs = Math.round(input.perceivedRecovery);
  if (!Number.isFinite(prs) || prs < 0 || prs > 10) return null;

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
      sleep_hours: nonNegOrNull(input.sleepHours, 16),
      source: input.source ?? 'manual',
    },
  };
}

/**
 * Recovery Score (0-100): kombiniert PRS mit den optionalen Health-Werten zu einer
 * Tageszahl. Es gibt dafür keine einzelne validierte Formel – kommerzielle Anbieter wie
 * Whoop oder Oura halten ihre Algorithmen proprietär und unveröffentlicht. Die hier
 * verwendeten Bausteine sind aber einzeln evidenzbasiert:
 *
 *  - HRV und Ruhepuls fließen nicht absolut ein, sondern als Abweichung (Z-Score) von
 *    der eigenen rollierenden Baseline, weil Tageswerte stark individuell und
 *    tagesweise verrauscht sind; der Vergleich gegen die persönliche Baseline statt
 *    Populationsnormen ist der in der Sportwissenschaft übliche Ansatz (Plews et al.
 *    2013, Sports Medicine; Flatt & Esco 2016, J Strength Cond Res).
 *  - Schlafdauer relativ zu einem Zielwert (8h, grobe Erwachsenen-Orientierung, siehe
 *    Fullagar et al. 2015, Sports Medicine-Review zu Schlaf und Erholung im Sport).
 *  - PRS direkt (Laurent et al. 2011), da als 0-10-Skala bereits validiert.
 *
 * Die Gewichtung (PRS 25%, HRV 30%, Ruhepuls 20%, Schlaf 25%) ist eine Heuristik, keine
 * belegte Vorgabe – frei anpassbar. Fehlt ein Baustein (noch keine Baseline, kein
 * Health-Import an dem Tag), wird er weggelassen und die übrigen Gewichte proportional
 * hochskaliert, statt fehlende Daten als "schlecht" zu werten. PRS ist als einziger
 * Pflichtwert immer vorhanden, der Score bleibt also von Anfang an aussagekräftig.
 */

const BASELINE_WINDOW_DAYS = 7;
/** Unter dieser Stichprobengröße ist die Standardabweichung zu instabil für einen Z-Score. */
const MIN_BASELINE_SAMPLES = 4;
const SLEEP_TARGET_HOURS = 8;

const RECOVERY_SCORE_WEIGHTS = { prs: 0.25, hrv: 0.3, restingHr: 0.2, sleep: 0.25 } as const;

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Stichproben-Standardabweichung (n-1); 0 bei weniger als 2 Werten. */
function sampleStdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/** Z-Score auf [-2, 2] geklemmt, linear auf 0-100 abgebildet (-2 SD -> 0, +2 SD -> 100). */
function zToScore(z: number): number {
  const clamped = Math.max(-2, Math.min(2, z));
  return ((clamped + 2) / 4) * 100;
}

export interface RecoveryBaseline {
  hrvMean: number | null;
  hrvSd: number | null;
  hrvSamples: number;
  restingHrMean: number | null;
  restingHrSd: number | null;
  restingHrSamples: number;
}

/**
 * Baseline aus den `windowDays` Tagen VOR `beforeDate` (dieser Tag selbst zählt nicht
 * mit, damit ein Tageswert nie in seine eigene Referenz einfließt). Erst ab
 * MIN_BASELINE_SAMPLES Werten wird tatsächlich eine Baseline geliefert (sonst null).
 */
export function computeRecoveryBaseline(
  history: HistRecoveryEntry[],
  beforeDate: string,
  windowDays: number = BASELINE_WINDOW_DAYS,
): RecoveryBaseline {
  const beforeMs = new Date(beforeDate).getTime();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const inWindow = history.filter((h) => {
    const t = new Date(h.date).getTime();
    return t < beforeMs && t >= beforeMs - windowMs;
  });

  const hrvValues = inWindow.map((h) => h.hrvMs).filter((v): v is number => v !== null);
  const rhrValues = inWindow.map((h) => h.restingHr).filter((v): v is number => v !== null);

  return {
    hrvMean: hrvValues.length >= MIN_BASELINE_SAMPLES ? mean(hrvValues) : null,
    hrvSd: hrvValues.length >= MIN_BASELINE_SAMPLES ? sampleStdDev(hrvValues) : null,
    hrvSamples: hrvValues.length,
    restingHrMean: rhrValues.length >= MIN_BASELINE_SAMPLES ? mean(rhrValues) : null,
    restingHrSd: rhrValues.length >= MIN_BASELINE_SAMPLES ? sampleStdDev(rhrValues) : null,
    restingHrSamples: rhrValues.length,
  };
}

export interface RecoveryScoreResult {
  /** 0-100, gerundet. */
  score: number;
  /** Teilscores 0-100, oder null, wenn der Baustein an diesem Tag fehlt. */
  parts: {
    prs: number;
    hrv: number | null;
    restingHr: number | null;
    sleep: number | null;
  };
  /** Tatsächlich verwendete Gewichte nach Neuskalierung um fehlende Teile; Summe = 1. */
  weightsUsed: { prs: number; hrv: number; restingHr: number; sleep: number };
}

/** Berechnet den Recovery Score eines einzelnen Tages gegen eine zuvor ermittelte Baseline. */
export function computeRecoveryScore(
  entry: {
    perceivedRecovery: number;
    hrvMs: number | null;
    restingHr: number | null;
    sleepHours: number | null;
  },
  baseline: RecoveryBaseline,
): RecoveryScoreResult {
  const prsScore = (Math.max(0, Math.min(10, entry.perceivedRecovery)) / 10) * 100;

  const hrvScore =
    entry.hrvMs !== null && baseline.hrvMean !== null && baseline.hrvSd !== null && baseline.hrvSd > 0
      ? zToScore((entry.hrvMs - baseline.hrvMean) / baseline.hrvSd)
      : null;

  // Höherer Ruhepuls als die Baseline gilt als schlechtere Erholung -> Vorzeichen gedreht.
  const restingHrScore =
    entry.restingHr !== null &&
    baseline.restingHrMean !== null &&
    baseline.restingHrSd !== null &&
    baseline.restingHrSd > 0
      ? zToScore((baseline.restingHrMean - entry.restingHr) / baseline.restingHrSd)
      : null;

  const sleepScore =
    entry.sleepHours !== null ? Math.min(entry.sleepHours / SLEEP_TARGET_HOURS, 1) * 100 : null;

  const parts: Array<[keyof typeof RECOVERY_SCORE_WEIGHTS, number | null]> = [
    ['prs', prsScore],
    ['hrv', hrvScore],
    ['restingHr', restingHrScore],
    ['sleep', sleepScore],
  ];
  const totalWeight = parts.reduce((sum, [k, v]) => sum + (v !== null ? RECOVERY_SCORE_WEIGHTS[k] : 0), 0);

  const weightsUsed = { prs: 0, hrv: 0, restingHr: 0, sleep: 0 };
  let weightedSum = 0;
  for (const [k, v] of parts) {
    if (v === null) continue;
    const w = totalWeight > 0 ? RECOVERY_SCORE_WEIGHTS[k] / totalWeight : 0;
    weightsUsed[k] = w;
    weightedSum += w * v;
  }

  return {
    score: Math.round(weightedSum),
    parts: {
      prs: Math.round(prsScore),
      hrv: hrvScore !== null ? Math.round(hrvScore) : null,
      restingHr: restingHrScore !== null ? Math.round(restingHrScore) : null,
      sleep: sleepScore !== null ? Math.round(sleepScore) : null,
    },
    weightsUsed,
  };
}
