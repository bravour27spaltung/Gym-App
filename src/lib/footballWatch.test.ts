import { describe, expect, it } from 'vitest';
import {
  buildRangeResult,
  describeRangeResult,
  parseDateWithZone,
  parseNumber,
  parseRange,
  parseSamples,
  summarizeRange,
  type Sample,
} from '../../supabase/functions/football-import/parse';
import {
  describeRangeSummary,
  diagnoseWatchRange,
  hasWatchValues,
  watchShortcutUrl,
  WATCH_SHORTCUT_NAME,
  type WatchRangeRecord,
} from './footballWatch';

const MIN = 60_000;
const T0 = Date.parse('2026-10-01T19:00:00+02:00');
const FROM = '2026-10-01T17:00:00Z';
const TO = '2026-10-01T18:30:00Z';

describe('parseDateWithZone', () => {
  it('liest ISO 8601 mit Offset, Z und das Apple-Export-Format', () => {
    const ref = Date.parse('2026-10-01T17:14:03Z');
    expect(parseDateWithZone('2026-10-01T19:14:03+02:00')).toBe(ref);
    expect(parseDateWithZone('2026-10-01T17:14:03Z')).toBe(ref);
    expect(parseDateWithZone('2026-10-01 19:14:03 +0200')).toBe(ref);
    expect(parseDateWithZone('2026-10-01T19:14:03.000+02:00')).toBe(ref);
  });

  it('lehnt Datum ohne Zeitzone und Unsinn ab (statt still falsch einzuordnen)', () => {
    expect(parseDateWithZone('2026-10-01T19:14:03')).toBeNull();
    expect(parseDateWithZone('gestern')).toBeNull();
    expect(parseDateWithZone(42)).toBeNull();
  });
});

describe('parseNumber', () => {
  it('nimmt die erste Zahl, mit Komma oder Punkt', () => {
    expect(parseNumber('128 count/min')).toBe(128);
    expect(parseNumber('0,42 km')).toBe(0.42);
    expect(parseNumber('0.42 km')).toBe(0.42);
    expect(parseNumber(55)).toBe(55);
  });

  it('versteht Tausendertrenner in beiden Schreibweisen', () => {
    expect(parseNumber('1.234,5')).toBe(1234.5);
    expect(parseNumber('1,234.5')).toBe(1234.5);
  });

  it('gibt null ohne Zahl zurück', () => {
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber(undefined)).toBeNull();
  });
});

describe('parseSamples', () => {
  it('liest Zeilen mit Start|Ende|Wert und Start|Wert und zählt Unlesbares', () => {
    const text = [
      '2026-10-01T19:10:00+02:00|2026-10-01T19:10:00+02:00|128 count/min',
      '2026-10-01T19:15:00+02:00|140 count/min',
      '',
      'kaputt',
      '2026-10-01T19:20:00|130', // ohne Zeitzone
    ].join('\n');
    const res = parseSamples(text, 'hr');
    expect(res.samples.map((s) => s.value)).toEqual([128, 140]);
    expect(res.invalid).toBe(2);
  });

  it('rechnet Distanz in Kilometer um (km, m, mi; ohne Einheit km)', () => {
    const text = [
      '2026-10-01T19:10:00+02:00|2026-10-01T19:15:00+02:00|0,42 km',
      '2026-10-01T19:15:00+02:00|2026-10-01T19:20:00+02:00|420 m',
      '2026-10-01T19:20:00+02:00|2026-10-01T19:25:00+02:00|1 mi',
      '2026-10-01T19:25:00+02:00|2026-10-01T19:30:00+02:00|0.5',
    ].join('\n');
    const km = parseSamples(text, 'distance').samples.map((s) => s.value);
    expect(km[0]).toBeCloseTo(0.42, 5);
    expect(km[1]).toBeCloseTo(0.42, 5);
    expect(km[2]).toBeCloseTo(1.609344, 5);
    expect(km[3]).toBeCloseTo(0.5, 5);
  });

  it('akzeptiert auch ein JSON-Array', () => {
    const res = parseSamples(
      [{ start: '2026-10-01T19:10:00+02:00', end: '2026-10-01T19:12:00+02:00', value: 55 }, { start: 'x', value: 1 }],
      'steps',
    );
    expect(res.samples).toHaveLength(1);
    expect(res.samples[0].endMs - res.samples[0].startMs).toBe(2 * MIN);
    expect(res.invalid).toBe(1);
  });

  it('leere Eingabe ist kein Fehler', () => {
    expect(parseSamples(undefined, 'hr')).toEqual({ samples: [], invalid: 0 });
    expect(parseSamples('', 'hr')).toEqual({ samples: [], invalid: 0 });
  });
});

