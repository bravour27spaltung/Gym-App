import { footballLoad, type FootballKind } from './football';
import { sleepMidpointMinutes } from './sleep';
import type { HistWorkout } from './stats';
import type { HistFootballSession, HistRecoveryEntry } from './storage';

/**
 * Recovery-Auswertung: mehrere Signale, je gegen die EIGENE Baseline eingeordnet, und eine
 * bewusst einfache, offen gelegte Entscheidungsregel statt eines Scores mit
 * willkürlichen Gewichten. Reine Logik ohne Browser- oder Datenbankzugriff.
 *
 * Leitlinien aus der Literatur (Einordnung der Quellen siehe RECOVERY_EVIDENCE unten):
 *  - Kein einzelner Marker ist verlässlich; Erholung wird über mehrere Marker und gegen den
 *    individuellen Verlauf beurteilt (Kellmann et al. 2018, Konsensus-Statement).
 *  - Subjektive Marker reagierten in einem systematischen Review sensitiver und konsistenter auf
 *    Belastung als objektive (Saw, Main & Gastin 2016). Sie stehen deshalb vorn.
 *  - HRV wird als gleitender Wochenmittelwert der logarithmierten Werte gegen eine längere
 *    Baseline bewertet, nicht als Tageswert (Buchheit 2014). Die Apple Watch misst SDNN
 *    unregelmäßig und im Absolutwert ungenau (Sensors 2024, n = 39); Verläufe sind belastbarer
 *    als Einzelwerte.
 *
 * Die Entscheidungsregel (assessRecovery) ist eine Heuristik und nicht validiert. Sie sagt weder
 * Verletzungen noch Leistung voraus, sondern fasst zusammen, wie viele Signale gerade von
 * deinem Normalbereich abweichen.
 */

export type SignalStatus = 'ok' | 'watch' | 'low';
export type RecoveryLevel = 'ok' | 'watch' | 'reduced';

/** Kurzfristiges Fenster (gleitender Mittelwert) in Tagen. */
export const ACUTE_DAYS = 7;
/** Länge der Baseline, die direkt vor dem kurzfristigen Fenster liegt, in Tagen. */
export const BASELINE_DAYS = 28;
/** Mindestanzahl Messwerte im kurzfristigen Fenster. */
export const MIN_ACUTE_SAMPLES = 3;
/** Mindestanzahl Messwerte in der Baseline, damit Mittelwert und Streuung tragen. */
export const MIN_BASELINE_SAMPLES = 10;
/** Untergrenze der "kleinsten relevanten Änderung" der HRV (≈ 3 %, Buchheit 2014, Tab. 1) in ln-Einheiten. */
const HRV_SWC_FLOOR_LN = 0.03;
/** Untergrenze für den Ruhepuls in bpm (Messgenauigkeit der Uhr liegt im Bereich 1 bis 4 bpm). */
const RHR_SWC_FLOOR_BPM = 1;
/** Schlaf: unter dem Mindestwert Erwachsener (AASM/SRS 2015) wird gewarnt. */
export const SLEEP_MIN_HOURS = 7;
/** Schlaf: unter diesem Wert gilt die Nacht als klar zu kurz. */
export const SLEEP_LOW_HOURS = 6;
/** Zielwert für die Schlafschuld (Konsens für Sportler: 7–9 h, Athleten eher mehr, Walsh et al. 2021). */
export const SLEEP_TARGET_HOURS = 8;
/** Mindestanzahl Nächte für Durchschnitt, Schlafschuld und Regelmäßigkeit. */
const MIN_SLEEP_NIGHTS = 4;
const STAGE_BASELINE_DAYS = 14;
const STAGE_MIN_NIGHTS = 5;

const DAY_MS = 86_400_000;

