import type { MuscleKey } from './muscles';

/**
 * Körperkarte für die Muskelanzeige: schematische Vorder- und Rückansicht als SVG-Pfade
 * (Koordinatenraum 100 × 200, Körpermitte bei x = 50). Nur die rechte Bildhälfte ist
 * gezeichnet; mit `mirror` wird der Pfad für die linke Seite gespiegelt. Die Reihenfolge
 * ist die Zeichenreihenfolge, spätere Flächen liegen über früheren.
 *
 * Bewusst schematisch und ohne Fremdmaterial: keine Bilddatei, keine Lizenz, keine Kosten.
 */

export interface Region {
  d: string;
  mirror: boolean;
}

export interface MuscleRegion extends Region {
  key: MuscleKey;
}

export type BodyView = 'front' | 'back';

/** Kopf, Rumpf, Arme, Hände, Beine, Füße: gleich in beiden Ansichten, immer neutral. */
const BASE: Region[] = [
  { d: 'M41 14 a9 11 0 1 0 18 0 a9 11 0 1 0 -18 0Z', mirror: false },
  {
    d: 'M40 33 L60 33 L67 36 L73 46 L71 70 L69 100 L70 110 L30 110 L31 100 L29 70 L27 46 L33 36 Z',
    mirror: false,
  },
  { d: 'M74 44 L86 48 L87 78 L86 108 L77 108 L76 78 Z', mirror: true },
  { d: 'M77 108 L86 108 L86 118 C85 122 79 122 77 118 Z', mirror: true },
  { d: 'M51 106 L70 106 C71 125 69 140 66 152 L64 192 L56 192 L54 152 C52 140 51 125 51 106 Z', mirror: true },
  { d: 'M55 192 L65 192 L68 198 L53 198 Z', mirror: true },
];

const NECK: MuscleRegion = { key: 'neck', d: 'M45 24 L55 24 L55 33 L45 33 Z', mirror: false };
const SHOULDERS: MuscleRegion = {
  key: 'shoulders',
  d: 'M65 43 a8 9 0 1 0 16 0 a8 9 0 1 0 -16 0Z',
  mirror: true,
};
const UPPER_ARM = 'M76 50 L85 52 L85 76 L77 76 Z';
const FOREARMS: MuscleRegion = { key: 'forearms', d: 'M77 79 L85 79 L84 106 L78 106 Z', mirror: true };
const ABDUCTORS: MuscleRegion = { key: 'abductors', d: 'M68 101 L74 104 L72 121 L68 119 Z', mirror: true };

const FRONT: MuscleRegion[] = [
  NECK,
  { key: 'traps', d: 'M54 31 L64 36 L61 41 L54 37 Z', mirror: true },
  SHOULDERS,
  { key: 'chest', d: 'M51 40 L65 40 C70 43 70 53 66 58 C62 62 54 62 51 60 Z', mirror: true },
  { key: 'abdominals', d: 'M42 64 L58 64 L57 100 L43 100 Z', mirror: false },
  { key: 'biceps', d: UPPER_ARM, mirror: true },
  FOREARMS,
  { key: 'quadriceps', d: 'M53 108 L69 108 C70 124 68 138 65 150 L56 150 C54 138 52 124 53 108 Z', mirror: true },
  { key: 'adductors', d: 'M50 110 L55 112 L56 136 L50 128 Z', mirror: true },
  ABDUCTORS,
  { key: 'calves', d: 'M55 154 L66 154 C67 168 65 182 62 190 L57 190 C55 180 54 166 55 154 Z', mirror: true },
];

const BACK: MuscleRegion[] = [
  NECK,
  { key: 'traps', d: 'M50 30 L66 37 L62 48 L50 60 L38 48 L34 37 Z', mirror: false },
  SHOULDERS,
  { key: 'lats', d: 'M62 52 L71 52 L69 70 L60 88 L54 86 L58 76 L61 66 Z', mirror: true },
  { key: 'middle back', d: 'M50 60 L60 52 L60 68 L55 74 L50 76 Z', mirror: true },
  { key: 'lower back', d: 'M43 82 L57 82 L56 100 L44 100 Z', mirror: false },
  { key: 'triceps', d: UPPER_ARM, mirror: true },
  FOREARMS,
  { key: 'glutes', d: 'M51 102 L68 102 C72 108 70 120 66 124 L51 124 Z', mirror: true },
  ABDUCTORS,
  { key: 'hamstrings', d: 'M53 126 L68 126 C69 138 67 148 64 152 L55 152 C53 142 53 134 53 126 Z', mirror: true },
  { key: 'calves', d: 'M55 156 L66 156 C68 168 65 180 62 190 L57 190 C54 180 53 166 55 156 Z', mirror: true },
];

export const BODY_BASE = BASE;
export const BODY_REGIONS: Record<BodyView, MuscleRegion[]> = { front: FRONT, back: BACK };

/**
 * Welche Ansicht zeigt die meisten der hervorgehobenen Muskeln? Bei Gleichstand
 * (auch ohne Treffer) die Vorderansicht. Für die einzelne Ansicht in Listen.
 */
export function bestView(highlighted: readonly string[]): BodyView {
  const count = (view: BodyView) =>
    BODY_REGIONS[view].filter((r) => highlighted.includes(r.key)).length;
  return count('back') > count('front') ? 'back' : 'front';
}