describe('watchShortcutUrl', () => {
  it('startet den Kurzbefehl mit "<Start>|<Ende>" (UTC, ohne Millisekunden) als Texteingabe', () => {
    const from = Date.parse('2026-10-01T19:00:00+02:00');
    const to = Date.parse('2026-10-01T20:30:00+02:00');
    const url = watchShortcutUrl(from, to);
    expect(url.startsWith('shortcuts://run-shortcut?')).toBe(true);
    expect(url).toContain(`name=${WATCH_SHORTCUT_NAME}`);
    expect(url).toContain('input=text');
    const text = new URL(url.replace('shortcuts://', 'https://x/')).searchParams.get('text');
    expect(text).toBe('2026-10-01T17:00:00Z|2026-10-01T18:30:00Z');
  });

  it('verwendet keine x-callback-url (Rücksprung würde in Safari statt in der Home-Bildschirm-App landen)', () => {
    expect(watchShortcutUrl(0, 60_000)).not.toContain('x-success');
  });
});

describe('parseSamples: Liste von Textzeilen (Kurzbefehl)', () => {
  it('liest ein Array aus "Start|Ende|Wert"-Strings', () => {
    const r = parseSamples(
      ['2026-10-01T19:00:00+02:00|2026-10-01T19:00:00+02:00|118 count/min', '2026-10-01T19:07:00+02:00|2026-10-01T19:07:00+02:00|141 count/min'],
      'hr',
    );
    expect(r.samples).toHaveLength(2);
    expect(r.invalid).toBe(0);
  });
});

describe('parseRange', () => {
  it('liest "<Start>|<Ende>" unverändert aus der Kurzbefehl-Eingabe', () => {
    expect(parseRange({ range: `${FROM}|${TO}` })).toEqual({ fromMs: Date.parse(FROM), toMs: Date.parse(TO) });
  });

  it('toleriert Leerzeichen, Semikolon, Zeilenumbruch und Offset-Schreibweise', () => {
    const expected = { fromMs: Date.parse(FROM), toMs: Date.parse(TO) };
    expect(parseRange({ range: ` ${FROM} ; ${TO} ` })).toEqual(expected);
    expect(parseRange({ range: `${FROM}\n${TO}` })).toEqual(expected);
    expect(parseRange({ range: '2026-10-01T19:00:00+02:00|2026-10-01T20:30:00+02:00' })).toEqual(expected);
  });

  it('akzeptiert alternativ die Felder from und to', () => {
    expect(parseRange({ from: FROM, to: TO })).toEqual({ fromMs: Date.parse(FROM), toMs: Date.parse(TO) });
  });

  it('lehnt fehlende Zeitzone, vertauschte Reihenfolge und Unsinn ab', () => {
    expect(parseRange({ range: '2026-10-01T19:00:00|2026-10-01T20:30:00' })).toBeNull();
    expect(parseRange({ range: `${TO}|${FROM}` })).toBeNull();
    expect(parseRange({ range: 'gestern|heute' })).toBeNull();
    expect(parseRange({ range: FROM })).toBeNull();
    expect(parseRange({})).toBeNull();
  });
});

