import { describe, expect, it } from 'vitest';
import {
  averageRestHr,
  hrPointsFromArchive,
  intensityShares,
  observedMaxHr,
  resolveZoneSettings,
  zoneBounds,
  zoneDistribution,
  zoneIndex,
  type HrPoint,
} from './zones';

describe('zoneBounds', () => {
  it('rechnet mit Ruhepuls (Herzfrequenzreserve)', () => {
    expect(zoneBounds({ model: 'hrr', maxHr: 184, restHr: 52 })).toEqual([118, 131, 144, 158, 171, 184]);
  });

  it('rechnet in Prozent vom Maximalpuls', () => {
    expect(zoneBounds({ model: 'max', maxHr: 184, restHr: 52 })).toEqual([92, 110, 129, 147, 166, 184]);
  });

  it("fällt bei 'hrr' ohne Ruhepuls auf Prozent vom Maximalpuls zurück", () => {
    expect(zoneBounds({ model: 'hrr', maxHr: 184, restHr: null })).toEqual([92, 110, 129, 147, 166, 184]);
  });
});

describe('resolveZoneSettings', () => {
  it('nimmt das gewünschte Modell, wenn die Daten reichen', () => {
    expect(resolveZoneSettings('hrr', 184, 52)).toEqual({ model: 'hrr', maxHr: 184, restHr: 52, fellBack: false });
    expect(resolveZoneSettings('max', 184, 52)).toEqual({ model: 'max', maxHr: 184, restHr: 52, fellBack: false });
  });

  it('fällt zurück und meldet es, wenn der Ruhepuls fehlt oder nicht unter dem Maximalpuls liegt', () => {
    expect(resolveZoneSettings('hrr', 184, null)).toEqual({ model: 'max', maxHr: 184, restHr: null, fellBack: true });
    expect(resolveZoneSettings('hrr', 184, 190)?.fellBack).toBe(true);
  });

  it('liefert ohne gültigen Maximalpuls keine Zonen', () => {
    expect(resolveZoneSettings('hrr', null, 52)).toBeNull();
    expect(resolveZoneSettings('max', 10, 52)).toBeNull();
    expect(resolveZoneSettings('max', 300, 52)).toBeNull();
  });
});

describe('observedMaxHr / averageRestHr', () => {
  it('nimmt den höchsten gültigen Wert und ignoriert Ausreißer und Lücken', () => {
    expect(observedMaxHr([150, null, 176, undefined, 250, 20])).toBe(176);
    expect(observedMaxHr([])).toBeNull();
    expect(observedMaxHr([null])).toBeNull();
  });

  it('mittelt nur gültige Ruhepulswerte', () => {
    expect(averageRestHr([52, 54, null, 51, 500])).toBe(52);
    expect(averageRestHr([])).toBeNull();
  });
});

describe('zoneIndex', () => {
  const b = [118, 131, 144, 158, 171, 184];
  it('ordnet Grenzwerte der oberen Zone zu', () => {
    expect(zoneIndex(117, b)).toBe(-1);
    expect(zoneIndex(118, b)).toBe(0);
    expect(zoneIndex(130, b)).toBe(0);
    expect(zoneIndex(131, b)).toBe(1);
    expect(zoneIndex(171, b)).toBe(4);
  });

  it('zählt Werte über dem Maximalpuls zu Zone 5', () => {
    expect(zoneIndex(184, b)).toBe(4);
    expect(zoneIndex(200, b)).toBe(4);
  });
});

describe('hrPointsFromArchive', () => {
  it('nimmt nur Pulszeilen mit gültigem Wert und rechnet den Zeitpunkt als Mitte', () => {
    const pts = hrPointsFromArchive([
      { kind: 'hr', start_at: '2026-11-16T18:00:00Z', end_at: '2026-11-16T18:00:10Z', value: '140' },
      { kind: 'steps', start_at: '2026-11-16T18:00:00Z', end_at: '2026-11-16T18:01:00Z', value: 80 },
      { kind: 'hr', start_at: 'kaputt', end_at: '2026-11-16T18:00:10Z', value: 140 },
      { kind: 'hr', start_at: '2026-11-16T18:01:00Z', end_at: '2026-11-16T18:01:00Z', value: 999 },
    ]);
    expect(pts).toEqual([{ tMs: Date.parse('2026-11-16T18:00:05Z'), bpm: 140 }]);
  });
});

