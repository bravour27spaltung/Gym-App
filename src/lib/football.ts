/**
 * Alter Untertyp der Fußball-Einheiten (Training / Kicken / Spiel). Neue Cardio-Einträge (cardio.ts) legen ihn nicht mehr
 * an; er steht nur noch in älteren Datenbankzeilen (Spalte kind) und wird dort weiter angezeigt.
 */
export type FootballKind = 'training' | 'casual' | 'match';

const KIND_LABELS: Record<FootballKind, string> = {
  training: 'Mannschaftstraining',
  casual: 'Lockeres Kicken',
  match: 'Spiel',
};

export function footballKindLabel(kind: FootballKind): string {
  return KIND_LABELS[kind];
}