describe('summarizeRange (Rückfall: Rohzeilen)', () => {
  const from = T0;
  const to = T0 + 90 * MIN;
  const s = (offsetMin: number, value: number, lenMin = 0): Sample => ({
    startMs: T0 + offsetMin * MIN,
    endMs: T0 + (offsetMin + lenMin) * MIN,
    value,
  });

  it('mittelt Puls, nimmt das Maximum und summiert Schritte und Distanz nur im Zeitraum', () => {
    const hr = [s(-30, 90), s(5, 120), s(40, 150), s(85, 130), s(120, 100)];
    const steps = [s(10, 300, 2), s(60, 450, 2), s(-5, 999, 2)];
    const distance = [s(10, 0.25, 2), s(60, 0.35, 2)];
    expect(summarizeRange(hr, steps, distance, from, to)).toEqual({
      hrSamples: 3,
      avgHeartRate: 133,
      maxHeartRate: 150,
      steps: 750,
      distanceKm: 0.6,
    });
  });

  it('lässt Felder ohne Werte im Zeitraum null (kein Raten)', () => {
    expect(summarizeRange([s(200, 140)], [], [], from, to)).toEqual({
      hrSamples: 0,
      avgHeartRate: null,
      maxHeartRate: null,
      steps: null,
      distanceKm: null,
    });
  });

  it('ignoriert unplausible Herzfrequenzwerte und schließt das Ende des Zeitraums aus', () => {
    const r = summarizeRange([s(5, 500), s(10, 0), s(15, 140), s(90, 160)], [], [], from, to);
    expect(r.hrSamples).toBe(1);
    expect(r.avgHeartRate).toBe(140);
  });
});

