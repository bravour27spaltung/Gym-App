import { describe, expect, it } from 'vitest';
import { MUSCLES, cycleMuscle, muscleLabel, toggleMuscle } from './muscles';

describe('muscles', () => {
  it('hat eindeutige Schlüssel und deutsche Namen', () => {
    const keys = MUSCLES.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(muscleLabel('lats')).toBe('Latissimus');
    expect(muscleLabel('unbekannt')).toBe('unbekannt');
  });

  it('schaltet an und aus', () => {
    expect(toggleMuscle([], [], 'chest')).toEqual({ list: ['chest'], other: [] });
    expect(toggleMuscle(['chest'], [], 'chest')).toEqual({ list: [], other: [] });
  });

  it('entfernt den Muskel aus der anderen Liste, wenn er eingeschaltet wird', () => {
    expect(toggleMuscle([], ['triceps'], 'triceps')).toEqual({ list: ['triceps'], other: [] });
    expect(toggleMuscle(['chest'], ['triceps'], 'chest')).toEqual({ list: [], other: ['triceps'] });
  });
  it('wechselt beim Tippen: Haupt, Hilfs, aus', () => {
    const a = cycleMuscle([], [], 'chest');
    expect(a).toEqual({ primary: ['chest'], secondary: [] });
    const b = cycleMuscle(a.primary, a.secondary, 'chest');
    expect(b).toEqual({ primary: [], secondary: ['chest'] });
    const c = cycleMuscle(b.primary, b.secondary, 'chest');
    expect(c).toEqual({ primary: [], secondary: [] });
    expect(cycleMuscle(['chest'], ['triceps'], 'lats')).toEqual({ primary: ['chest', 'lats'], secondary: ['triceps'] });
  });
});
