import { describe, expect, it } from 'vitest';
import { MUSCLES } from './muscles';
import { STRETCH_CATALOG, STRETCH_PLAN_CATALOG } from './stretchCatalog';

const MUSCLE_KEYS = new Set<string>(MUSCLES.map((m) => m.key));

describe('STRETCH_CATALOG', () => {
  it('hat eindeutige IDs', () => {
    const ids = STRETCH_CATALOG.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('verwendet nur gültige Muskel-Schlüssel', () => {
    for (const s of STRETCH_CATALOG) {
      for (const m of s.muscles) {
        expect(MUSCLE_KEYS.has(m)).toBe(true);
      }
    }
  });

  it('hat eine positive Standard-Haltezeit je Übung', () => {
    for (const s of STRETCH_CATALOG) {
      expect(s.holdSeconds).toBeGreaterThan(0);
    }
  });
});

describe('STRETCH_PLAN_CATALOG', () => {
  const catalogIds = new Set(STRETCH_CATALOG.map((s) => s.id));

  it('hat eindeutige Plan-IDs', () => {
    const ids = STRETCH_PLAN_CATALOG.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('verweist nur auf Übungen aus dem Katalog', () => {
    for (const p of STRETCH_PLAN_CATALOG) {
      expect(p.items.length).toBeGreaterThan(0);
      for (const it of p.items) {
        expect(catalogIds.has(it.stretchId)).toBe(true);
      }
    }
  });

  it('teilt keine Plan-IDs mit den Übungs-IDs', () => {
    for (const p of STRETCH_PLAN_CATALOG) {
      expect(catalogIds.has(p.id)).toBe(false);
    }
  });
});
