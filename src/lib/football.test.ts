import { describe, expect, it } from 'vitest';
import { buildFootballPayload, footballKindLabel, footballLoad } from './football';

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
});
