/**
 * Werte aus einem Apple-Health-Export (export.xml) für ein Zeitfenster zusammenfassen,
 * ohne eine aktiv gestartete Trainings-Aufzeichnung auf der Uhr vorauszusetzen: Health
 * sammelt Distanz, aktive Kalorien, Herzfrequenz, HRV, Ruhepuls und Schlaf auch im
 * Hintergrund als einzelne <Record>-Einträge. Reine Logik (Text-Scan per RegExp statt
 * DOM-Parser), damit sie sich testen lässt, ohne den Browser zu brauchen, und auch mit
 * sehr großen Exporten (mehrere hundert MB) zurechtkommt.
 *
 * Der Export wird genau einmal geparst (parseRelevantRecords) und danach für beliebig
 * viele Zeitfenster wiederverwendet (summarizeWindow) – wichtig, wenn an einem Tag
 * gleich mehrere Einheiten (Training, Stretching, Fußball, Recovery) abgeglichen werden
 * sollen, ohne den Text mehrfach zu durchsuchen.
 *
 * Vereinfachungen, die für Hobby-Tracking reichen, aber keine sportwissenschaftliche
 * Präzision beanspruchen:
 *  - Bevorzugt Datensätze einer Quelle mit "watch" im Namen (Apple Watch); gibt es
 *    keine, werden alle passenden Quellen verwendet (Doppelzählung durch eine
 *    zusätzliche iPhone-Schätzung ist dann möglich).
 *  - Herzfrequenz, HRV und Ruhepuls sind der einfache Mittelwert der Einzelmessungen im
 *    Fenster, nicht zeitgewichtet.
 *  - Ohne aktive Aufzeichnung misst die Uhr Herzfrequenz nur alle paar Minuten im
 *    Hintergrund, nicht kontinuierlich; der Mittelwert beruht entsprechend auf wenigen
 *    Stichproben. HRV wird von der Uhr meist nur ein- bis zweimal täglich gemessen
 *    (oft morgens), ein einzelner Ausreißer wirkt sich also stark aus – aussagekräftig
 *    ist erst der Trend über mehrere Tage/Wochen (Rolling-Baseline), nicht der Tageswert
 *    für sich.
 *  - Schlafphasen (Core/Deep/REM) eines Consumer-Wearables sind gegenüber einer
 *    Polysomnographie nur mäßig genau; die Gesamtdauer ist deutlich verlässlicher als
 *    die Aufteilung nach Phasen. Ausgewertet werden deshalb nur Tief und REM (am besten
 *    erkannt, Sleep Advances 2025, zpaf021), und auch nur als Trend (siehe sleep.ts);
 *    Wachzeit und Leichtschlaf nicht.
 */

import { sleepStageOf, type SleepStage } from './sleep';

const RECORD_RE = /<Record\b[^>]*\/>/g;
const ATTR_RE = /([\w:-]+)="([^"]*)"/g;
const TYPE_RE = /type="([^"]*)"/;

export type RelevantHealthType =
  | 'HKQuantityTypeIdentifierDistanceWalkingRunning'
  | 'HKQuantityTypeIdentifierActiveEnergyBurned'
  | 'HKQuantityTypeIdentifierHeartRate'
  | 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN'
  | 'HKQuantityTypeIdentifierRestingHeartRate'
  | 'HKCategoryTypeIdentifierSleepAnalysis';

const RELEVANT_TYPES = new Set<RelevantHealthType>([
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
]);

/** Nur diese Kategoriewerte zählen als "geschlafen" (nicht "im Bett" oder "wach"). */
function isAsleepValue(value: string): boolean {
  return value.includes('Asleep');
}

/** "2026-09-23 19:04:30 +0200" -> Millisekunden seit Epoch (null bei unbekanntem Format). */
export function parseAppleHealthDate(s: string): number | null {
  const m = s.trim().match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/);
  if (!m) return null;
  const [, date, time, offH, offM] = m;
  const ms = new Date(`${date}T${time}${offH}:${offM}`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  let m: RegExpExecArray | null;
  ATTR_RE.lastIndex = 0;
  while ((m = ATTR_RE.exec(tag))) attrs[m[1]] = m[2];
  return attrs;
}

