/**
 * Farbschemata: Sie ändern nur die Akzentfarben (Hero, Auswahl, Hervorhebungen).
 * Gespeichert wird allein die Auswahl, lokal im Browser dieses Geräts.
 */
export type ThemeId = 'indigo' | 'limette' | 'terrakotta';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  hint: string;
  /** Vorschau-Farben für die Auswahl: Fläche und Akzent. */
  base: string;
  bright: string;
}

export const THEMES: ThemeOption[] = [
  { id: 'indigo', name: 'Indigo', hint: 'Ruhig und klar', base: '#4338E0', bright: '#8F86FF' },
  { id: 'limette', name: 'Limette', hint: 'Sportlich, hell', base: '#4B6A00', bright: '#CDEF4B' },
  { id: 'terrakotta', name: 'Terrakotta', hint: 'Warm und kräftig', base: '#B83300', bright: '#FF9B70' },
];

export const DEFAULT_THEME: ThemeId = 'indigo';
const KEY = 'gym-theme';

export function isThemeId(value: unknown): value is ThemeId {
  return THEMES.some((t) => t.id === value);
}

/** Gespeicherte Auswahl; bei fehlendem oder ungültigem Wert (oder gesperrtem Speicher) das Standardschema. */
export function readTheme(storage?: Pick<Storage, 'getItem'>): ThemeId {
  try {
    const value = (storage ?? localStorage).getItem(KEY);
    return isThemeId(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function saveTheme(id: ThemeId, storage?: Pick<Storage, 'setItem'>): void {
  try {
    (storage ?? localStorage).setItem(KEY, id);
  } catch {
    // Speicher gesperrt (z. B. privater Modus): Auswahl gilt dann nur bis zum Neuladen.
  }
}

export function applyTheme(id: ThemeId, root: { dataset: DOMStringMap } = document.documentElement): void {
  root.dataset.theme = id;
}

/** Beim Start vor dem ersten Zeichnen aufrufen, damit nichts in der falschen Farbe aufblitzt. */
export function initTheme(): ThemeId {
  const id = readTheme();
  applyTheme(id);
  return id;
}
