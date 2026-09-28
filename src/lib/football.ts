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

export interface FootballEntryInput {
  /** Datum im Format "YYYY-MM-DD". */
  playedOn: string;
  kind: FootballKind;
  minutes: number;
  rpe: number;
  note: string;
}

export interface FootballPayload {
  session: {
    id: string;
    played_on: string;
    kind: FootballKind;
    minutes: number;
    rpe: number;
    note: string | null;
  };
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
  return {
    session: {
      id: newId(),
      played_on: input.playedOn,
      kind: input.kind,
      minutes,
      rpe,
      note: input.note.trim() === '' ? null : input.note.trim(),
    },
  };
}