/** Tagesnummer eines Datums "YYYY-MM-DD" (UTC-basiert, damit Sommerzeit nichts verschiebt). */
export function dayNumber(dateIso: string): number {
  return Math.floor(Date.parse(`${dateIso}T00:00:00Z`) / DAY_MS);
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function sampleSd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1));
}

interface Dated {
  day: number;
  v: number;
}

function series(entries: HistRecoveryEntry[], pick: (e: HistRecoveryEntry) => number | null): Dated[] {
  const out: Dated[] = [];
  for (const e of entries) {
    const v = pick(e);
    if (v !== null && Number.isFinite(v)) out.push({ day: dayNumber(e.date), v });
  }
  return out;
}

/** Werte der Tage (asOf - length, asOf]. */
function within(s: Dated[], asOfDay: number, length: number): number[] {
  return s.filter((d) => d.day > asOfDay - length && d.day <= asOfDay).map((d) => d.v);
}

/** Werte der Baseline: die `BASELINE_DAYS` Tage direkt vor dem kurzfristigen Fenster. */
function baselineValues(s: Dated[], asOfDay: number): number[] {
  return s
    .filter((d) => d.day <= asOfDay - ACUTE_DAYS && d.day > asOfDay - ACUTE_DAYS - BASELINE_DAYS)
    .map((d) => d.v);
}

export interface TrendSignal {
  /** Kurzfristiger Mittelwert (HRV: geometrisch) in ms bzw. bpm; null ohne genug Werte. */
  acute: number | null;
  /** Baseline-Mittelwert in derselben Einheit; null ohne genug Werte. */
  baseline: number | null;
  /** Abweichung des Wochenmittels von der Baseline in Prozent (HRV) bzw. bpm (Ruhepuls). */
  change: number | null;
  /** Kleinste relevante Änderung, in derselben Einheit wie `change` (Prozent bzw. bpm). */
  swc: number | null;
  status: SignalStatus | null;
  acuteN: number;
  baselineN: number;
}

function emptyTrend(acuteN: number, baselineN: number, acute: number | null): TrendSignal {
  return { acute, baseline: null, change: null, swc: null, status: null, acuteN, baselineN };
}

/**
 * HRV-Trend: gleitender 7-Tage-Mittelwert der logarithmierten Werte gegen eine 28-Tage-Baseline.
 * Als Abweichung gilt, was die kleinste relevante Änderung überschreitet: 0,5 × Standardabweichung
 * der Baseline (gängige Praxisheuristik), mindestens 3 %. Eine niedrigere HRV ist die auffällige
 * Richtung; eine deutlich höhere gilt nicht als Problem.
 */
export function hrvTrend(entries: HistRecoveryEntry[], asOf: string): TrendSignal {
  const asOfDay = dayNumber(asOf);
  const s = series(entries, (e) => (e.hrvMs !== null && e.hrvMs > 0 ? Math.log(e.hrvMs) : null));
  const acute = within(s, asOfDay, ACUTE_DAYS);
  const base = baselineValues(s, asOfDay);
  const acuteMs = acute.length > 0 ? Math.exp(mean(acute)) : null;
  if (acute.length < MIN_ACUTE_SAMPLES) return emptyTrend(acute.length, base.length, null);
  if (base.length < MIN_BASELINE_SAMPLES) return emptyTrend(acute.length, base.length, acuteMs);

  const baseMean = mean(base);
  const swcLn = Math.max(0.5 * sampleSd(base), HRV_SWC_FLOOR_LN);
  const deltaLn = mean(acute) - baseMean;
  return {
    acute: acuteMs,
    baseline: Math.exp(baseMean),
    change: (Math.exp(deltaLn) - 1) * 100,
    swc: (Math.exp(swcLn) - 1) * 100,
    status: deltaLn < -swcLn ? 'low' : 'ok',
    acuteN: acute.length,
    baselineN: base.length,
  };
}

