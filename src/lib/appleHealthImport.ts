/**
 * Werte aus einem Apple-Health-Export (export.xml) für ein Zeitfenster zusammenfassen,
 * ohne eine aktiv gestartete Trainings-Aufzeichnung auf der Uhr vorauszusetzen: Health
 * sammelt Distanz, aktive Kalorien und Herzfrequenz auch im Hintergrund als einzelne
 * <Record>-Einträge. Reine Logik (Text-Scan per RegExp statt DOM-Parser), damit sie
 * sich testen lässt, ohne den Browser zu brauchen, und auch mit sehr großen Exporten
 * (mehrere hundert MB) zurechtkommt.
 *
 * Vereinfachungen, die für Hobby-Tracking reichen, aber keine sportwissenschaftliche
 * Präzision beanspruchen:
 *  - Bevorzugt Datensätze einer Quelle mit "watch" im Namen (Apple Watch); gibt es
 *    keine, werden alle passenden Quellen verwendet (Doppelzählung durch eine
 *    zusätzliche iPhone-Schätzung ist dann möglich).
 *  - Herzfrequenz ist der einfache Mittelwert der Einzelmessungen im Fenster, nicht
 *    zeitgewichtet.
 *  - Ohne aktive Aufzeichnung misst die Uhr Herzfrequenz nur alle paar Minuten im
 *    Hintergrund, nicht kontinuierlich; der Mittelwert beruht entsprechend auf wenigen
 *    Stichproben.
 */

const RECORD_RE = /<Record\b[^>]*\/>/g;
const ATTR_RE = /([\w:-]+)="([^"]*)"/g;
const TYPE_RE = /type="([^"]*)"/;

const RELEVANT_TYPES = new Set([
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierActiveEnergyBurned',
  'HKQuantityTypeIdentifierHeartRate',
]);

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

export interface HealthWindowSummary {
  distanceKm: number | null;
  calories: number | null;
  avgHeartRate: number | null;
}

type Bucket = { watch: number[]; other: number[] };

function newBucket(): Bucket {
  return { watch: [], other: [] };
}

/** Bevorzugt Watch-Quellen; nur wenn es keine gibt, werden alle Quellen verwendet. */
function pick(b: Bucket): number[] {
  return b.watch.length > 0 ? b.watch : b.other;
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/**
 * Summiert/mittelt alle relevanten Health-Records, deren Startzeit ins halboffene
 * Fenster [startedAt, startedAt + minutes) fällt. xmlText ist der volle Inhalt der
 * export.xml. Ein Feld ist null, wenn im Fenster keine passenden Datensätze liegen.
 */
export function summarizeAppleHealthWindow(
  xmlText: string,
  startedAt: Date,
  minutes: number,
): HealthWindowSummary {
  const from = startedAt.getTime();
  const to = from + minutes * 60_000;

  const distance = newBucket();
  const energy = newBucket();
  const hr = newBucket();

  RECORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RECORD_RE.exec(xmlText))) {
    const tag = m[0];
    const type = TYPE_RE.exec(tag)?.[1];
    if (!type || !RELEVANT_TYPES.has(type)) continue;

    const attrs = parseAttrs(tag);
    const startMs = attrs.startDate ? parseAppleHealthDate(attrs.startDate) : null;
    if (startMs === null || startMs < from || startMs >= to) continue;

    const value = Number(attrs.value);
    if (!Number.isFinite(value)) continue;
    const bucket = isWatchSource(attrs.sourceName ?? '') ? 'watch' : 'other';

    if (type === 'HKQuantityTypeIdentifierDistanceWalkingRunning') {
      distance[bucket].push(toKm(value, attrs.unit ?? 'km'));
    } else if (type === 'HKQuantityTypeIdentifierActiveEnergyBurned') {
      energy[bucket].push(toKcal(value, attrs.unit ?? 'kcal'));
    } else if (type === 'HKQuantityTypeIdentifierHeartRate') {
      hr[bucket].push(value);
    }
  }

  const distanceValues = pick(distance);
  const energyValues = pick(energy);
  const hrValues = pick(hr);

  return {
    distanceKm: distanceValues.length > 0 ? Math.round(sum(distanceValues) * 100) / 100 : null,
    calories: energyValues.length > 0 ? Math.round(sum(energyValues)) : null,
    avgHeartRate: hrValues.length > 0 ? Math.round(sum(hrValues) / hrValues.length) : null,
  };
}
