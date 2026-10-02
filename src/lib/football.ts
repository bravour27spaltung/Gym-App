import { newId } from './workout';

/**
 * Fußball: eigener, bewusst einfacher Bereich – ein Eintrag pro Einheit/Spiel,
 * nachträglich ausgefüllt (kein Live-Timer wie beim Training). Reine Logik ohne
 * Browser- oder Datenbankzugriff, damit sie sich testen lässt und offline funktioniert.
 */

export type FootballKind = 'training' | 'casual' | 'match';

export const FOOTBALL_KINDS: FootballKind[] = ['training', 'casual', 'match'];

const KIND_LABELS: Record<FootballKind, string> = {
  training: 'Mannschaftstraining',
  casual: 'Lockeres Kicken',
  match: 'Spiel',
};

export function footballKindLabel(kind: FootballKind): string {
  return KIND_LABELS[kind];
}

/**
 * Session-RPE-Belastung (Foster et al.): Dauer in Minuten × subjektive Belastung (RPE,
 * 0–10). Gängiges, einfaches Maß für die Trainingslast einer Einheit.
 */
export function footballLoad(minutes: number, rpe: number): number {
  return minutes * rpe;
}

export type FootballSource = 'manual' | 'apple_health';

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

export interface FootballEntryInput {
  /** Datum im Format "YYYY-MM-DD". */
  playedOn: string;
  /**
   * Uhrzeit "HH:MM" (optional). Wird bisher nur für den Apple-Health-Fensterabgleich
   * gebraucht (welche Health-Datensätze fallen in die Einheit) und mitgespeichert.
   */
  startedAtTime?: string | null;
  kind: FootballKind;
  minutes: number;
  rpe: number;
  note: string;
  /** Aus einem Apple-Health-Export übernommen oder manuell eingetragen; alle optional. */
  distanceKm?: number | null;
  calories?: number | null;
  avgHeartRate?: number | null;
  source?: FootballSource;
  /** Vorschlag der Apple Watch, aus dem die Werte stammen (wird nach dem Speichern verknüpft). */
  watchWindowId?: string | null;
}

export interface FootballPayload {
  session: {
    id: string;
    played_on: string;
    started_at: string | null;
    kind: FootballKind;
    minutes: number;
    rpe: number;
    note: string | null;
    distance_km: number | null;
    calories: number | null;
    avg_heart_rate: number | null;
    source: FootballSource;
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

/**
 * Baut die Datenbankzeile aus der Formulareingabe. Ohne gültige Dauer (> 0) oder mit
 * RPE außerhalb 0–10 wird nichts gespeichert (null).
 */
export function buildFootballPayload(input: FootballEntryInput): FootballPayload | null {
  const minutes = Math.round(input.minutes);
  if (!Number.isFinite(minutes) || minutes <= 0) return null;
  const rpe = Math.round(input.rpe);
  if (!Number.isFinite(rpe) || rpe < 0 || rpe > 10) return null;
  if (input.playedOn.trim() === '') return null;

  let startedAt: string | null = null;
  if (input.startedAtTime && input.startedAtTime.trim() !== '') {
    const ms = new Date(`${input.playedOn}T${input.startedAtTime}:00`).getTime();
    if (Number.isFinite(ms)) startedAt = new Date(ms).toISOString();
  }

  return {
    session: {
      id: newId(),
      played_on: input.playedOn,
      started_at: startedAt,
      kind: input.kind,
      minutes,
      rpe,
      note: input.note.trim() === '' ? null : input.note.trim(),
      distance_km: nonNegOrNull(input.distanceKm),
      calories: nonNegOrNull(input.calories) === null ? null : Math.round(nonNegOrNull(input.calories)!),
      avg_heart_rate: heartRateOrNull(input.avgHeartRate),
      source: input.source ?? 'manual',
    },
  };
}