/** Ruhepuls-Trend, gleiche Methodik; ein höherer Ruhepuls als in der Baseline ist die auffällige Richtung. */
export function restingHrTrend(entries: HistRecoveryEntry[], asOf: string): TrendSignal {
  const asOfDay = dayNumber(asOf);
  const s = series(entries, (e) => e.restingHr);
  const acute = within(s, asOfDay, ACUTE_DAYS);
  const base = baselineValues(s, asOfDay);
  const acuteMean = acute.length > 0 ? mean(acute) : null;
  if (acute.length < MIN_ACUTE_SAMPLES) return emptyTrend(acute.length, base.length, null);
  if (base.length < MIN_BASELINE_SAMPLES) return emptyTrend(acute.length, base.length, acuteMean);

  const baseMean = mean(base);
  const swc = Math.max(0.5 * sampleSd(base), RHR_SWC_FLOOR_BPM);
  const delta = (acuteMean as number) - baseMean;
  return {
    acute: acuteMean,
    baseline: baseMean,
    change: delta,
    swc,
    status: delta > swc ? 'low' : 'ok',
    acuteN: acute.length,
    baselineN: base.length,
  };
}

export interface SubjectiveSignal {
  /** Wert des Tages (PRS 0–10 bzw. Wellness 1–5, jeweils höher = besser); null ohne Eintrag. */
  value: number | null;
  /** Mittelwert der eigenen letzten 28 Tage (ohne den Tag selbst); null bei zu wenigen Werten. */
  baseline: number | null;
  status: SignalStatus | null;
}

