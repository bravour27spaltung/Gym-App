import { describe, expect, it } from 'vitest';
import {
  composeWeight,
  formatKg,
  roundToStep,
  splitWeight,
  toQuarters,
  totalLoad,
} from './weight';
import { suggestProgression, type LoggedSet } from './progression';
import { suggestWarmup } from './warmup';
import { nextPlanDay } from './rotation';
import { formatClock, isFinished, remainingSeconds, startRest } from './timer';

const work = (weightKg: number, reps: number, rir: number | null): LoggedSet => ({
  type: 'working',
  weightKg,
  reps,
  rir,
});

describe('weight', () => {
  it('zerlegt und setzt Gewichte in ganze Kilo + 0/0,25/0,5/0,75', () => {
    expect(splitWeight(62.75)).toEqual({ wholeKg: 62, fraction: 0.75 });
    expect(splitWeight(60)).toEqual({ wholeKg: 60, fraction: 0 });
    expect(composeWeight(62, 0.5)).toBe(62.5);
  });

  it('lehnt Werte außerhalb des 0,25er-Rasters ab', () => {
    expect(() => toQuarters(62.3)).toThrow();
    expect(toQuarters(1.25)).toBe(5);
  });

  it('rundet auf die Schrittweite', () => {
    expect(roundToStep(43.75, 2.5)).toBe(45);
    expect(roundToStep(41.2, 1.25)).toBe(41.25);
  });

  it('addiert optional das Stangen-/Maschinengewicht', () => {
    expect(totalLoad(40, 20)).toBe(60);
    expect(totalLoad(40, null)).toBe(40);
  });

  it('formatiert deutsch', () => {
    expect(formatKg(62.5)).toBe('62,5 kg');
    expect(formatKg(60)).toBe('60 kg');
  });
});

describe('Double Progression', () => {
  const base = { repMin: 6, repMax: 8, incrementKg: 2.5 };

  it('steigert, wenn mehr als ein Satz die Obergrenze erreicht', () => {
    const r = suggestProgression({
      ...base,
      sets: [work(60, 8, 0), work(60, 8, 0), work(60, 7, 0)],
    });
    expect(r.action).toBe('increase');
    expect(r.weightKg).toBe(62.5);
    expect(r.targetReps).toBe(6);
  });

  it('Beispiel: 2 Sätze mit 12 und 1 Satz mit 11 (Bereich bis 12) führt zur Steigerung', () => {
    const r = suggestProgression({
      repMin: 8,
      repMax: 12,
      incrementKg: 2.5,
      sets: [work(50, 12, 0), work(50, 12, 0), work(50, 11, 0)],
    });
    expect(r.action).toBe('increase');
    expect(r.weightKg).toBe(52.5);
    expect(r.targetReps).toBe(8);
  });

  it('steigert nicht, wenn nur ein Satz die Obergrenze erreicht', () => {
    const r = suggestProgression({ ...base, sets: [work(60, 8, 0), work(60, 7, 0)] });
    expect(r.action).toBe('hold');
    expect(r.weightKg).toBe(60);
  });

  it('RIR beeinflusst den Vorschlag nicht: nur die Wiederholungen zählen', () => {
    for (const rir of [0, 1, 3, null]) {
      const r = suggestProgression({ ...base, sets: [work(60, 8, rir), work(60, 8, rir)] });
      expect(r.action).toBe('increase');
    }
  });

  it('steigert nicht, wenn die Obergrenze nur bei einem leichteren Gewicht erreicht wurde', () => {
    const r = suggestProgression({ ...base, sets: [work(60, 7, 0), work(55, 8, 0), work(55, 8, 0)] });
    expect(r.action).toBe('hold');
    expect(r.weightKg).toBe(60);
  });

  it('strebt eine Wiederholung mehr an, höchstens bis zur Obergrenze', () => {
    const r = suggestProgression({ ...base, sets: [work(60, 6, 0), work(60, 6, 0)] });
    expect(r.targetReps).toBe(7);
  });

  it('ignoriert Aufwärmsätze und leichtere Sätze', () => {
    const r = suggestProgression({
      ...base,
      sets: [
        { type: 'warmup', weightKg: 30, reps: 10, rir: null },
        work(60, 8, 0),
        work(60, 8, 0),
        work(55, 8, 0),
      ],
    });
    expect(r.action).toBe('increase');
    expect(r.weightKg).toBe(62.5);
  });

  it('meldet fehlende Daten', () => {
    expect(suggestProgression({ ...base, sets: [] }).action).toBe('no-data');
  });
});

describe('Aufwärmsätze', () => {
  it('baut eine ansteigende Rampe auf Schrittweiten gerundet', () => {
    const w = suggestWarmup({ workingWeightKg: 80, stepKg: 2.5 });
    expect(w).toEqual([
      { weightKg: 40, reps: 8 },
      { weightKg: 55, reps: 5 },
      { weightKg: 67.5, reps: 3 },
    ]);
  });

  it('rechnet die Prozente auf die Gesamtlast und schlägt das Gewicht ohne Stange vor', () => {
    // Gesamtlast 72,5 kg (52,5 + 20 kg Stange): 36,25 / 50,75 / 61,625 kg gesamt
    const w = suggestWarmup({ workingWeightKg: 52.5, equipmentKg: 20, stepKg: 2.5 });
    expect(w).toEqual([
      { weightKg: 17.5, reps: 8 },
      { weightKg: 30, reps: 5 },
      { weightKg: 42.5, reps: 3 },
    ]);
  });

  it('lässt Aufwärmsätze weg, die schon unter dem Eigengewicht liegen würden', () => {
    const w = suggestWarmup({ workingWeightKg: 10, equipmentKg: 50, stepKg: 2.5 });
    for (const s of w) expect(s.weightKg).toBeGreaterThan(0);
  });

  it('bleibt bei leichten Gewichten unter dem Arbeitsgewicht und ohne Duplikate', () => {
    const w = suggestWarmup({ workingWeightKg: 5, stepKg: 2.5 });
    for (const s of w) expect(s.weightKg).toBeLessThan(5);
    const weights = w.map((s) => s.weightKg);
    expect(new Set(weights).size).toBe(weights.length);
  });

  it('liefert für spätere Übungen nur einen kurzen Satz', () => {
    expect(suggestWarmup({ workingWeightKg: 50, stepKg: 2.5, level: 'short' })).toHaveLength(1);
  });
});

describe('Rotation und Timer', () => {
  const days = [
    { id: 'pull', position: 2 },
    { id: 'push', position: 1 },
    { id: 'lower', position: 3 },
  ];

  it('rotiert Push -> Pull -> Lower -> Push', () => {
    expect(nextPlanDay(days, null)?.id).toBe('push');
    expect(nextPlanDay(days, 'push')?.id).toBe('pull');
    expect(nextPlanDay(days, 'lower')?.id).toBe('push');
    expect(nextPlanDay(days, 'unbekannt')?.id).toBe('push');
    expect(nextPlanDay([], null)).toBeNull();
  });

  it('rechnet die Pause über Zeitstempel', () => {
    const end = startRest(1_000_000, 90);
    expect(remainingSeconds(end, 1_000_000 + 30_000)).toBe(60);
    expect(remainingSeconds(end, end + 5_000)).toBe(0);
    expect(isFinished(end, end)).toBe(true);
    expect(formatClock(75)).toBe('1:15');
  });
});
