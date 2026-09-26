import { describe, expect, it } from 'vitest';
import { BODY_REGIONS, bestView } from './bodymap';
import { MUSCLES } from './muscles';

describe('bodymap', () => {
  it('deckt jeden Muskel der Auswahl in mindestens einer Ansicht ab', () => {
    const drawn = new Set([...BODY_REGIONS.front, ...BODY_REGIONS.back].map((r) => r.key));
    for (const m of MUSCLES) expect(drawn.has(m.key), m.key).toBe(true);
  });

  it('zeichnet keinen Muskel doppelt innerhalb einer Ansicht', () => {
    for (const view of ['front', 'back'] as const) {
      const keys = BODY_REGIONS[view].map((r) => r.key);
      expect(new Set(keys).size, view).toBe(keys.length);
    }
  });

  it('wählt die Ansicht mit den meisten Treffern, sonst vorne', () => {
    expect(bestView(['chest', 'biceps'])).toBe('front');
    expect(bestView(['lats', 'triceps'])).toBe('back');
    expect(bestView(['glutes', 'hamstrings', 'quadriceps'])).toBe('back');
    expect(bestView([])).toBe('front');
    expect(bestView(['unbekannt'])).toBe('front');
  });
});
