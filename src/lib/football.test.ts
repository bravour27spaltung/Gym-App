import { describe, expect, it } from 'vitest';
import { buildFootballPayload, FOOTBALL_PRESETS, footballKindLabel, footballLoad, presetDate } from './football';

describe('presetDate', () => {
  const tue = FOOTBALL_PRESETS.find((p) => p.id === 'tue')!;
  const sun = FOOTBALL_PRESETS.find((p) => p.id === 'sun')!;

  it('liefert den letzten Dienstag bzw. Sonntag vor einem Freitag', () => {
    const fri = new Date(2026, 9, 2, 14, 0); // Fr 2026-10-02
    expect(presetDate(tue, fri)).toBe('2026-09-29');
    expect(presetDate(sun, fri)).toBe('2026-09-27');
  });

  it('heute zählt erst, wenn die Startzeit erreicht ist', () => {
    expect(presetDate(tue, new Date(2026, 9, 6, 10, 0))).toBe('2026-09-29'); // Di vormittags
    expect(presetDate(tue, new Date(2026, 9, 6, 19, 30))).toBe('2026-10-06'); // Di ab 19:30
    expect(presetDate(tue, new Date(2026, 9, 6, 22, 0))).toBe('2026-10-06');
  });

  it('kommt über Monatsgrenzen zurecht', () => {
    expect(presetDate(sun, new Date(2026, 10, 3, 12, 0))).toBe('2026-11-01'); // Di 3.11. -> So 1.11.
    expect(presetDate(sun, new Date(2026, 10, 1, 12, 0))).toBe('2026-10-25'); // So 1.11. vor 13:00 -> Vorwoche
  });

  it('die Schnellwahl entspricht Di 19:30–21:00 (90 min) und So 13:00–15:45 (165 min)', () => {
    expect([tue.startTime, tue.minutes]).toEqual(['19:30', 90]);
    expect([sun.startTime, sun.minutes]).toEqual(['13:00', 165]);
  });
});

describe('footballLoad', () => {
  it('multipliziert Dauer und RPE (Session-RPE-Belastung)', () => {
    expect(footballLoad(60, 6)).toBe(360);
    expect(footballLoad(0, 6)).toBe(0);
  });
});

describe('footballKindLabel', () => {
  it('übersetzt alle drei Einheitentypen', () => {
    expect(footballKindLabel('training')).toBe('Mannschaftstraining');
    expect(footballKindLabel('casual')).toBe('Lockeres Kicken');
    expect(footballKindLabel('match')).toBe('Spiel');
  });
});

describe('buildFootballPayload', () => {
  it('baut eine gültige Zeile aus der Eingabe', () => {
    const p = buildFootballPayload({
      playedOn: '2026-09-28',
      kind: 'match',
      minutes: 90,
      rpe: 7,
      note: '  Sieg 3:1  ',
    });
    expect(p).not.toBeNull();
    expect(p!.session).toMatchObject({
      played_on: '2026-09-28',
      kind: 'match',
      minutes: 90,
      rpe: 7,
      note: 'Sieg 3:1',
    });
    expect(typeof p!.session.id).toBe('string');
  });

  it('rundet Minuten und RPE', () => {
    const p = buildFootballPayload({ playedOn: '2026-09-28', kind: 'training', minutes: 75.4, rpe: 6.6, note: '' });
    expect(p!.session.minutes).toBe(75);
    expect(p!.session.rpe).toBe(7);
  });

  it('leere Notiz wird zu null', () => {
    const p = buildFootballPayload({ playedOn: '2026-09-28', kind: 'casual', minutes: 30, rpe: 4, note: '   ' });
    expect(p!.session.note).toBeNull();
  });

  it('lehnt eine Dauer von 0 oder weniger ab', () => {
    expect(buildFootballPayload({ playedOn: '2026-09-28', kind: 'training', minutes: 0, rpe: 5, note: '' })).toBeNull();
    expect(buildFootballPayload({ playedOn: '2026-09-28', kind: 'training', minutes: -5, rpe: 5, note: '' })).toBeNull();
  });

  it('lehnt einen RPE außerhalb von 0–10 ab', () => {
    expect(buildFootballPayload({ playedOn: '2026-09-28', kind: 'training', minutes: 60, rpe: 11, note: '' })).toBeNull();
    expect(buildFootballPayload({ playedOn: '2026-09-28', kind: 'training', minutes: 60, rpe: -1, note: '' })).toBeNull();
  });

  it('lehnt ein leeres Datum ab', () => {
    expect(buildFootballPayload({ playedOn: '', kind: 'training', minutes: 60, rpe: 5, note: '' })).toBeNull();
  });

  it('übernimmt optionale Health-Werte und leitet started_at aus Datum + Uhrzeit ab', () => {
    const p = buildFootballPayload({
      playedOn: '2026-09-23',
      startedAtTime: '19:00',
      kind: 'training',
      minutes: 90,
      rpe: 6,
      note: '',
      distanceKm: 3.5,
      calories: 420,
      avgHeartRate: 148.6,
      source: 'apple_health',
    });
    expect(p!.session.distance_km).toBe(3.5);
    expect(p!.session.calories).toBe(420);
    expect(p!.session.avg_heart_rate).toBe(149);
    expect(p!.session.source).toBe('apple_health');
    expect(p!.session.started_at).toBe(new Date('2026-09-23T19:00:00').toISOString());
  });

  it('ohne Health-Werte bleiben die optionalen Felder null, Quelle ist "manual"', () => {
    const p = buildFootballPayload({ playedOn: '2026-09-23', kind: 'casual', minutes: 45, rpe: 3, note: '' });
    expect(p!.session).toMatchObject({
      started_at: null,
      distance_km: null,
      calories: null,
      avg_heart_rate: null,
      source: 'manual',
    });
  });

  it('negative oder unplausible Health-Werte werden ignoriert (null) statt die Eingabe abzulehnen', () => {
    const p = buildFootballPayload({
      playedOn: '2026-09-23',
      kind: 'training',
      minutes: 60,
      rpe: 5,
      note: '',
      distanceKm: -2,
      avgHeartRate: 300,
    });
    expect(p!.session.distance_km).toBeNull();
    expect(p!.session.avg_heart_rate).toBeNull();
  });
});