/** Schlechter der beiden Status. */
function worse(a: SignalStatus, b: SignalStatus): SignalStatus {
  const rank: Record<SignalStatus, number> = { ok: 0, watch: 1, low: 2 };
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Subjektives Signal gegen absolute Grenzen UND gegen den eigenen Verlauf: Wer sonst 9 angibt
 * und heute 6, ist auffällig, auch wenn 6 an sich unkritisch wäre. Ein Tag gilt als
 * "watch" bei mehr als 1 und als "low" bei mehr als 1,5 Standardabweichungen unter dem
 * eigenen Mittel (Streuung mindestens `minSd`, damit gleichförmige Angaben nicht überempfindlich machen).
 */
function classifySubjective(
  value: number,
  history: number[],
  abs: { low: number; watch: number },
  minSd: number,
): { status: SignalStatus; baseline: number | null } {
  let status: SignalStatus = value < abs.low ? 'low' : value < abs.watch ? 'watch' : 'ok';
  let baseline: number | null = null;
  if (history.length >= 7) {
    baseline = mean(history);
    const z = (value - baseline) / Math.max(sampleSd(history), minSd);
    status = worse(status, z <= -1.5 ? 'low' : z <= -1 ? 'watch' : 'ok');
  }
  return { status, baseline };
}

/** Wellness 1–5 (höher = besser) aus Muskelkater, Stress und Schlafqualität (Hooper-Index-Prinzip, 3 Items). */
export function wellnessScore(e: {
  soreness: number | null;
  stress: number | null;
  sleepQuality: number | null;
}): number | null {
  const parts: number[] = [];
  if (e.soreness !== null) parts.push(6 - e.soreness);
  if (e.stress !== null) parts.push(6 - e.stress);
  if (e.sleepQuality !== null) parts.push(e.sleepQuality);
  return parts.length > 0 ? mean(parts) : null;
}

/**
 * Tief- und REM-Schlaf der Nacht gegen die eigene Baseline. Bewusst ohne Status und ohne Sollwert:
 * Für die Schlafarchitektur gibt es keinen anerkannten Grenzwert (Ohayon et al. 2017), und die Uhr
 * trifft die Phasen nur mäßig (Sleep Advances 2025, zpaf021). Aussagekräftig ist nur die Abweichung
 * vom eigenen Schnitt über mehrere Nächte.
 */
export interface SleepStages {
  deepMin: number | null;
  remMin: number | null;
  /** Ø der Vornächte (bis STAGE_BASELINE_DAYS zurück); null bei weniger als STAGE_MIN_NIGHTS Nächten. */
  deepBaseline: number | null;
  remBaseline: number | null;
  nights: number;
}

export interface SleepSignal {
  /** Die Nacht, die am Bezugstag endet. */
  lastNight: { hours: number; start: string | null; end: string | null } | null;
  /** Tief-/REM-Minuten der Nacht; null, wenn für diese Nacht keine Phasen vorliegen. */
  stages: SleepStages | null;
  status: SignalStatus | null;
  /** Ø Schlafdauer der letzten 7 Tage und Anzahl der Nächte mit Daten. */
  avg7: number | null;
  nights7: number;
  /** Summe der Fehlstunden gegenüber 8 h über die Nächte mit Daten (letzte 7 Tage). */
  debt7: number | null;
  /** Streuung der Schlafmitte in Minuten (kleiner = regelmäßiger); null bei zu wenigen Nächten mit Schlafzeit. */
  regularityMin: number | null;
}

function sleepSignal(entries: HistRecoveryEntry[], asOf: string, today: HistRecoveryEntry | null): SleepSignal {
  const asOfDay = dayNumber(asOf);
  const hours = series(entries, (e) => e.sleepHours);
  const week = within(hours, asOfDay, ACUTE_DAYS);
  const enough = week.length >= MIN_SLEEP_NIGHTS;

  const mids: number[] = [];
  for (const e of entries) {
    const d = dayNumber(e.date);
    if (d > asOfDay - ACUTE_DAYS && d <= asOfDay && e.sleepStart && e.sleepEnd) {
      const start = Date.parse(e.sleepStart);
      const end = Date.parse(e.sleepEnd);
      if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
        mids.push(sleepMidpointMinutes({ startMs: start, endMs: end }));
      }
    }
  }

  const last = today && today.sleepHours !== null ? today.sleepHours : null;

  // Tief-/REM-Baseline aus den Vornächten (ohne heute), erst ab STAGE_MIN_NIGHTS Nächten.
  const deepSeries = series(entries, (e) => e.deepSleepMin ?? null);
  const remSeries = series(entries, (e) => e.remSleepMin ?? null);
  const prior = (s: Dated[]) => within(s, asOfDay - 1, STAGE_BASELINE_DAYS);
  const deepPrior = prior(deepSeries);
  const remPrior = prior(remSeries);
  const deepToday = today?.deepSleepMin ?? null;
  const remToday = today?.remSleepMin ?? null;
  const stages: SleepStages | null =
    deepToday !== null || remToday !== null
      ? {
          deepMin: deepToday,
          remMin: remToday,
          deepBaseline: deepPrior.length >= STAGE_MIN_NIGHTS ? mean(deepPrior) : null,
          remBaseline: remPrior.length >= STAGE_MIN_NIGHTS ? mean(remPrior) : null,
          nights: Math.min(deepPrior.length, remPrior.length),
        }
      : null;
  return {
    stages,
    lastNight:
      last !== null ? { hours: last, start: today?.sleepStart ?? null, end: today?.sleepEnd ?? null } : null,
    status: last === null ? null : last < SLEEP_LOW_HOURS ? 'low' : last < SLEEP_MIN_HOURS ? 'watch' : 'ok',
    avg7: enough ? mean(week) : null,
    nights7: week.length,
    debt7: enough ? week.reduce((s, h) => s + Math.max(0, SLEEP_TARGET_HOURS - h), 0) : null,
    regularityMin: mids.length >= MIN_SLEEP_NIGHTS ? sampleSd(mids) : null,
  };
}

