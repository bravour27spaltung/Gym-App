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

/**
 * Feste Wochentermine als Schnellwahl im Fußball-Formular: ein Tipp stellt Datum (letzter
 * passender Termin), Startzeit, Dauer und Art ein. Hier anpassen, wenn sich die Zeiten ändern.
 * weekday: 0 = Sonntag … 6 = Samstag (wie Date.getDay()).
 */
export interface FootballPreset {
  id: string;
  label: string;
  weekday: number;
  /** "HH:MM". */
  startTime: string;
  minutes: number;
  kind: FootballKind;
}

export const FOOTBALL_PRESETS: FootballPreset[] = [
  { id: 'tue', label: 'Di 19:30–21:00', weekday: 2, startTime: '19:30', minutes: 90, kind: 'training' },
  { id: 'sun', label: 'So 13:00–15:45', weekday: 0, startTime: '13:00', minutes: 165, kind: 'match' },
];

/**
 * Datum ("YYYY-MM-DD", lokale Zeit) des letzten Termins dieses Wochentags, dessen Startzeit
 * schon vorbei ist (heute zählt, sobald die Startzeit erreicht ist).
 */
export function presetDate(preset: FootballPreset, now: Date): string {
  const [h, m] = preset.startTime.split(':').map(Number);
  for (let back = 0; back <= 7; back++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back, h, m, 0, 0);
    if (d.getDay() === preset.weekday && d.getTime() <= now.getTime()) {
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${mm}-${dd}`;
    }
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
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
