import { describe, expect, it } from 'vitest';
import { pctChange, rangeChange, rangeStart, withPctToPrevious } from './progressRange';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 29, 12);
const p = (daysAgo: number, value: number) => ({ at: NOW - daysAgo * DAY, value });

describe('rangeStart', () => {
  it('rechnet Woche, Monat und Jahr zurück, Gesamt schneidet nicht zu', () => {
    expect(rangeStart('week', NOW)).toBe(NOW - 7 * DAY);
    expect(rangeStart('month', NOW)).toBe(NOW - 30 * DAY);
    expect(rangeStart('year', NOW)).toBe(NOW - 365 * DAY);
    expect(rangeStart('all', NOW)).toBeNull();
  });
});

describe('pctChange', () => {
  it('liefert Prozent mit Vorzeichen', () => {
    expect(pctChange(100, 110)).toBeCloseTo(10);
    expect(pctChange(80, 60)).toBeCloseTo(-25);
    expect(pctChange(50, 50)).toBe(0);
  });
  it('liefert null ohne gültigen Ausgangswert', () => {
    expect(pctChange(0, 10)).toBeNull();
    expect(pctChange(-5, 10)).toBeNull();
    expect(pctChange(Number.NaN, 10)).toBeNull();
  });
});

describe('withPctToPrevious', () => {
  it('rechnet je Punkt gegen den Punkt davor, auch bei unsortierter Eingabe', () => {
    const out = withPctToPrevious([p(0, 110), p(14, 100), p(7, 105)]);
    expect(out.map((x) => x.value)).toEqual([100, 105, 110]);
    expect(out[0].pctPrev).toBeNull();
    expect(out[1].pctPrev).toBeCloseTo(5);
    expect(out[2].pctPrev).toBeCloseTo((5 / 105) * 100);
  });
});

describe('rangeChange', () => {
  const full = [p(60, 90), p(20, 100), p(5, 110)];

  it('Gesamt: erster gegen letzten Wert', () => {
    const c = rangeChange(full, null)!;
    expect(c.base.value).toBe(90);
    expect(c.last.value).toBe(110);
    expect(c.abs).toBe(20);
    expect(c.pct).toBeCloseTo((20 / 90) * 100);
  });

  it('Woche: letzter Wert gegen den Stand direkt vor dem Zeitraum', () => {
    const c = rangeChange(full, rangeStart('week', NOW))!;
    expect(c.base.value).toBe(100);
    expect(c.last.value).toBe(110);
    expect(c.pct).toBeCloseTo(10);
  });

  it('Monat: nutzt den Stand vor dem Zeitraum, wenn es einen gibt', () => {
    const c = rangeChange(full, rangeStart('month', NOW))!;
    expect(c.base.value).toBe(90);
    expect(c.pct).toBeCloseTo((20 / 90) * 100);
  });

  it('ohne Stand davor zählt der erste Wert im Zeitraum', () => {
    const c = rangeChange(full, rangeStart('year', NOW))!;
    expect(c.base.value).toBe(90);
    expect(c.last.value).toBe(110);
  });

  it('liefert null bei nur einem Wert oder keinem Wert im Zeitraum', () => {
    expect(rangeChange([p(5, 100)], null)).toBeNull();
    expect(rangeChange([p(5, 100)], rangeStart('week', NOW))).toBeNull();
    expect(rangeChange([p(40, 100)], rangeStart('week', NOW))).toBeNull();
    expect(rangeChange([], null)).toBeNull();
  });

  it('Rückgang ergibt negative Prozent', () => {
    const c = rangeChange([p(10, 100), p(1, 90)], null)!;
    expect(c.abs).toBe(-10);
    expect(c.pct).toBeCloseTo(-10);
  });
});
