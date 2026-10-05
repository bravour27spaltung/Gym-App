import { describe, expect, it } from 'vitest';
import { buildRecoveryPayload, prsAnchor } from './recovery';

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

describe('buildRecoveryPayload: Schlaf-Nachtfenster', () => {
  const base = { date: '2026-10-03', perceivedRecovery: 7, note: '' };

  it('übernimmt Beginn und Ende der Nacht als ISO, wenn Schlafdauer und gültiges Fenster vorliegen', () => {
    const p = buildRecoveryPayload({
      ...base,
      sleepHours: 7.5,
      sleepStart: '2026-10-02T21:10:00.000Z',
      sleepEnd: '2026-10-03T04:40:00.000Z',
      source: 'apple_health',
    });
    expect(p!.entry.sleep_start).toBe('2026-10-02T21:10:00.000Z');
    expect(p!.entry.sleep_end).toBe('2026-10-03T04:40:00.000Z');
  });

  it('lässt das Fenster weg, wenn es fehlt, verkehrt herum oder länger als 16 h ist', () => {
    const noWindow = buildRecoveryPayload({ ...base, sleepHours: 7 });
    expect(noWindow!.entry).not.toHaveProperty('sleep_start');
    const reversed = buildRecoveryPayload({
      ...base,
      sleepHours: 7,
      sleepStart: '2026-10-03T04:40:00.000Z',
      sleepEnd: '2026-10-02T21:10:00.000Z',
    });
    expect(reversed!.entry).not.toHaveProperty('sleep_start');
    const tooLong = buildRecoveryPayload({
      ...base,
      sleepHours: 7,
      sleepStart: '2026-10-02T01:00:00.000Z',
      sleepEnd: '2026-10-03T04:40:00.000Z',
    });
    expect(tooLong!.entry).not.toHaveProperty('sleep_end');
  });

  it('speichert kein Fenster ohne Schlafdauer', () => {
    const p = buildRecoveryPayload({
      ...base,
      sleepStart: '2026-10-02T21:10:00.000Z',
      sleepEnd: '2026-10-03T04:40:00.000Z',
    });
    expect(p!.entry).not.toHaveProperty('sleep_start');
  });
});