describe('buildRangeResult', () => {
  it('übernimmt fertige Zahlen vom Kurzbefehl', () => {
    const r = buildRangeResult({
      range: `${FROM}|${TO}`,
      avg_hr: 132,
      max_hr: 171,
      hr_count: 14,
      steps_total: 6200,
      distance_km: 4.2,
    });
    expect(r).toMatchObject({
      ok: true,
      fromMs: Date.parse(FROM),
      toMs: Date.parse(TO),
      source: 'values',
      invalid: 0,
      result: { hrSamples: 14, avgHeartRate: 132, maxHeartRate: 171, steps: 6200, distanceKm: 4.2 },
    });
  });

  it('liest Zahlen auch als Text mit Komma und Einheit (so liefern Kurzbefehle sie oft)', () => {
    const r = buildRangeResult({
      range: `${FROM}|${TO}`,
      avg_hr: '131,6 count/min',
      max_hr: '171 count/min',
      hr_count: '14',
      steps_total: '6.200 count',
      distance_km: '4,25 km',
    });
    expect(r).toMatchObject({ ok: true, result: { avgHeartRate: 132, maxHeartRate: 171, hrSamples: 14, steps: 6200, distanceKm: 4.25 } });
  });

  it('rechnet eine Distanz in Metern um', () => {
    const r = buildRangeResult({ range: `${FROM}|${TO}`, distance_km: '4200 m' });
    expect(r).toMatchObject({ ok: true, result: { distanceKm: 4.2 } });
  });

  it('wertet Rohzeilen im Zeitraum selbst aus, wenn keine fertigen Zahlen kommen', () => {
    const r = buildRangeResult({
      range: '2026-10-01T19:00:00+02:00|2026-10-01T20:30:00+02:00',
      hr: '2026-10-01T19:05:00+02:00|118 count/min\n2026-10-01T19:40:00+02:00|150 count/min\n2026-10-01T22:00:00+02:00|90 count/min',
      distance: '2026-10-01T19:10:00+02:00|2026-10-01T19:12:00+02:00|0,3 km',
    });
    expect(r).toMatchObject({
      ok: true,
      source: 'raw',
      result: { hrSamples: 2, avgHeartRate: 134, maxHeartRate: 150, steps: null, distanceKm: 0.3 },
    });
  });

  it('fertige Zahlen haben je Feld Vorrang, Rohzeilen füllen den Rest', () => {
    const r = buildRangeResult({
      range: `${FROM}|${TO}`,
      avg_hr: 140,
      max_hr: 170,
      distance: '2026-10-01T17:10:00Z|2026-10-01T17:12:00Z|0.5',
    });
    expect(r).toMatchObject({ ok: true, source: 'mixed', result: { avgHeartRate: 140, distanceKm: 0.5 } });
  });

  it('akzeptiert einen Lauf ohne Werte als Ergebnis (zeigt: Kurzbefehl lief, Health war leer)', () => {
    const r = buildRangeResult({ range: `${FROM}|${TO}` });
    expect(r).toMatchObject({
      ok: true,
      source: 'none',
      result: { hrSamples: 0, avgHeartRate: null, maxHeartRate: null, steps: null, distanceKm: null },
    });
  });

  it('verwirft unplausible Werte und zählt sie, statt sie zu speichern', () => {
    const r = buildRangeResult({ range: `${FROM}|${TO}`, avg_hr: 20, max_hr: 400, steps_total: -5, distance_km: 900 });
    expect(r).toMatchObject({ ok: true, invalid: 4, result: { avgHeartRate: null, maxHeartRate: null, steps: null, distanceKm: null } });
  });

  it('meldet vertauschte Felder (Ø über Max) als Fehler statt falsche Werte zu speichern', () => {
    const r = buildRangeResult({ range: `${FROM}|${TO}`, avg_hr: 171, max_hr: 132 });
    expect(r.ok).toBe(false);
  });

  it('nennt bei unlesbarem Zeitraum, was erhalten wurde', () => {
    const r = buildRangeResult({ range: 'Heute, 19:00' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Heute, 19:00');
  });

  it('lehnt identische Felder hr und distance ab (dieselbe Variable doppelt belegt)', () => {
    const lines = '2026-10-01T19:05:00+02:00|118\n2026-10-01T19:40:00+02:00|150';
    const r = buildRangeResult({ range: '2026-10-01T19:00:00+02:00|2026-10-01T20:30:00+02:00', hr: lines, distance: lines });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('identisch');
  });

  it('lehnt eine Distanz über 100 km aus Rohzeilen ab (Meter statt Kilometer)', () => {
    const r = buildRangeResult({
      range: '2026-10-01T19:00:00+02:00|2026-10-01T20:30:00+02:00',
      distance: '2026-10-01T19:05:00+02:00|212\n2026-10-01T19:40:00+02:00|377',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('Meter');
  });

  it('lehnt Zeiträume über 24 Stunden ab', () => {
    const r = buildRangeResult({ range: '2026-10-01T00:00:00Z|2026-10-03T00:00:00Z' });
    expect(r.ok).toBe(false);
  });
});

describe('describeRangeResult / describeRangeSummary', () => {
  const full = { hrSamples: 7, avgHeartRate: 135, maxHeartRate: 168, steps: 6200, distanceKm: 5.12 };
  const empty = { hrSamples: 0, avgHeartRate: null, maxHeartRate: null, steps: null, distanceKm: null };

  it('beschreibt nur vorhandene Werte', () => {
    expect(describeRangeSummary(full)).toBe('Ø 135 / max 168 bpm (7 Messwerte) · 5,1 km · 6.200 Schritte');
    expect(describeRangeSummary(empty)).toBe('');
    expect(describeRangeSummary({ ...empty, steps: 800 })).toBe('800 Schritte');
  });

  it('die Antwort an den Kurzbefehl unterscheidet gespeichert von „ohne Werte“', () => {
    expect(describeRangeResult(full)).toBe('Gespeichert: Ø 135 / max 168 bpm (7 Messwerte) · 5,1 km · 6.200 Schritte');
    expect(describeRangeResult(empty)).toContain('ohne Werte');
  });

  it('hasWatchValues erkennt ein leeres Ergebnis', () => {
    expect(hasWatchValues(full)).toBe(true);
    expect(hasWatchValues(empty)).toBe(false);
    expect(hasWatchValues({ ...empty, steps: 10 })).toBe(true);
  });
});

describe('diagnoseWatchRange', () => {
  const from = Date.parse(FROM);
  const to = Date.parse(TO);
  const now = Date.parse('2026-10-01T18:40:00Z');
  const rec = (over: Partial<WatchRangeRecord> = {}): WatchRangeRecord => ({
    fromAt: FROM,
    toAt: TO,
    receivedAt: '2026-10-01T18:38:00Z',
    hrSamples: 9,
    avgHeartRate: 128,
    maxHeartRate: 166,
    steps: 5100,
    distanceKm: 4.1,
    ...over,
  });
  const since = Date.parse('2026-10-01T18:36:00Z');

  it('ok: Ergebnis mit Werten für genau diesen Zeitraum', () => {
    const d = diagnoseWatchRange(rec(), rec(), from, to, now, since);
    expect(d.kind).toBe('ok');
    expect(d.text).toContain('Ø 128 / max 166 bpm');
  });

  it('empty: Kurzbefehl lief, Health lieferte nichts', () => {
    const empty = rec({ hrSamples: 0, avgHeartRate: null, maxHeartRate: null, steps: null, distanceKm: null });
    const d = diagnoseWatchRange(empty, empty, from, to, now, since);
    expect(d.kind).toBe('empty');
    expect(d.text).toContain('Health hat');
  });

  it('stale: nur ein Ergebnis von vor dem Antippen zählt nicht als Antwort auf diesen Lauf', () => {
    const old = rec({ receivedAt: '2026-10-01T10:00:00Z' });
    expect(diagnoseWatchRange(old, old, from, to, now, since).kind).toBe('stale');
    // Ohne Antippen (Erneut prüfen) darf das ältere Ergebnis übernommen werden.
    expect(diagnoseWatchRange(old, old, from, to, now, null).kind).toBe('ok');
  });

  it('stale: ein alter Leer-Eintrag überdeckt keinen neuen Lauf', () => {
    const oldEmpty = rec({ receivedAt: '2026-10-01T10:00:00Z', avgHeartRate: null, maxHeartRate: null, steps: null, distanceKm: null, hrSamples: 0 });
    expect(diagnoseWatchRange(oldEmpty, oldEmpty, from, to, now, since).kind).toBe('stale');
  });

  it('toleriert eine Uhrabweichung von unter einer Minute zwischen iPhone und Server', () => {
    const slightlyBefore = rec({ receivedAt: '2026-10-01T18:35:30Z' });
    expect(diagnoseWatchRange(slightlyBefore, slightlyBefore, from, to, now, since).kind).toBe('ok');
  });

  it('other-range: kürzlich kam etwas an, aber für einen anderen Zeitraum', () => {
    const other = rec({ fromAt: '2026-10-01T09:00:00Z', toAt: '2026-10-01T10:30:00Z' });
    const d = diagnoseWatchRange(null, other, from, to, now, since);
    expect(d.kind).toBe('other-range');
    expect(d.text).toContain('range');
  });

  it('none: nichts angekommen, mit Hinweis auf das letzte Ergebnis', () => {
    const old = rec({ fromAt: '2026-09-20T17:00:00Z', toAt: '2026-09-20T18:00:00Z', receivedAt: '2026-09-20T18:05:00Z' });
    const d = diagnoseWatchRange(null, old, from, to, now, since);
    expect(d.kind).toBe('none');
    expect(d.text).toContain('Das letzte Ergebnis überhaupt');
  });

  it('none: noch nie etwas angekommen verweist auf den Test-Kurzbefehl', () => {
    const d = diagnoseWatchRange(null, null, from, to, now, since);
    expect(d.kind).toBe('none');
    expect(d.text).toContain('Stufe 1');
  });
});