function isWatchSource(sourceName: string): boolean {
  return sourceName.toLowerCase().includes('watch');
}

function toKm(value: number, unit: string): number {
  if (unit === 'mi') return value * 1.609344;
  return value; // 'km' oder unbekannt: unverändert übernehmen
}

function toKcal(value: number, unit: string): number {
  if (unit === 'kJ') return value / 4.184;
  return value; // 'kcal'/'Cal' oder unbekannt: unverändert übernehmen
}

export interface HealthRecord {
  type: RelevantHealthType;
  /**
   * Bereits in km bzw. kcal bzw. bpm bzw. ms umgerechnet. Bei Schlaf: gehaltene Dauer
   * dieses Abschnitts in Stunden (aus startDate/endDate berechnet).
   */
  value: number;
  startMs: number;
  /** Nur bei Schlaf gesetzt (Ende des Abschnitts); sonst gleich startMs. */
  endMs?: number;
  isWatch: boolean;
  /** Nur bei Schlaf: Phase des Abschnitts (Tief/REM/Kern/sonstige). */
  stage?: SleepStage;
}

/**
 * Durchsucht den kompletten Export-Text einmal nach den relevanten Record-Typen
 * (Distanz, aktive Kalorien, Herzfrequenz, HRV, Ruhepuls, Schlaf) und gibt sie
 * chronologisch sortiert zurück. Alles andere (Schritte, Mindful Minutes, …) wird
 * ignoriert.
 */
export function parseRelevantRecords(xmlText: string): HealthRecord[] {
  const records: HealthRecord[] = [];
  RECORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RECORD_RE.exec(xmlText))) {
    const tag = m[0];
    const type = TYPE_RE.exec(tag)?.[1] as RelevantHealthType | undefined;
    if (!type || !RELEVANT_TYPES.has(type)) continue;

    const attrs = parseAttrs(tag);
    const startMs = attrs.startDate ? parseAppleHealthDate(attrs.startDate) : null;
    if (startMs === null) continue;

    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      // Kategorie-Datensatz statt Zahlenwert: startDate/endDate sind der Schlafabschnitt,
      // "value" benennt die Phase (z. B. "...AsleepCore", "...InBed", "...Awake"). Nur
      // tatsächlich geschlafene Phasen zählen, "im Bett" oder "wach" nicht.
      const endMs = attrs.endDate ? parseAppleHealthDate(attrs.endDate) : null;
      if (endMs === null || endMs <= startMs || !isAsleepValue(attrs.value ?? '')) continue;
      records.push({
        type,
        value: (endMs - startMs) / 3_600_000,
        startMs,
        endMs,
        isWatch: isWatchSource(attrs.sourceName ?? ''),
        stage: sleepStageOf(attrs.value ?? ''),
      });
      continue;
    }

    const raw = Number(attrs.value);
    if (!Number.isFinite(raw)) continue;

    let value = raw;
    if (type === 'HKQuantityTypeIdentifierDistanceWalkingRunning') value = toKm(raw, attrs.unit ?? 'km');
    else if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned') value = toKcal(raw, attrs.unit ?? 'kcal');
    // HRV (ms) und Ruhepuls (bpm) kommen bereits in der erwarteten Einheit.

    records.push({ type, value, startMs, isWatch: isWatchSource(attrs.sourceName ?? '') });
  }
  records.sort((a, b) => a.startMs - b.startMs);
  return records;
}

export interface HealthWindowSummary {
  distanceKm: number | null;
  calories: number | null;
  avgHeartRate: number | null;
  /** Herzfrequenzvariabilität (SDNN), Mittelwert der Einzelmessungen im Fenster, in ms. */
  hrvMs: number | null;
  /** Ruheherzfrequenz, Mittelwert der Einzelmessungen im Fenster, in bpm. */
  restingHr: number | null;
  /** Summe der geschlafenen Phasen im Fenster, in Stunden (ohne "im Bett"/"wach"). */
  sleepHours: number | null;
}