export interface RecoveryAssessment {
  /** Bezugstag "YYYY-MM-DD". */
  asOf: string;
  /** Eintrag des Bezugstags (null, wenn für den Tag noch nichts eingetragen ist). */
  entry: HistRecoveryEntry | null;
  prs: SubjectiveSignal;
  wellness: SubjectiveSignal;
  sleep: SleepSignal;
  hrv: TrendSignal;
  restingHr: TrendSignal;
  level: RecoveryLevel | null;
  /** Anzahl der Signale mit Status (von maximal 5). */
  signals: number;
  lows: number;
  watches: number;
  /** Kurze, konkrete Begründungen für alle auffälligen Signale (deutsch). */
  reasons: string[];
}

function pct(n: number): string {
  return `${Math.abs(Math.round(n))} %`;
}

/**
 * Beurteilung für den Bezugstag aus allen vorhandenen Signalen.
 *
 * Entscheidungsregel (Heuristik, nicht validiert):
 *  - "reduced" (rot): mindestens 2 Signale sind deutlich auffällig ("low").
 *  - "watch" (gelb): genau 1 Signal ist "low" oder mindestens 2 Signale sind leicht auffällig.
 *  - sonst "ok" (grün).
 * Das Gewicht liegt bewusst auf Übereinstimmung mehrerer unabhängiger Signale, weil einzelne
 * Marker (besonders Wearable-HRV) stark rauschen. Ohne Eintrag und ohne Trendsignale gibt es
 * kein Urteil (level = null).
 */
export function assessRecovery(entries: HistRecoveryEntry[], asOf: string): RecoveryAssessment {
  const entry = entries.find((e) => e.date === asOf) ?? null;
  const asOfDay = dayNumber(asOf);
  const prior = (pick: (e: HistRecoveryEntry) => number | null): number[] =>
    baselineValuesSince(entries, asOfDay, pick);

  const prs: SubjectiveSignal = { value: entry ? entry.perceivedRecovery : null, baseline: null, status: null };
  if (entry) {
    const c = classifySubjective(entry.perceivedRecovery, prior((e) => e.perceivedRecovery), { low: 4, watch: 6 }, 1);
    prs.status = c.status;
    prs.baseline = c.baseline;
  }

  const wellnessValue = entry ? wellnessScore(entry) : null;
  const wellness: SubjectiveSignal = { value: wellnessValue, baseline: null, status: null };
  if (wellnessValue !== null) {
    const c = classifySubjective(wellnessValue, prior((e) => wellnessScore(e)), { low: 2.5, watch: 3.5 }, 0.5);
    wellness.status = c.status;
    wellness.baseline = c.baseline;
  }

  const sleep = sleepSignal(entries, asOf, entry);
  const hrv = hrvTrend(entries, asOf);
  const restingHr = restingHrTrend(entries, asOf);

  const statuses: SignalStatus[] = [prs.status, wellness.status, sleep.status, hrv.status, restingHr.status].filter(
    (s): s is SignalStatus => s !== null,
  );
  const lows = statuses.filter((s) => s === 'low').length;
  const watches = statuses.filter((s) => s === 'watch').length;

  let level: RecoveryLevel | null = null;
  if (statuses.length > 0) {
    level = lows >= 2 ? 'reduced' : lows === 1 || watches >= 2 ? 'watch' : 'ok';
  }

  const reasons: string[] = [];
  if (prs.status && prs.status !== 'ok' && prs.value !== null) {
    reasons.push(
      prs.baseline !== null
        ? `Gefühlte Erholung ${prs.value}/10, dein Schnitt liegt bei ${prs.baseline.toFixed(1).replace('.', ',')}`
        : `Gefühlte Erholung nur ${prs.value}/10`,
    );
  }
  if (wellness.status && wellness.status !== 'ok') reasons.push('Muskelkater, Stress und Schlafqualität zusammen unter deinem Normalbereich');
  if (sleep.status && sleep.status !== 'ok' && sleep.lastNight) {
    reasons.push(`Letzte Nacht ${sleep.lastNight.hours.toFixed(1).replace('.', ',')} h Schlaf (Richtwert ab ${SLEEP_MIN_HOURS} h)`);
  }
  if (hrv.status === 'low' && hrv.change !== null) reasons.push(`HRV im 7-Tage-Schnitt ${pct(hrv.change)} unter deiner Baseline`);
  if (restingHr.status === 'low' && restingHr.change !== null) {
    reasons.push(`Ruhepuls im 7-Tage-Schnitt ${Math.round(restingHr.change)} bpm über deiner Baseline`);
  }

  return { asOf, entry, prs, wellness, sleep, hrv, restingHr, level, signals: statuses.length, lows, watches, reasons };
}

