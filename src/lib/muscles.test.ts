import { describe, expect, it } from 'vitest';
import { MUSCLES, muscleLabel, toggleMuscle } from './muscles';

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
});
