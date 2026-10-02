import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DETECT_OPTIONS,
  detectWindows,
  parseDateWithZone,
  parseNumber,
  parseSamples,
  type Sample,
} from '../../supabase/functions/football-import/parse';
import {
  describeRangeSummary,
  describeWatchWindow,
  summarizeWatchSamples,
  visibleWatchWindows,
  watchShortcutUrl,
  watchWindowToForm,
  WATCH_SHORTCUT_NAME,
  type WatchSample,
  type WatchWindow,
} from './footballWatch';
import type { HistFootballSession } from './storage';

const MIN = 60_000;
const T0 = Date.parse('2026-10-01T19:00:00+02:00');

/** Herzfrequenz-Samples im Abstand von stepMin Minuten ab startOffsetMin. */
function hrSeries(startOffsetMin: number, count: number, stepMin: number, value = 130): Sample[] {
  return Array.from({ length: count }, (_, i) => {
    const t = T0 + (startOffsetMin + i * stepMin) * MIN;
    return { startMs: t, endMs: t, value: value + (i % 3) * 10 };
  });
}

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

describe('detectWindows', () => {
  it('erkennt eine Einheit aus 5-Minuten-Herzfrequenzwerten und summiert Schritte/Distanz im Fenster', () => {
    // 22 Werte von 19:00 bis 20:45 (Abstand 5 min)
    const hr = hrSeries(0, 22, 5);
    const steps: Sample[] = [
      { startMs: T0 + 10 * MIN, endMs: T0 + 12 * MIN, value: 300 },
      { startMs: T0 + 60 * MIN, endMs: T0 + 62 * MIN, value: 450 },
      { startMs: T0 - 600 * MIN, endMs: T0 - 598 * MIN, value: 9999 }, // außerhalb
    ];
    const distance: Sample[] = [
      { startMs: T0 + 10 * MIN, endMs: T0 + 12 * MIN, value: 0.25 },
      { startMs: T0 + 60 * MIN, endMs: T0 + 62 * MIN, value: 0.35 },
    ];
    const { windows, skipped } = detectWindows(hr, steps, distance);
    expect(skipped).toEqual([]);
    expect(windows).toHaveLength(1);
    const w = windows[0];
    expect(w.startedAt).toBe(new Date(T0).toISOString());
    expect(w.endedAt).toBe(new Date(T0 + 105 * MIN).toISOString());
    expect(w.hrSamples).toBe(22);
    expect(w.maxHeartRate).toBe(150);
    expect(w.avgHeartRate).toBeGreaterThanOrEqual(130);
    expect(w.avgHeartRate).toBeLessThanOrEqual(150);
    expect(w.steps).toBe(750);
    expect(w.distanceKm).toBe(0.6);
  });

  it('trennt zwei Einheiten an einer Lücke ab 45 Minuten', () => {
    const hr = [...hrSeries(0, 10, 5), ...hrSeries(24 * 60, 10, 5)]; // zweiter Abend, +1 Tag
    const { windows } = detectWindows(hr, [], []);
    expect(windows).toHaveLength(2);
    expect(windows[0].steps).toBeNull();
    expect(windows[0].distanceKm).toBeNull();
  });

  it('zerreißt eine Einheit nicht bei einer kleinen Lücke (z. B. 30 min ohne Messwert)', () => {
    const hr = [...hrSeries(0, 6, 5), ...hrSeries(55, 6, 5)]; // Lücke 30 min
    expect(detectWindows(hr, [], []).windows).toHaveLength(1);
  });

  it('meldet zu kurze, zu lange und zu dünne Fenster mit Grund statt sie anzulegen', () => {
    const tooShort = hrSeries(0, 4, 5); // 15 min
    const tooFew = [...hrSeries(1000, 2, 30)]; // 2 Werte
    const tooLong = hrSeries(3000, 70, 5); // ~345 min
    const { windows, skipped } = detectWindows([...tooShort, ...tooFew, ...tooLong], [], []);
    expect(windows).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual([
      expect.stringContaining('zu kurz'),
      expect.stringContaining('zu wenige'),
      expect.stringContaining('zu lang'),
    ]);
  });

  it('ignoriert unplausible Herzfrequenzwerte', () => {
    const hr = hrSeries(0, 10, 5);
    hr.push({ startMs: T0 + 50 * MIN, endMs: T0 + 50 * MIN, value: 500 });
    hr.push({ startMs: T0 + 52 * MIN, endMs: T0 + 52 * MIN, value: 0 });
    const { windows } = detectWindows(hr, [], []);
    expect(windows[0].hrSamples).toBe(10);
    expect(windows[0].maxHeartRate).toBeLessThanOrEqual(220);
  });

  it('ohne Herzfrequenz gibt es keine Fenster', () => {
    expect(detectWindows([], [{ startMs: T0, endMs: T0, value: 5 }], [])).toEqual({ windows: [], skipped: [] });
  });

  it('Standardwerte entsprechen 45 min Lücke / 20 min Mindestdauer / 4 h Höchstdauer / 3 Messwerten', () => {
    expect(DEFAULT_DETECT_OPTIONS).toEqual({
      gapMs: 45 * MIN,
      minDurationMs: 20 * MIN,
      maxDurationMs: 240 * MIN,
      minHrSamples: 3,
    });
  });
});

