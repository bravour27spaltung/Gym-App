import { describe, expect, it } from 'vitest';
import {
  addMinutesToTime,
  buildCardioPayload,
  cardioActivityLabel,
  cardioLoad,
  cardioWindow,
  minutesBetweenTimes,
  parseCardioActivity,
  rpeRequired,
  type CardioEntryInput,
} from './cardio';

const base: CardioEntryInput = { activity: 'running', playedOn: '2026-11-16', minutes: 52, rpe: null, note: '' };

describe('Aktivitäten', () => {
  it('benennt die Aktivitäten deutsch', () => {
    expect(cardioActivityLabel('football')).toBe('Fußball');
    expect(cardioActivityLabel('running')).toBe('Laufen');
    expect(cardioActivityLabel('cycling')).toBe('Radfahren');
  });

  it('behandelt unbekannte Werte aus alten Zeilen als Fußball', () => {
    expect(parseCardioActivity('running')).toBe('running');
    expect(parseCardioActivity('cycling')).toBe('cycling');
    expect(parseCardioActivity(undefined)).toBe('football');
    expect(parseCardioActivity('swimming')).toBe('football');
  });

  it('verlangt die subjektive Belastung nur beim Fußball', () => {
    expect(rpeRequired('football')).toBe(true);
    expect(rpeRequired('running')).toBe(false);
    expect(rpeRequired('cycling')).toBe(false);
  });
});

describe('cardioLoad', () => {
  it('rechnet Dauer × RPE (Session-RPE)', () => {
    expect(cardioLoad(90, 7)).toBe(630);
    expect(cardioLoad(60, 0)).toBe(0);
  });

  it('gibt ohne RPE keinen Wert zurück', () => {
    expect(cardioLoad(52, null)).toBeNull();
    expect(cardioLoad(52, undefined)).toBeNull();
  });
});

describe('addMinutesToTime / minutesBetweenTimes', () => {
  it('rechnet Von/Bis und Dauer ineinander um, auch über Mitternacht', () => {
    expect(addMinutesToTime('18:05', 52)).toBe('18:57');
    expect(minutesBetweenTimes('18:05', '18:57')).toBe(52);
    expect(addMinutesToTime('23:30', 60)).toBe('00:30');
    expect(minutesBetweenTimes('23:30', '00:30')).toBe(60);
  });

  it('behandelt gleiche und ungültige Zeiten', () => {
    expect(minutesBetweenTimes('13:00', '13:00')).toBe(0);
    expect(addMinutesToTime('25:00', 60)).toBe('');
    expect(minutesBetweenTimes('13:00', '')).toBeNaN();
  });
});

describe('buildCardioPayload', () => {
  it('baut einen Laufeintrag ohne RPE', () => {
    const p = buildCardioPayload({
      ...base,
      startedAtTime: '18:05',
      distanceKm: 8.4,
      steps: 9800.4,
      calories: 512.6,
      avgHeartRate: 148,
      maxHeartRate: 176,
    });
    expect(p).not.toBeNull();
    expect(p!.session).toMatchObject({
      activity: 'running',
      played_on: '2026-11-16',
      minutes: 52,
      rpe: null,
      note: null,
      distance_km: 8.4,
      steps: 9800,
      calories: 513,
      avg_heart_rate: 148,
      max_heart_rate: 176,
      source: 'manual',
    });
    expect(p!.session.started_at).toBe(new Date('2026-11-16T18:05:00').toISOString());
    expect(p!.session.id).toBeTruthy();
  });

  it('verlangt beim Fußball eine RPE', () => {
    expect(buildCardioPayload({ ...base, activity: 'football', rpe: null })).toBeNull();
    const p = buildCardioPayload({ ...base, activity: 'football', minutes: 90, rpe: 7 });
    expect(p!.session.rpe).toBe(7);
  });

  it('speichert beim Laufen eine angegebene RPE, lehnt aber ungültige ab', () => {
    expect(buildCardioPayload({ ...base, rpe: 6 })!.session.rpe).toBe(6);
    expect(buildCardioPayload({ ...base, rpe: 11 })).toBeNull();
    expect(buildCardioPayload({ ...base, rpe: -1 })).toBeNull();
  });

  it('lehnt ungültige Dauer und fehlendes Datum ab', () => {
    expect(buildCardioPayload({ ...base, minutes: 0 })).toBeNull();
    expect(buildCardioPayload({ ...base, minutes: NaN })).toBeNull();
    expect(buildCardioPayload({ ...base, playedOn: '  ' })).toBeNull();
  });

  it('macht aus ungültigen Messwerten null statt die Eingabe abzulehnen', () => {
    const p = buildCardioPayload({
      ...base,
      distanceKm: -3,
      steps: NaN,
      avgHeartRate: 20,
      maxHeartRate: 400,
    });
    expect(p!.session).toMatchObject({
      distance_km: null,
      steps: null,
      avg_heart_rate: null,
      max_heart_rate: null,
    });
  });

  it('ignoriert eine ungültige Startzeit und trimmt die Notiz', () => {
    const p = buildCardioPayload({ ...base, startedAtTime: 'abc', note: '  nach Regen  ' });
    expect(p!.session.started_at).toBeNull();
    expect(p!.session.note).toBe('nach Regen');
  });

  it('kennt die Quelle apple_health', () => {
    expect(buildCardioPayload({ ...base, source: 'apple_health' })!.session.source).toBe('apple_health');
  });
});

describe('cardioWindow', () => {
  it('liefert Start und Ende in Millisekunden', () => {
    const w = cardioWindow('2026-11-16T17:05:00.000Z', 52);
    expect(w).toEqual({ fromMs: Date.parse('2026-11-16T17:05:00.000Z'), toMs: Date.parse('2026-11-16T17:57:00.000Z') });
  });

  it('gibt ohne Startzeit oder mit ungültiger Dauer null zurück', () => {
    expect(cardioWindow(null, 52)).toBeNull();
    expect(cardioWindow('kaputt', 52)).toBeNull();
    expect(cardioWindow('2026-11-16T17:05:00.000Z', 0)).toBeNull();
  });
});
