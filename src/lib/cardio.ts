import { newId } from './workout';

/**
 * Cardio: Fußball, Laufen und Radfahren in einem Bereich. Ein Eintrag pro Einheit, nachträglich ausgefüllt (kein
 * Live-Timer). Reine Logik ohne Browser- oder Datenbankzugriff, damit sie sich testen lässt und offline funktioniert.
 *
 * Löst football.ts ab: gleiche Felder, dazu die Aktivität und der Maximalpuls der Einheit. Den früheren Untertyp
 * (Training/Kicken/Spiel) legen neue Einträge nicht mehr an; er bleibt nur in alten Datenbankzeilen (Spalte kind).
 */

export type CardioActivity = 'football' | 'running' | 'cycling';

export const CARDIO_ACTIVITIES: CardioActivity[] = ['football', 'running', 'cycling'];

const ACTIVITY_LABELS: Record<CardioActivity, string> = {
  football: 'Fußball',
  running: 'Laufen',
  cycling: 'Radfahren',
};

export function cardioActivityLabel(activity: CardioActivity): string {
  return ACTIVITY_LABELS[activity];
}

/** Unbekannte oder fehlende Werte (z. B. aus älteren Zeilen) gelten als Fußball, so wie die Datenbank-Vorgabe. */
export function parseCardioActivity(value: unknown): CardioActivity {
  return value === 'running' || value === 'cycling' ? value : 'football';
}

/** Beim Fußball ist die subjektive Belastung Pflicht, beim Laufen und Radfahren optional. */
export function rpeRequired(activity: CardioActivity): boolean {
  return activity === 'football';
}

/**
 * Session-RPE-Belastung (Foster et al.): Dauer in Minuten × subjektive Belastung (RPE, 0–10).
 * Ohne RPE (Laufen/Rad, optional) gibt es keinen Wert, statt einen zu raten.
 */
export function cardioLoad(minutes: number, rpe: number | null | undefined): number | null {
  if (rpe === null || rpe === undefined || !Number.isFinite(rpe)) return null;
  return minutes * rpe;
}

export type CardioSource = 'manual' | 'apple_health';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeToMinutes(time: string): number | null {
  const m = time.match(TIME_RE);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** "HH:MM" plus Minuten, über Mitternacht hinweg ("23:30" + 60 = "00:30"); ungültige Zeit ergibt "". */
export function addMinutesToTime(time: string, minutes: number): string {
  const base = timeToMinutes(time);
  if (base === null || !Number.isFinite(minutes)) return '';
  const total = (((base + Math.round(minutes)) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Minuten von Start bis Ende ("HH:MM"). Liegt das Ende nicht nach dem Start, gilt es als am
 * Folgetag (13:00 bis 01:00 = 720 min); gleiche Zeiten ergeben 0. Ungültige Zeit ergibt NaN.
 */
export function minutesBetweenTimes(start: string, end: string): number {
  const a = timeToMinutes(start);
  const b = timeToMinutes(end);
  if (a === null || b === null) return NaN;
  if (a === b) return 0;
  return b > a ? b - a : b + 1440 - a;
}

export interface CardioEntryInput {
  activity: CardioActivity;
  /** Datum im Format "YYYY-MM-DD". */
  playedOn: string;
  /**
   * Uhrzeit "HH:MM" (optional). Wird für den Health-Archiv-Abgleich gebraucht (welche Pulswerte fallen in die Einheit,
   * also auch für die Pulszonen) und mitgespeichert.
   */
  startedAtTime?: string | null;
  minutes: number;
  /** Subjektive Belastung 0–10; beim Fußball Pflicht, sonst null erlaubt. */
  rpe: number | null;
  note: string;
  /** Aus Apple Health übernommen oder von Hand eingetragen; alle optional. */
  distanceKm?: number | null;
  calories?: number | null;
  steps?: number | null;
  avgHeartRate?: number | null;
  maxHeartRate?: number | null;
  source?: CardioSource;
}

export interface CardioPayload {
  session: {
    id: string;
    activity: CardioActivity;
    played_on: string;
    started_at: string | null;
    minutes: number;
    rpe: number | null;
    note: string | null;
    distance_km: number | null;
    calories: number | null;
    steps: number | null;
    avg_heart_rate: number | null;
    max_heart_rate: number | null;
    source: CardioSource;
  };
}

/** Ungültige/negative Werte werden zu null statt die ganze Eingabe abzulehnen. */
function nonNegOrNull(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return null;
  return n;
}

function heartRateOrNull(n: number | null | undefined): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= 30 && r <= 220 ? r : null;
}

function roundedOrNull(n: number | null | undefined): number | null {
  const v = nonNegOrNull(n);
  return v === null ? null : Math.round(v);
}

/**
 * Baut die Datenbankzeile aus der Formulareingabe. Ohne gültige Dauer (> 0), ohne Datum, mit RPE außerhalb 0–10 oder
 * ohne RPE beim Fußball wird nichts gespeichert (null).
 */
export function buildCardioPayload(input: CardioEntryInput): CardioPayload | null {
  const minutes = Math.round(input.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  if (input.playedOn.trim() === '') return null;

  let rpe: number | null = null;
  if (input.rpe !== null && input.rpe !== undefined) {
    rpe = Math.round(input.rpe);
    if (!Number.isFinite(rpe) || rpe < 0 || rpe > 10) return null;
  } else if (rpeRequired(input.activity)) {
    return null;
  }

  let startedAt: string | null = null;
  if (input.startedAtTime && input.startedAtTime.trim() !== '') {
    const ms = new Date(`${input.playedOn}T${input.startedAtTime}:00`).getTime();
    if (Number.isFinite(ms)) startedAt = new Date(ms).toISOString();
  }

  const note = input.note.trim();
  return {
    session: {
      id: newId(),
      activity: input.activity,
      played_on: input.playedOn,
      started_at: startedAt,
      minutes,
      rpe,
      note: note === '' ? null : note,
      distance_km: nonNegOrNull(input.distanceKm),
      calories: roundedOrNull(input.calories),
      steps: roundedOrNull(input.steps),
      avg_heart_rate: heartRateOrNull(input.avgHeartRate),
      max_heart_rate: heartRateOrNull(input.maxHeartRate),
      source: input.source ?? 'manual',
    },
  };
}

/** Zeitraum einer Einheit in Millisekunden (für den Pulsabgleich im Archiv); null ohne Startzeit. */
export function cardioWindow(startedAt: string | null, minutes: number): { fromMs: number; toMs: number } | null {
  if (!startedAt) return null;
  const fromMs = Date.parse(startedAt);
  if (!Number.isFinite(fromMs) || !Number.isFinite(minutes) || minutes <= 0) return null;
  return { fromMs, toMs: fromMs + minutes * 60_000 };
}