/** Werte der 28 Tage vor dem Bezugstag (ohne diesen selbst) für den eigenen Verlauf subjektiver Werte. */
function baselineValuesSince(
  entries: HistRecoveryEntry[],
  asOfDay: number,
  pick: (e: HistRecoveryEntry) => number | null,
): number[] {
  const out: number[] = [];
  for (const e of entries) {
    const d = dayNumber(e.date);
    if (d >= asOfDay || d < asOfDay - BASELINE_DAYS) continue;
    const v = pick(e);
    if (v !== null && Number.isFinite(v)) out.push(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verläufe für Diagramme

export interface TrendPoint {
  /** Zeitpunkt in ms (Mittag des Tages, UTC, damit Anzeige und Reihenfolge stabil bleiben). */
  at: number;
  value: number;
  /** Anzahl der Messwerte im gleitenden Fenster. */
  n: number;
}

/**
 * Gleitender 7-Tage-Mittelwert je Tag mit mindestens `minN` Werten im Fenster. HRV wird als
 * geometrisches Mittel gerechnet (Mittel der Logarithmen), Ruhepuls und Schlaf als einfaches Mittel.
 */
export function rollingSeries(
  entries: HistRecoveryEntry[],
  kind: 'hrv' | 'restingHr' | 'sleep',
  minN: number = MIN_ACUTE_SAMPLES,
): TrendPoint[] {
  const s = series(entries, (e) =>
    kind === 'hrv' ? (e.hrvMs !== null && e.hrvMs > 0 ? Math.log(e.hrvMs) : null) : kind === 'restingHr' ? e.restingHr : e.sleepHours,
  );
  const days = [...new Set(s.map((d) => d.day))].sort((a, b) => a - b);
  const out: TrendPoint[] = [];
  for (const day of days) {
    const w = within(s, day, ACUTE_DAYS);
    if (w.length < minN) continue;
    out.push({ at: day * DAY_MS + DAY_MS / 2, value: kind === 'hrv' ? Math.exp(mean(w)) : mean(w), n: w.length });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Trainingskontext

export interface TrainingContext {
  gym: { hoursSinceLast: number | null; lastName: string | null; sessions7d: number };
  football: {
    hoursSinceLast: number | null;
    lastKind: FootballKind | null;
    /** Session-RPE-Last der letzten Einheit in AU (Dauer × RPE, Foster et al. 2001). */
    lastLoad: number | null;
    load7d: number;
    sessions7d: number;
    /** Letzte Einheit liegt weniger als 72 h zurück. */
    within72h: boolean;
  };
}

/** Beginn einer Fußballeinheit in ms; ohne Startzeit näherungsweise Mittag des Spieltags. */
function footballStartMs(f: HistFootballSession): number {
  return f.startedAt ? Date.parse(f.startedAt) : new Date(`${f.playedOn}T12:00:00`).getTime();
}

/**
 * Belastung der letzten Tage als Kontext für die Erholungswerte. Bewusst nur Fakten (Stunden seit
 * der letzten Einheit, Summe der Session-RPE-Last), kein Belastungsquotient und keine
 * Verletzungswahrscheinlichkeit: der Acute:Chronic-Workload-Ratio wird fachlich stark kritisiert
 * (Impellizzeri et al. 2020, IJSPP, aus dem Gedächtnis zitiert).
 */
export function trainingContext(
  workouts: HistWorkout[],
  footballs: HistFootballSession[],
  nowMs: number,
): TrainingContext {
  const week = 7 * DAY_MS;
  const hoursSince = (ms: number) => Math.max(0, (nowMs - ms) / 3_600_000);

  const finished = workouts
    .filter((w) => w.finishedAt)
    .map((w) => ({ w, ms: Date.parse(w.finishedAt as string) }))
    .filter((x) => Number.isFinite(x.ms) && x.ms <= nowMs)
    .sort((a, b) => b.ms - a.ms);

  const games = footballs
    .map((f) => ({ f, ms: footballStartMs(f) }))
    .filter((x) => Number.isFinite(x.ms) && x.ms <= nowMs)
    .sort((a, b) => b.ms - a.ms);
  const recentGames = games.filter((x) => nowMs - x.ms <= week);
  const lastGame = games[0] ?? null;

  return {
    gym: {
      hoursSinceLast: finished[0] ? hoursSince(finished[0].ms) : null,
      lastName: finished[0]?.w.name ?? null,
      sessions7d: finished.filter((x) => nowMs - x.ms <= week).length,
    },
    football: {
      hoursSinceLast: lastGame ? hoursSince(lastGame.ms) : null,
      lastKind: lastGame?.f.kind ?? null,
      lastLoad: lastGame ? footballLoad(lastGame.f.minutes, lastGame.f.rpe) : null,
      load7d: recentGames.reduce((s, x) => s + footballLoad(x.f.minutes, x.f.rpe), 0),
      sessions7d: recentGames.length,
      within72h: lastGame ? hoursSince(lastGame.ms) < 72 : false,
    },
  };
}

// ---------------------------------------------------------------------------
// Quellen und ihre Einordnung (für die Anzeige in der App)

export type EvidenceGrade = 'hoch' | 'mittel' | 'gering';

export interface EvidenceNote {
  topic: string;
  /** Wie die App den Marker nutzt. */
  use: string;
  grade: EvidenceGrade;
  /** Art der Quelle(n) und worauf die Einstufung beruht. */
  basis: string;
  source: string;
  /** Grenzen der Aussage. */
  caveat: string;
}

/**
 * Einstufung: "hoch" = systematisches Review/Meta-Analyse mit vielen Studien; "mittel" =
 * Konsensus-Statement oder Review mit heterogener Basis bzw. Übertragung aus verwandten Gruppen;
 * "gering" = Einzelstudie, kleine Stichprobe oder Praxisheuristik ohne Primärquelle.
 */
export const RECOVERY_EVIDENCE: EvidenceNote[] = [
  {
    topic: 'Mehrere Signale statt eines Scores',
    use: 'Ampel entsteht nur, wenn mehrere Signale von deinem Normalbereich abweichen.',
    grade: 'mittel',
    basis: 'Konsensus-Statement von Expert:innen (Expertenmeinung, keine Primärstudie).',
    source: 'Kellmann et al. 2018, Int J Sports Physiol Perform 13(2):240–245',
    caveat:
      'Volltext war beim Erstellen nicht abrufbar; der Inhalt ist aus dem Gedächtnis zusammengefasst. Die konkrete Ampelregel der App ist eine eigene Heuristik und nicht validiert.',
  },
  {
    topic: 'Gefühlte Erholung, Muskelkater, Stress, Schlafqualität',
    use: 'Stehen vorn und werden gegen deinen eigenen Verlauf bewertet.',
    grade: 'hoch',
    basis: 'Systematisches Review mit 56 Studien: subjektive Marker reagierten auf Belastung sensitiver und konsistenter als objektive.',
    source: 'Saw, Main & Gastin 2016, Br J Sports Med 50(5):281–291',
    caveat:
      'Meist Leistungs- und Teamsportler; Fragebögen uneinheitlich. Die PRS-Skala selbst stammt aus einer Einzelstudie (Laurent et al. 2011, J Strength Cond Res; Grad: gering).',
  },
  {
    topic: 'HRV (Apple Watch, SDNN)',
    use: '7-Tage-Mittel der logarithmierten Werte gegen 28-Tage-Baseline; Abweichung ab ½ Standardabweichung (mind. 3 %).',
    grade: 'gering',
    basis:
      'Methodik: Übersichtsarbeit zur HRV-Überwachung (Buchheit 2014, Frontiers in Physiology 5:73), die Morgenmessung, ln(rMSSD) und Vergleich mit der eigenen Baseline empfiehlt. Gerätegenauigkeit: Validierungsstudie, n = 39, junge Gesunde.',
    source: 'Buchheit 2014; Sensors 2024, 24(19):6220 (Apple Watch Series 9/Ultra 2 vs. Brustgurt)',
    caveat:
      'Die Uhr misst SDNN statt rMSSD, alle 2–4 Stunden und nicht genormt morgens; Abweichung zum Brustgurt im Mittel −8 ms, mittlerer absoluter Fehler 29 %. Daher nur Trend, nie Einzelwert. Die Regel "½ SD" ist eine Praxisheuristik, die hier nicht an einer Primärquelle geprüft wurde.',
  },
  {
    topic: 'Ruhepuls',
    use: '7-Tage-Mittel gegen 28-Tage-Baseline; Abweichung ab ½ Standardabweichung (mind. 1 bpm).',
    grade: 'gering',
    basis:
      'Messgenauigkeit der Uhr gut (mittlere Abweichung −0,08 bpm, mittlerer absoluter Fehler 3,7 bpm, n = 39). Die Aussagekraft für Ermüdung ist deutlich schwächer belegt als die der subjektiven Marker.',
    source: 'Sensors 2024, 24(19):6220; Saw et al. 2016 (objektive Marker weniger sensitiv)',
    caveat: 'Ruhepuls reagiert auch auf Infekte, Alkohol, Hitze und Höhe.',
  },
  {
    topic: 'Schlafdauer',
    use: 'Richtwert ab 7 h, Schlafschuld gegenüber 8 h, Regelmäßigkeit der Schlafmitte.',
    grade: 'mittel',
    basis: 'Konsensus-Empfehlungen: 7–9 h für Erwachsene; Sportler brauchen eher mehr.',
    source: 'Walsh et al. 2021, Br J Sports Med 55(7):356–368; Watson et al. 2015 (AASM/SRS), Sleep 38(6):843–844',
    caveat:
      'Der Wert 8 h für die Schlafschuld ist eine Wahl innerhalb des Konsensbereichs. Consumer-Wearables erkennen Schlaf gut, Wachphasen schlecht und überschätzen die Schlafzeit tendenziell (Chinoy et al. 2021, Sleep 44(5), ohne Apple Watch geprüft). Schlafphasen (Tief/REM) werden bewusst nicht verwendet.',
  },
  {
    topic: 'Fußballspiel als Belastung',
    use: 'Hinweis, solange das letzte Spiel/Training weniger als 72 h zurückliegt; Last als Session-RPE (Dauer × RPE).',
    grade: 'hoch',
    basis:
      'Systematisches Review mit Meta-Analyse (77 Studien): Muskelkater erreicht nach 24–48 h seinen Höhepunkt, die Kreatinkinase bleibt bis 72 h erhöht, die Hamstring-Kraft ist nach 72 h teils noch gemindert.',
    source: 'Silva et al. 2018, Sports Med 48(3):539–583; Foster et al. 2001, J Strength Cond Res 15(1):109–115 (Session-RPE)',
    caveat: 'Überwiegend (Halb-)Profis und Wettkampfspiele; bei lockerem Kicken fällt die Belastung geringer aus. Die Erholung ist individuell.',
  },
];