describe('zoneDistribution', () => {
  const b = [118, 131, 144, 158, 171, 184];
  const t0 = Date.UTC(2026, 10, 16, 18, 0, 0);
  const at = (sec: number, bpm: number): HrPoint => ({ tMs: t0 + sec * 1000, bpm });

  it('teilt die Zeit jedes Werts bis zur Mitte zum Nachbarwert zu', () => {
    const d = zoneDistribution([at(0, 120), at(60, 140), at(120, 160)], t0, t0 + 120_000, b);
    expect(d.seconds).toEqual([30, 60, 0, 30, 0]);
    expect(d.belowSeconds).toBe(0);
    expect(d.coveredSeconds).toBe(120);
    expect(d.coverage).toBe(1);
    expect(d.sampleCount).toBe(3);
    expect(d.medianGapSec).toBe(60);
  });

  it('zählt Werte unter Zone 1 getrennt', () => {
    const d = zoneDistribution([at(0, 100), at(60, 100)], t0, t0 + 60_000, b);
    expect(d.belowSeconds).toBe(60);
    expect(d.seconds.every((s) => s === 0)).toBe(true);
  });

  it('lässt große Lücken unabgedeckt statt sie zu erfinden', () => {
    // Werte bei 0 und 1200 s, Zeitraum 20 min: je höchstens 3 min Reichweite pro Seite
    const d = zoneDistribution([at(0, 140), at(1200, 140)], t0, t0 + 1_200_000, b);
    expect(d.coveredSeconds).toBe(360);
    expect(d.coverage).toBeCloseTo(0.3, 5);
    expect(d.approximate).toBe(true);
  });

  it('beschneidet auf den Zeitraum und ignoriert Werte außerhalb', () => {
    const d = zoneDistribution([at(-600, 190), at(10, 140), at(30, 140), at(900, 190)], t0, t0 + 40_000, b);
    expect(d.sampleCount).toBe(2);
    expect(d.seconds[1]).toBe(40); // Wert bei 10 s deckt 0–20 s, Wert bei 30 s deckt 20–40 s
    expect(d.coveredSeconds).toBe(40);
  });

  it('markiert dichte Daten als genau und dünne als Näherung', () => {
    const dense = Array.from({ length: 61 }, (_, i) => at(i * 5, 150));
    expect(zoneDistribution(dense, t0, t0 + 300_000, b).approximate).toBe(false);
    const sparse = Array.from({ length: 14 }, (_, i) => at(i * 224, 150));
    expect(zoneDistribution(sparse, t0, t0 + 3_120_000, b).approximate).toBe(true);
  });

  it('liefert ohne Werte eine leere Verteilung', () => {
    const d = zoneDistribution([], t0, t0 + 60_000, b);
    expect(d.coveredSeconds).toBe(0);
    expect(d.coverage).toBe(0);
    expect(d.medianGapSec).toBeNull();
    expect(d.approximate).toBe(true);
    expect(intensityShares(d)).toBeNull();
  });

  it('liefert einen leeren Zeitraum ohne Division durch null', () => {
    const d = zoneDistribution([at(0, 140)], t0, t0, b);
    expect(d.totalSeconds).toBe(0);
    expect(d.coverage).toBe(0);
  });
});

describe('intensityShares', () => {
  it('fasst Zone 1–2 als locker, Zone 3 als mittel, Zone 4–5 als hart zusammen', () => {
    const s = intensityShares({ seconds: [240, 960, 1200, 600, 120], belowSeconds: 0, coveredSeconds: 3120 });
    expect(s!.easy).toBeCloseTo(1200 / 3120, 5);
    expect(s!.moderate).toBeCloseTo(1200 / 3120, 5);
    expect(s!.hard).toBeCloseTo(720 / 3120, 5);
    expect(s!.easy + s!.moderate + s!.hard).toBeCloseTo(1, 5);
  });

  it('rechnet Zeit unter Zone 1 zu locker', () => {
    const s = intensityShares({ seconds: [0, 0, 0, 0, 0], belowSeconds: 600, coveredSeconds: 600 });
    expect(s).toEqual({ easy: 1, moderate: 0, hard: 0 });
  });
});