function win(partial: Partial<WatchWindow> = {}): WatchWindow {
  return {
    id: 'w1',
    startedAt: new Date(2026, 9, 1, 19, 12).toISOString(),
    endedAt: new Date(2026, 9, 1, 20, 58).toISOString(),
    hrSamples: 20,
    avgHeartRate: 132,
    maxHeartRate: 171,
    steps: 7000,
    distanceKm: 4.23,
    sessionId: null,
    dismissed: false,
    ...partial,
  };
}

function session(partial: Partial<HistFootballSession> = {}): HistFootballSession {
  return {
    id: 's1',
    playedOn: '2026-10-01',
    startedAt: new Date(2026, 9, 1, 19, 15).toISOString(),
    kind: 'training',
    minutes: 90,
    rpe: 6,
    note: null,
    distanceKm: null,
    calories: null,
    avgHeartRate: null,
    source: 'manual',
    ...partial,
  };
}

describe('visibleWatchWindows', () => {
  const now = new Date(2026, 9, 2, 10, 0).getTime();

  it('zeigt offene Vorschläge, neueste zuerst', () => {
    const older = win({ id: 'old', startedAt: new Date(2026, 8, 29, 19, 0).toISOString(), endedAt: new Date(2026, 8, 29, 20, 30).toISOString() });
    expect(visibleWatchWindows([older, win()], [], now).map((w) => w.id)).toEqual(['w1', 'old']);
  });

  it('blendet übernommene, ausgeblendete und zu alte Vorschläge aus', () => {
    const tooOld = win({ id: 'old', startedAt: new Date(2026, 8, 1, 19, 0).toISOString(), endedAt: new Date(2026, 8, 1, 20, 30).toISOString() });
    expect(visibleWatchWindows([win({ sessionId: 's1' }), win({ id: 'd', dismissed: true }), tooOld], [], now)).toEqual([]);
  });

  it('blendet einen Vorschlag aus, wenn ein Eintrag zeitlich überlappt (z. B. offline noch nicht verknüpft)', () => {
    expect(visibleWatchWindows([win()], [session()], now)).toEqual([]);
  });

  it('ein Eintrag ohne Startzeit oder an einem anderen Abend blendet nichts aus', () => {
    const noStart = session({ startedAt: null });
    const otherDay = session({ startedAt: new Date(2026, 8, 28, 19, 0).toISOString() });
    expect(visibleWatchWindows([win()], [noStart, otherDay], now)).toHaveLength(1);
  });
});

describe('summarizeWatchSamples', () => {
  const from = T0;
  const to = T0 + 90 * MIN;
  const s = (kind: WatchSample['kind'], offsetMin: number, value: number, lenMin = 0): WatchSample => ({
    kind,
    startMs: T0 + offsetMin * MIN,
    endMs: T0 + (offsetMin + lenMin) * MIN,
    value,
  });

  it('mittelt Puls, nimmt das Maximum und summiert Schritte und Distanz nur im gewählten Zeitraum', () => {
    const samples = [
      s('hr', -30, 90), // davor
      s('hr', 5, 120),
      s('hr', 40, 150),
      s('hr', 85, 130),
      s('hr', 120, 100), // danach
      s('steps', 10, 300, 2),
      s('steps', 60, 450, 2),
      s('steps', -5, 999, 2), // davor
      s('distance', 10, 0.25, 2),
      s('distance', 60, 0.35, 2),
    ];
    expect(summarizeWatchSamples(samples, from, to)).toEqual({
      hrSamples: 3,
      avgHeartRate: 133,
      maxHeartRate: 150,
      steps: 750,
      distanceKm: 0.6,
    });
  });

  it('lässt Felder ohne Werte im Zeitraum null (kein Raten)', () => {
    expect(summarizeWatchSamples([s('hr', 200, 140)], from, to)).toEqual({
      hrSamples: 0,
      avgHeartRate: null,
      maxHeartRate: null,
      steps: null,
      distanceKm: null,
    });
  });

  it('ignoriert unplausible Herzfrequenzwerte', () => {
    const r = summarizeWatchSamples([s('hr', 5, 500), s('hr', 10, 0), s('hr', 15, 140)], from, to);
    expect(r.hrSamples).toBe(1);
    expect(r.avgHeartRate).toBe(140);
  });

  it('beschreibt nur vorhandene Werte', () => {
    expect(describeRangeSummary({ hrSamples: 7, avgHeartRate: 135, maxHeartRate: 168, steps: 6200, distanceKm: 5.12 })).toBe(
      'Ø 135 / max 168 bpm (7 Messwerte) · 5,1 km · 6.200 Schritte',
    );
    expect(describeRangeSummary({ hrSamples: 0, avgHeartRate: null, maxHeartRate: null, steps: null, distanceKm: null })).toBe('');
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

describe('watchWindowToForm / describeWatchWindow', () => {
  it('übernimmt Datum, Startzeit, Dauer, Puls und Distanz in lokaler Zeit', () => {
    expect(watchWindowToForm(win())).toEqual({
      playedOn: '2026-10-01',
      startedAtTime: '19:12',
      minutes: 106,
      avgHeartRate: 132,
      distanceKm: 4.23,
    });
  });

  it('begrenzt die Dauer auf 1–240 Minuten wie das Formular', () => {
    const long = win({ endedAt: new Date(2026, 9, 1, 23, 59).toISOString() });
    expect(watchWindowToForm(long).minutes).toBe(240);
  });

  it('beschreibt Dauer, Puls (mit Anzahl der Messwerte) und Distanz', () => {
    const text = describeWatchWindow(win());
    expect(text).toContain('106 min');
    expect(text).toContain('Ø 132 / max 171 bpm (20 Messwerte)');
    expect(text).toContain('4,2 km');
  });
});
