import { describe, expect, it } from 'vitest';
import { buildRecoveryPayload, computeRecoveryBaseline, computeRecoveryScore, prsAnchor } from './recovery';
import type { HistRecoveryEntry } from './storage';

function entry(date: string, overrides: Partial<HistRecoveryEntry> = {}): HistRecoveryEntry {
  return {
    id: date,
    date,
    perceivedRecovery: 5,
    soreness: null,
    stress: null,
    sleepQuality: null,
    note: null,
    hrvMs: null,
    restingHr: null,
    sleepHours: null,
    source: 'manual',
    ...overrides,
  };
}

describe('prsAnchor', () => {
  it('rundet auf die nächste gerade Stufe und liefert deren Textanker', () => {
    expect(prsAnchor(0)).toBe('Extrem müde, keine Erholung');
    expect(prsAnchor(7)).toBe('Gut erholt'); // rundet auf 8
    expect(prsAnchor(10)).toBe('Vollständig erholt');
  });
});

describe('buildRecoveryPayload', () => {
  it('baut eine gültige Zeile aus der Eingabe', () => {
    const p = buildRecoveryPayload({
      date: '2026-09-28',
      perceivedRecovery: 8,
      soreness: 2,
      stress: 3,
      sleepQuality: 4,
      note: '  gut geschlafen  ',
    });
    expect(p).not.toBeNull();
    expect(p!.entry).toMatchObject({
      date: '2026-09-28',
      perceived_recovery: 8,
      soreness: 2,
      stress: 3,
      sleep_quality: 4,
      note: 'gut geschlafen',
      source: 'manual',
    });
    expect(typeof p!.entry.id).toBe('string');
  });

  it('rundet den PRS-Wert', () => {
    const p = buildRecoveryPayload({ date: '2026-09-28', perceivedRecovery: 6.6, note: '' });
    expect(p!.entry.perceived_recovery).toBe(7);
  });

  it('leere Notiz wird zu null', () => {
    const p = buildRecoveryPayload({ date: '2026-09-28', perceivedRecovery: 5, note: '   ' });
    expect(p!.entry.note).toBeNull();
  });

  it('lehnt ein leeres Datum ab', () => {
    expect(buildRecoveryPayload({ date: '', perceivedRecovery: 5, note: '' })).toBeNull();
  });

  it('lehnt einen PRS-Wert außerhalb von 0-10 ab', () => {
    expect(buildRecoveryPayload({ date: '2026-09-28', perceivedRecovery: 11, note: '' })).toBeNull();
    expect(buildRecoveryPayload({ date: '2026-09-28', perceivedRecovery: -1, note: '' })).toBeNull();
  });

  it('übernimmt optionale Health-Werte', () => {
    const p = buildRecoveryPayload({
      date: '2026-09-28',
      perceivedRecovery: 7,
      note: '',
      hrvMs: 45.3,
      restingHr: 51.6,
      sleepHours: 7.25,
      source: 'apple_health',
    });
    expect(p!.entry.hrv_ms).toBe(45.3);
    expect(p!.entry.resting_hr).toBe(52);
    expect(p!.entry.sleep_hours).toBe(7.25);
    expect(p!.entry.source).toBe('apple_health');
  });

  it('ohne Zusatz-/Health-Werte bleiben die optionalen Felder null, Quelle ist "manual"', () => {
    const p = buildRecoveryPayload({ date: '2026-09-28', perceivedRecovery: 5, note: '' });
    expect(p!.entry).toMatchObject({
      soreness: null,
      stress: null,
      sleep_quality: null,
      hrv_ms: null,
      resting_hr: null,
      sleep_hours: null,
      source: 'manual',
    });
  });

  it('unplausible Zusatz-/Health-Werte werden ignoriert (null) statt die Eingabe abzulehnen', () => {
    const p = buildRecoveryPayload({
      date: '2026-09-28',
      perceivedRecovery: 5,
      note: '',
      soreness: 9,
      stress: 0,
      hrvMs: -5,
      restingHr: 250,
      sleepHours: 30,
    });
    expect(p!.entry.soreness).toBeNull();
    expect(p!.entry.stress).toBeNull();
    expect(p!.entry.hrv_ms).toBeNull();
    expect(p!.entry.resting_hr).toBeNull();
    expect(p!.entry.sleep_hours).toBeNull();
  });
});

