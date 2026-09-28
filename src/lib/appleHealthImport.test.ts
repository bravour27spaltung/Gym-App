import { describe, expect, it } from 'vitest';
import { parseAppleHealthDate, summarizeAppleHealthWindow } from './appleHealthImport';

function record(attrs: Record<string, string>): string {
  const s = Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
  return `<Record ${s}/>`;
}

describe('parseAppleHealthDate', () => {
  it('parst das Apple-Health-Format mit Zeitzonen-Offset', () => {
    const ms = parseAppleHealthDate('2026-09-23 19:04:30 +0200');
    expect(ms).not.toBeNull();
    expect(new Date(ms!).toISOString()).toBe('2026-09-23T17:04:30.000Z');
  });

  it('gibt null bei unbekanntem Format zurück', () => {
    expect(parseAppleHealthDate('nicht ein datum')).toBeNull();
  });
});

describe('summarizeAppleHealthWindow', () => {
  const started = new Date('2026-09-23T17:00:00.000Z'); // 19:00 +0200
  const minutes = 90;

  function xmlWith(records: string[]): string {
    return `<?xml version="1.0"?><HealthData>${records.join('')}</HealthData>`;
  }

  it('summiert Distanz und Kalorien, mittelt Herzfrequenz – nur Datensätze im Fenster', () => {
    const xml = xmlWith([
      // im Fenster (19:10 und 20:00 Uhr lokal, also 17:10 / 18:00 UTC)
      record({
        type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
        sourceName: 'Steffens Apple Watch',
        unit: 'km',
        startDate: '2026-09-23 19:10:00 +0200',
        endDate: '2026-09-23 19:10:00 +0200',
        value: '1.5',
      }),
      record({
        type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
        sourceName: 'Steffens Apple Watch',
        unit: 'km',
        startDate: '2026-09-23 20:00:00 +0200',
        endDate: '2026-09-23 20:00:00 +0200',
        value: '2.0',
      }),
      record({
        type: 'HKQuantityTypeIdentifierActiveEnergyBurned',
        sourceName: 'Steffens Apple Watch',
        unit: 'kcal',
        startDate: '2026-09-23 19:20:00 +0200',
        endDate: '2026-09-23 19:20:00 +0200',
        value: '300',
      }),
      record({
        type: 'HKQuantityTypeIdentifierHeartRate',
        sourceName: 'Steffens Apple Watch',
        unit: 'count/min',
        startDate: '2026-09-23 19:05:00 +0200',
        endDate: '2026-09-23 19:05:00 +0200',
        value: '140',
      }),
      record({
        type: 'HKQuantityTypeIdentifierHeartRate',
        sourceName: 'Steffens Apple Watch',
        unit: 'count/min',
        startDate: '2026-09-23 19:45:00 +0200',
        endDate: '2026-09-23 19:45:00 +0200',
        value: '160',
      }),
      // außerhalb des Fensters (vor Beginn)
      record({
        type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
        sourceName: 'Steffens Apple Watch',
        unit: 'km',
        startDate: '2026-09-23 18:00:00 +0200',
        endDate: '2026-09-23 18:00:00 +0200',
        value: '5',
      }),
      // andere Art von Datensatz, wird ignoriert
      record({
        type: 'HKQuantityTypeIdentifierStepCount',
        sourceName: 'Steffens Apple Watch',
        unit: 'count',
        startDate: '2026-09-23 19:15:00 +0200',
        endDate: '2026-09-23 19:15:00 +0200',
        value: '500',
      }),
    ]);

    const res = summarizeAppleHealthWindow(xml, started, minutes);
    expect(res.distanceKm).toBeCloseTo(3.5, 5);
    expect(res.calories).toBe(300);
    expect(res.avgHeartRate).toBe(150);
  });

  it('rechnet Meilen in km und kJ in kcal um', () => {
    const xml = xmlWith([
      record({
        type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
        sourceName: 'Steffens Apple Watch',
        unit: 'mi',
        startDate: '2026-09-23 19:10:00 +0200',
        endDate: '2026-09-23 19:10:00 +0200',
        value: '1',
      }),
      record({
        type: 'HKQuantityTypeIdentifierActiveEnergyBurned',
        sourceName: 'Steffens Apple Watch',
        unit: 'kJ',
        startDate: '2026-09-23 19:10:00 +0200',
        endDate: '2026-09-23 19:10:00 +0200',
        value: '418.4',
      }),
    ]);
    const res = summarizeAppleHealthWindow(xml, started, minutes);
    expect(res.distanceKm).toBeCloseTo(1.61, 5); // auf 2 Nachkommastellen gerundet
    expect(res.calories).toBe(100);
  });

  it('bevorzugt Watch-Quellen, nutzt andere Quellen nur wenn keine Watch-Daten da sind', () => {
    const xml = xmlWith([
      record({
        type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
        sourceName: 'Steffens Apple Watch',
        unit: 'km',
        startDate: '2026-09-23 19:10:00 +0200',
        endDate: '2026-09-23 19:10:00 +0200',
        value: '2',
      }),
      record({
        type: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
        sourceName: 'Steffens iPhone',
        unit: 'km',
        startDate: '2026-09-23 19:12:00 +0200',
        endDate: '2026-09-23 19:12:00 +0200',
        value: '2.1',
      }),
    ]);
    const res = summarizeAppleHealthWindow(xml, started, minutes);
    expect(res.distanceKm).toBe(2);
  });

  it('ohne passende Datensätze bleiben alle Felder null', () => {
    const res = summarizeAppleHealthWindow(xmlWith([]), started, minutes);
    expect(res).toEqual({ distanceKm: null, calories: null, avgHeartRate: null });
  });
});