type Bucket = { watch: number[]; other: number[] };

/** Bevorzugt Watch-Quellen; nur wenn es keine gibt, werden alle Quellen verwendet. */
function pick(b: Bucket): number[] {
  return b.watch.length > 0 ? b.watch : b.other;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Summiert/mittelt aus bereits geparsten Records alle Werte, deren Startzeit ins
 * halboffene Fenster [from, to) fällt. Records sind chronologisch sortiert (siehe
 * parseRelevantRecords), daher wird nur der relevante Ausschnitt durchlaufen.
 *
 * Für Schlaf wird nach Startzeit des Abschnitts gefiltert (nicht nach Überlappung mit
 * dem Fenster) – wie bei den anderen Werten eine bewusste Vereinfachung, die für ein
 * grosszügig gewähltes Fenster (siehe recoveryWindowForDate) in der Praxis reicht.
 */
export function summarizeWindow(records: HealthRecord[], from: number, to: number): HealthWindowSummary {
  const distance: Bucket = { watch: [], other: [] };
  const energy: Bucket = { watch: [], other: [] };
  const hr: Bucket = { watch: [], other: [] };
  const hrv: Bucket = { watch: [], other: [] };
  const restingHr: Bucket = { watch: [], other: [] };
  const sleep: Bucket = { watch: [], other: [] };

  for (const r of records) {
    if (r.startMs < from) continue;
    if (r.startMs >= to) break; // sortiert: alles Weitere liegt auch dahinter
    const bucket = r.isWatch ? 'watch' : 'other';
    if (r.type === 'HKQuantityTypeIdentifierDistanceWalkingRunning') distance[bucket].push(r.value);
    else if (r.type === 'HKQuantityTypeIdentifierActiveEnergyBurned') energy[bucket].push(r.value);
    else if (r.type === 'HKQuantityTypeIdentifierHeartRate') hr[bucket].push(r.value);
    else if (r.type === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN') hrv[bucket].push(r.value);
    else if (r.type === 'HKQuantityTypeIdentifierRestingHeartRate') restingHr[bucket].push(r.value);
    else if (r.type === 'HKCategoryTypeIdentifierSleepAnalysis') sleep[bucket].push(r.value);
  }

  const distanceValues = pick(distance);
  const energyValues = pick(energy);
  const hrValues = pick(hr);
  const hrvValues = pick(hrv);
  const restingHrValues = pick(restingHr);
  const sleepValues = pick(sleep);

  return {
    distanceKm: distanceValues.length > 0 ? Math.round(sum(distanceValues) * 100) / 100 : null,
    calories: energyValues.length > 0 ? Math.round(sum(energyValues)) : null,
    avgHeartRate: hrValues.length > 0 ? Math.round(sum(hrValues) / hrValues.length) : null,
    hrvMs: hrvValues.length > 0 ? Math.round((sum(hrvValues) / hrvValues.length) * 10) / 10 : null,
    restingHr: restingHrValues.length > 0 ? Math.round(sum(restingHrValues) / restingHrValues.length) : null,
    sleepHours: sleepValues.length > 0 ? Math.round(sum(sleepValues) * 100) / 100 : null,
  };
}

/**
 * Bequemlichkeitsfunktion für einen einzelnen Abgleich (z. B. im Fußball-Formular):
 * parst den Export und wertet direkt ein Fenster aus. Für mehrere Fenster aus demselben
 * Export bitte parseRelevantRecords einmal aufrufen und summarizeWindow wiederverwenden
 * (siehe HealthImportSheet), sonst wird der ggf. sehr große Text mehrfach durchsucht.
 */
export function summarizeAppleHealthWindow(
  xmlText: string,
  startedAt: Date,
  minutes: number,
): HealthWindowSummary {
  const from = startedAt.getTime();
  const to = from + minutes * 60_000;
  return summarizeWindow(parseRelevantRecords(xmlText), from, to);
}
