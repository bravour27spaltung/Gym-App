import { describe, expect, it } from 'vitest';
import { applyTheme, DEFAULT_THEME, isThemeId, readTheme, saveTheme, THEMES } from './theme';

describe('theme', () => {
  it('kennt drei Schemata mit eindeutigen Ids', () => {
    expect(THEMES).toHaveLength(3);
    expect(new Set(THEMES.map((t) => t.id)).size).toBe(3);
  });

  it('liest eine gültige Auswahl', () => {
    expect(readTheme({ getItem: () => 'limette' })).toBe('limette');
  });

  it('fällt bei unbekanntem oder fehlendem Wert auf das Standardschema zurück', () => {
    expect(readTheme({ getItem: () => 'neon' })).toBe(DEFAULT_THEME);
    expect(readTheme({ getItem: () => null })).toBe(DEFAULT_THEME);
    expect(isThemeId(42)).toBe(false);
  });

  it('übersteht gesperrten Speicher', () => {
    const blocked = {
      getItem: () => {
        throw new Error('gesperrt');
      },
      setItem: () => {
        throw new Error('gesperrt');
      },
    };
    expect(readTheme(blocked)).toBe(DEFAULT_THEME);
    expect(() => saveTheme('terrakotta', blocked)).not.toThrow();
  });

  it('speichert und setzt das Attribut am Wurzelelement', () => {
    const saved: Record<string, string> = {};
    saveTheme('terrakotta', { setItem: (k, v) => void (saved[k] = v) });
    expect(saved['gym-theme']).toBe('terrakotta');
    const root = { dataset: {} as DOMStringMap };
    applyTheme('limette', root);
    expect(root.dataset.theme).toBe('limette');
  });
});
