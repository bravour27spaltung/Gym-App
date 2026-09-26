import { describe, expect, it } from 'vitest';
import { guessMuscles } from './muscleGuess';
import { MUSCLES } from './muscles';

describe('guessMuscles', () => {
  it('erkennt gängige deutsche und englische Namen', () => {
    expect(guessMuscles('Bankdrücken')).toEqual({ primary: ['chest'], secondary: ['triceps', 'shoulders'] });
    expect(guessMuscles('Schrägbank Kurzhantel')?.primary).toEqual(['chest']);
    expect(guessMuscles('Latzug eng')?.primary).toEqual(['lats']);
    expect(guessMuscles('Latziehen')?.primary).toEqual(['lats']);
    expect(guessMuscles('Squat')?.primary).toEqual(['quadriceps']);
    expect(guessMuscles('Bizeps Curl')?.primary).toEqual(['biceps']);
    expect(guessMuscles('Wadenheben stehend')?.primary).toEqual(['calves']);
  });

  it('bevorzugt Spezialfälle vor allgemeinen Regeln', () => {
    expect(guessMuscles('Leg Curl')?.primary).toEqual(['hamstrings']);
    expect(guessMuscles('Beinbeuger sitzend')?.primary).toEqual(['hamstrings']);
    expect(guessMuscles('Aufrechtes Rudern')?.primary).toEqual(['traps']);
    expect(guessMuscles('Rudern am Kabel')?.primary).toEqual(['middle back']);
    expect(guessMuscles('Enges Bankdrücken')?.primary).toEqual(['triceps']);
    expect(guessMuscles('Trizeps Kickback')?.primary).toEqual(['triceps']);
    expect(guessMuscles('Face Pulls')?.primary).toEqual(['shoulders']);
    expect(guessMuscles('Rumänisches Kreuzheben')?.primary).toEqual(['hamstrings', 'glutes']);
  });

  it('gibt bei unbekannten oder zu kurzen Namen null zurück', () => {
    expect(guessMuscles('Xyz Spezial')).toBeNull();
    expect(guessMuscles('ab')).toBeNull();
    expect(guessMuscles('')).toBeNull();
  });

  it('nutzt nur bekannte Muskelschlüssel', () => {
    const known = new Set<string>(MUSCLES.map((m) => m.key));
    for (const name of ['Bankdrücken', 'Latziehen', 'Kniebeuge', 'Kreuzheben', 'Hip Thrust', 'Crunch', 'Face Pull', 'Dips']) {
      const g = guessMuscles(name)!;
      for (const k of [...g.primary, ...g.secondary]) expect(known.has(k), `${name}: ${k}`).toBe(true);
    }
  });
});