describe('computeRecoveryBaseline', () => {
  it('liefert null ohne genug Werte im 7-Tage-Fenster vor dem Datum', () => {
    const history = [
      entry('2026-09-24', { hrvMs: 50, restingHr: 48 }),
      entry('2026-09-25', { hrvMs: 52, restingHr: 47 }),
    ];
    const baseline = computeRecoveryBaseline(history, '2026-09-28');
    expect(baseline.hrvMean).toBeNull();
    expect(baseline.restingHrMean).toBeNull();
    expect(baseline.hrvSamples).toBe(2);
  });

  it('berechnet Mittelwert/SD ab 4 Werten im Fenster', () => {
    const history = [
      entry('2026-09-22', { hrvMs: 40, restingHr: 50 }),
      entry('2026-09-23', { hrvMs: 50, restingHr: 48 }),
      entry('2026-09-24', { hrvMs: 60, restingHr: 46 }),
      entry('2026-09-25', { hrvMs: 50, restingHr: 48 }),
    ];
    const baseline = computeRecoveryBaseline(history, '2026-09-28');
    expect(baseline.hrvSamples).toBe(4);
    expect(baseline.hrvMean).toBe(50);
    expect(baseline.hrvSd).toBeGreaterThan(0);
    expect(baseline.restingHrMean).toBe(48);
  });

  it('zählt den Tag selbst und Tage außerhalb des Fensters nicht mit', () => {
    const history = [
      entry('2026-09-10', { hrvMs: 999, restingHr: 999 }), // zu weit zurück
      entry('2026-09-22', { hrvMs: 40, restingHr: 50 }),
      entry('2026-09-23', { hrvMs: 50, restingHr: 48 }),
      entry('2026-09-24', { hrvMs: 60, restingHr: 46 }),
      entry('2026-09-25', { hrvMs: 50, restingHr: 48 }),
      entry('2026-09-28', { hrvMs: 1, restingHr: 1 }), // der Tag selbst
    ];
    const baseline = computeRecoveryBaseline(history, '2026-09-28');
    expect(baseline.hrvSamples).toBe(4);
    expect(baseline.hrvMean).toBe(50);
  });
});

describe('computeRecoveryScore', () => {
  const noBaseline = computeRecoveryBaseline([], '2026-09-28');

  it('stützt sich ohne Baseline und ohne Health-Werte allein auf PRS', () => {
    const result = computeRecoveryScore(
      { perceivedRecovery: 8, hrvMs: null, restingHr: null, sleepHours: null },
      noBaseline,
    );
    expect(result.score).toBe(80);
    expect(result.weightsUsed).toEqual({ prs: 1, hrv: 0, restingHr: 0, sleep: 0 });
    expect(result.parts.hrv).toBeNull();
  });

  it('mischt PRS und Schlaf, wenn keine Baseline für HRV/Puls existiert', () => {
    const result = computeRecoveryScore(
      { perceivedRecovery: 10, hrvMs: 50, restingHr: 48, sleepHours: 8 },
      noBaseline,
    );
    // Ohne Baseline bleiben hrv/restingHr null, obwohl Werte da sind.
    expect(result.parts.hrv).toBeNull();
    expect(result.parts.restingHr).toBeNull();
    expect(result.parts.sleep).toBe(100);
    expect(result.score).toBe(100); // PRS 100 + Schlaf 100, neu gewichtet
  });

  it('bewertet HRV über Baseline besser als HRV unter Baseline', () => {
    const baseline = {
      hrvMean: 50,
      hrvSd: 10,
      hrvSamples: 7,
      restingHrMean: 48,
      restingHrSd: 4,
      restingHrSamples: 7,
    };
    const better = computeRecoveryScore(
      { perceivedRecovery: 5, hrvMs: 65, restingHr: 48, sleepHours: 8 },
      baseline,
    );
    const worse = computeRecoveryScore(
      { perceivedRecovery: 5, hrvMs: 35, restingHr: 48, sleepHours: 8 },
      baseline,
    );
    expect(better.parts.hrv).toBeGreaterThan(worse.parts.hrv!);
    expect(better.score).toBeGreaterThan(worse.score);
  });

  it('bewertet einen erhöhten Ruhepuls gegenüber der Baseline schlechter', () => {
    const baseline = {
      hrvMean: 50,
      hrvSd: 10,
      hrvSamples: 7,
      restingHrMean: 48,
      restingHrSd: 4,
      restingHrSamples: 7,
    };
    const normal = computeRecoveryScore(
      { perceivedRecovery: 5, hrvMs: 50, restingHr: 48, sleepHours: 8 },
      baseline,
    );
    const elevated = computeRecoveryScore(
      { perceivedRecovery: 5, hrvMs: 50, restingHr: 60, sleepHours: 8 },
      baseline,
    );
    expect(elevated.parts.restingHr).toBeLessThan(normal.parts.restingHr!);
    expect(elevated.score).toBeLessThan(normal.score);
  });

  it('deckelt die Schlafwertung bei 100%, auch bei überdurchschnittlich viel Schlaf', () => {
    const result = computeRecoveryScore(
      { perceivedRecovery: 5, hrvMs: null, restingHr: null, sleepHours: 12 },
      noBaseline,
    );
    expect(result.parts.sleep).toBe(100);
  });

  it('gewichtet Teile proportional neu, sodass sie immer in Summe 1 ergeben', () => {
    const baseline = {
      hrvMean: 50,
      hrvSd: 10,
      hrvSamples: 7,
      restingHrMean: null,
      restingHrSd: null,
      restingHrSamples: 2,
    };
    const result = computeRecoveryScore(
      { perceivedRecovery: 5, hrvMs: 50, restingHr: 48, sleepHours: null },
      baseline,
    );
    const sum = Object.values(result.weightsUsed).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1);
    expect(result.weightsUsed.restingHr).toBe(0);
    expect(result.weightsUsed.sleep).toBe(0);
  });
});
