import { describe, expect, it } from 'vitest';
import {
  assessRecovery,
  dayNumber,
  hrvTrend,
  restingHrTrend,
  rollingSeries,
  trainingContext,
  wellnessScore,
} from './recoveryAnalysis';
import type { HistWorkout } from './stats';
import type { HistFootballSession, HistRecoveryEntry } from './storage';

function entry(date: string, over: Partial<HistRecoveryEntry> = {}): HistRecoveryEntry {
  return {
    id: date,
    date,
    perceivedRecovery: 7,
    soreness: null,
    stress: null,
    sleepQuality: null,
    note: null,
    hrvMs: null,
    restingHr: null,
    sleepHours: null,
    sleepStart: null,
    sleepEnd: null,
    source: 'manual',
    ...over,
  };
}

/** Datum "2026-09-DD" bzw. Oktober, `n` Tage nach dem 1.9. */
function day(n: number): string {
  const d = new Date(Date.UTC(2026, 8, 1 + n));
  return d.toISOString().slice(0, 10);
}

/** Baseline über Tage 0..27 mit leicht streuenden Werten um `centre`, danach Wochenwerte. */
function hrvHistory(baseCentre: number, acute: number): HistRecoveryEntry[] {
  const out: HistRecoveryEntry[] = [];
  for (let i = 0; i < 28; i++) out.push(entry(day(i), { hrvMs: baseCentre + (i % 2 === 0 ? 4 : -4) }));
  for (let i = 28; i < 35; i++) out.push(entry(day(i), { hrvMs: acute }));
  return out;
}

describe('dayNumber', () => {
  it('zählt Tage unabhängig von Sommerzeit', () => {
    expect(dayNumber('2026-10-26') - dayNumber('2026-10-25')).toBe(1);
    expect(dayNumber('2026-03-30') - dayNumber('2026-03-29')).toBe(1);
  });
});

describe('hrvTrend', () => {
  it('liefert ohne genug Werte im 7-Tage-Fenster keinen Status', () => {
    const t = hrvTrend([entry(day(0), { hrvMs: 50 }), entry(day(1), { hrvMs: 50 })], day(1));
    expect(t.status).toBeNull();
    expect(t.acute).toBeNull();
    expect(t.acuteN).toBe(2);
  });

  it('zeigt den Wochenwert, aber noch keinen Status, solange die Baseline zu klein ist', () => {
    const history = [day(0), day(1), day(2)].map((d) => entry(d, { hrvMs: 50 }));
    const t = hrvTrend(history, day(2));
    expect(t.acute).toBeCloseTo(50, 5);
    expect(t.baseline).toBeNull();
    expect(t.status).toBeNull();
    expect(t.baselineN).toBe(0);
  });

  it('wertet eine Woche klar unter der Baseline als auffällig', () => {
    const t = hrvTrend(hrvHistory(60, 45), day(34));
    expect(t.status).toBe('low');
    expect(t.change!).toBeLessThan(-t.swc!);
    expect(t.baseline!).toBeCloseTo(60, 0);
  });

  it('wertet eine Woche innerhalb der kleinsten relevanten Änderung als unauffällig', () => {
    const t = hrvTrend(hrvHistory(60, 59), day(34));
    expect(t.status).toBe('ok');
  });

  it('wertet eine höhere HRV nicht als Problem', () => {
    const t = hrvTrend(hrvHistory(60, 75), day(34));
    expect(t.status).toBe('ok');
    expect(t.change!).toBeGreaterThan(0);
  });

  it('nimmt mindestens 3 % als kleinste relevante Änderung, auch bei fast konstanter Baseline', () => {
    const flat: HistRecoveryEntry[] = [];
    for (let i = 0; i < 28; i++) flat.push(entry(day(i), { hrvMs: 60 }));
    for (let i = 28; i < 35; i++) flat.push(entry(day(i), { hrvMs: 59 })); // -1,7 %
    const t = hrvTrend(flat, day(34));
    expect(t.swc!).toBeGreaterThanOrEqual(3);
    expect(t.status).toBe('ok');
  });

  it('rechnet den Wochenwert geometrisch (Mittel der Logarithmen)', () => {
    const history = [
      entry(day(0), { hrvMs: 40 }),
      entry(day(1), { hrvMs: 90 }),
      entry(day(2), { hrvMs: 60 }),
    ];
    const t = hrvTrend(history, day(2));
    expect(t.acute!).toBeCloseTo(Math.exp((Math.log(40) + Math.log(90) + Math.log(60)) / 3), 6);
  });
});

describe('restingHrTrend', () => {
  function rhr(base: number, acute: number): HistRecoveryEntry[] {
    const out: HistRecoveryEntry[] = [];
    for (let i = 0; i < 28; i++) out.push(entry(day(i), { restingHr: base + (i % 2 === 0 ? 1 : -1) }));
    for (let i = 28; i < 35; i++) out.push(entry(day(i), { restingHr: acute }));
    return out;
  }

  it('wertet einen erhöhten Ruhepuls als auffällig', () => {
    expect(restingHrTrend(rhr(52, 58), day(34)).status).toBe('low');
  });

  it('wertet einen niedrigeren oder gleichen Ruhepuls als unauffällig', () => {
    expect(restingHrTrend(rhr(52, 50), day(34)).status).toBe('ok');
    expect(restingHrTrend(rhr(52, 52), day(34)).status).toBe('ok');
  });
});

describe('wellnessScore', () => {
  it('kehrt Muskelkater und Stress um, sodass höher immer besser ist', () => {
    expect(wellnessScore({ soreness: 1, stress: 1, sleepQuality: 5 })).toBe(5);
    expect(wellnessScore({ soreness: 5, stress: 5, sleepQuality: 1 })).toBe(1);
  });

  it('mittelt nur vorhandene Items und liefert null ohne Items', () => {
    expect(wellnessScore({ soreness: 4, stress: null, sleepQuality: null })).toBe(2);
    expect(wellnessScore({ soreness: null, stress: null, sleepQuality: null })).toBeNull();
  });
});

describe('assessRecovery', () => {
  it('liefert ohne jede Angabe kein Urteil', () => {
    const a = assessRecovery([], day(0));
    expect(a.level).toBeNull();
    expect(a.signals).toBe(0);
  });

  it('bewertet allein eine gute PRS als unauffällig', () => {
    const a = assessRecovery([entry(day(0), { perceivedRecovery: 8 })], day(0));
    expect(a.level).toBe('ok');
    expect(a.signals).toBe(1);
  });

  it('wertet eine sehr niedrige PRS allein als "beobachten", nicht als rot', () => {
    const a = assessRecovery([entry(day(0), { perceivedRecovery: 2 })], day(0));
    expect(a.prs.status).toBe('low');
    expect(a.level).toBe('watch');
  });

  it('wertet kurzen Schlaf: unter 7 h beobachten, unter 6 h auffällig', () => {
    expect(assessRecovery([entry(day(0), { sleepHours: 6.5 })], day(0)).sleep.status).toBe('watch');
    expect(assessRecovery([entry(day(0), { sleepHours: 5.5 })], day(0)).sleep.status).toBe('low');
    expect(assessRecovery([entry(day(0), { sleepHours: 7.5 })], day(0)).sleep.status).toBe('ok');
  });

  it('wird rot, wenn mindestens zwei Signale deutlich abweichen', () => {
    const history = hrvHistory(60, 42).map((e, i, all) =>
      i === all.length - 1 ? { ...e, perceivedRecovery: 2, sleepHours: 5 } : e,
    );
    const a = assessRecovery(history, day(34));
    expect(a.hrv.status).toBe('low');
    expect(a.prs.status).toBe('low');
    expect(a.level).toBe('reduced');
    expect(a.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('wird gelb bei einem deutlich oder zwei leicht abweichenden Signalen', () => {
    const oneLow = assessRecovery([entry(day(0), { perceivedRecovery: 8, sleepHours: 5 })], day(0));
    expect(oneLow.level).toBe('watch');
    const twoWatch = assessRecovery([entry(day(0), { perceivedRecovery: 5, sleepHours: 6.5 })], day(0));
    expect(twoWatch.prs.status).toBe('watch');
    expect(twoWatch.sleep.status).toBe('watch');
    expect(twoWatch.level).toBe('watch');
  });

  it('bewertet die PRS auch gegen den eigenen Verlauf', () => {
    const history: HistRecoveryEntry[] = [];
    for (let i = 0; i < 14; i++) history.push(entry(day(i), { perceivedRecovery: i % 2 === 0 ? 9 : 8 }));
    history.push(entry(day(14), { perceivedRecovery: 6 })); // an sich "ausreichend", für ihn ein deutlicher Einbruch
    const a = assessRecovery(history, day(14));
    expect(a.prs.baseline!).toBeGreaterThan(8);
    expect(a.prs.status).not.toBe('ok');
  });

  it('berechnet Schlafdurchschnitt, Schlafschuld und Regelmäßigkeit', () => {
    const history: HistRecoveryEntry[] = [];
    const hours = [7, 6, 8, 7.5, 6.5];
    hours.forEach((h, i) => {
      const date = day(i);
      const wake = Date.parse(`${date}T06:00:00Z`);
      history.push(
        entry(date, {
          sleepHours: h,
          sleepStart: new Date(wake - h * 3_600_000).toISOString(),
          sleepEnd: new Date(wake).toISOString(),
        }),
      );
    });
    const a = assessRecovery(history, day(4));
    expect(a.sleep.nights7).toBe(5);
    expect(a.sleep.avg7!).toBeCloseTo(7, 5);
    expect(a.sleep.debt7!).toBeCloseTo(1 + 2 + 0 + 0.5 + 1.5, 5);
    expect(a.sleep.regularityMin!).toBeGreaterThan(0);
  });

  it('lässt Schlafschuld und Durchschnitt bei weniger als 4 Nächten weg', () => {
    const a = assessRecovery([entry(day(0), { sleepHours: 6 }), entry(day(1), { sleepHours: 6 })], day(1));
    expect(a.sleep.avg7).toBeNull();
    expect(a.sleep.debt7).toBeNull();
  });

  it('nutzt als Bezugstag ohne Eintrag nur die Trendsignale', () => {
    const a = assessRecovery(hrvHistory(60, 45), day(36)); // Tag 36 ohne Eintrag, HRV-Woche reicht bis Tag 34
    expect(a.entry).toBeNull();
    expect(a.prs.status).toBeNull();
  });
});

describe('rollingSeries', () => {
  it('erzeugt Punkte erst ab 3 Werten im Fenster und mittelt Schlaf einfach', () => {
    const history = [7, 6, 8, 7].map((h, i) => entry(day(i), { sleepHours: h }));
    const s = rollingSeries(history, 'sleep');
    expect(s).toHaveLength(2);
    expect(s[0].value).toBeCloseTo(7, 5); // (7+6+8)/3
    expect(s[1].value).toBeCloseTo(7, 5); // (7+6+8+7)/4 = 7,0
    expect(s[1].n).toBe(4);
  });

  it('lässt Tage außerhalb des 7-Tage-Fensters aus der Mittelung', () => {
    const history = [entry(day(0), { restingHr: 100 }), entry(day(10), { restingHr: 50 }), entry(day(11), { restingHr: 50 }), entry(day(12), { restingHr: 50 })];
    const s = rollingSeries(history, 'restingHr');
    expect(s[s.length - 1].value).toBe(50);
  });
});

describe('trainingContext', () => {
  const now = new Date('2026-10-03T12:00:00Z').getTime();

  function workout(finishedAt: string, name = 'Pull'): HistWorkout {
    return { id: finishedAt, name, startedAt: finishedAt, finishedAt, exercises: [] };
  }
  function football(startedAt: string, minutes: number, rpe: number): HistFootballSession {
    return {
      id: startedAt,
      playedOn: startedAt.slice(0, 10),
      startedAt,
      kind: 'match',
      minutes,
      rpe,
      note: null,
      distanceKm: null,
      calories: null,
      avgHeartRate: null,
      source: 'manual',
    };
  }

  it('liefert Stunden seit der letzten Einheit, Wochenlast und das 72-h-Fenster', () => {
    const ctx = trainingContext(
      [workout('2026-10-02T07:00:00Z'), workout('2026-09-20T07:00:00Z')],
      [football('2026-10-01T17:00:00Z', 90, 7), football('2026-09-25T17:00:00Z', 60, 5)],
      now,
    );
    expect(ctx.gym.hoursSinceLast).toBeCloseTo(29, 5);
    expect(ctx.gym.sessions7d).toBe(1);
    expect(ctx.football.hoursSinceLast).toBeCloseTo(43, 5);
    expect(ctx.football.lastLoad).toBe(630);
    expect(ctx.football.load7d).toBe(630); // die Einheit vom 25.9. liegt mehr als 7 Tage zurück
    expect(ctx.football.within72h).toBe(true);
  });

  it('ist ohne Daten leer und ignoriert unfertige oder zukünftige Einheiten', () => {
    const unfinished: HistWorkout = { id: 'u', name: 'x', startedAt: '2026-10-03T10:00:00Z', finishedAt: null, exercises: [] };
    const ctx = trainingContext([unfinished, workout('2026-10-05T07:00:00Z')], [], now);
    expect(ctx.gym.hoursSinceLast).toBeNull();
    expect(ctx.football.hoursSinceLast).toBeNull();
    expect(ctx.football.within72h).toBe(false);
  });
});

describe('Tief-/REM-Schlaf (nur Trend, ohne Status)', () => {
  const nights = (n: number, deep: number) =>
    Array.from({ length: n }, (_, i) => entry(day(-(i + 1)), { sleepHours: 7, deepSleepMin: deep, remSleepMin: 90 }));

  it('zeigt die Werte der Nacht und vergleicht erst ab 5 Vornächten mit dem eigenen Schnitt', () => {
    const few = assessRecovery([entry(day(0), { sleepHours: 7, deepSleepMin: 50, remSleepMin: 80 }), ...nights(4, 70)], day(0));
    expect(few.sleep.stages).toMatchObject({ deepMin: 50, remMin: 80, deepBaseline: null, remBaseline: null });
    const enough = assessRecovery([entry(day(0), { sleepHours: 7, deepSleepMin: 50, remSleepMin: 80 }), ...nights(6, 70)], day(0));
    expect(enough.sleep.stages?.deepBaseline).toBe(70);
    expect(enough.sleep.stages?.remBaseline).toBe(90);
  });
  it('hat keinen Einfluss auf Status oder Gesamtbewertung', () => {
    const a = assessRecovery([entry(day(0), { sleepHours: 7.5 })], day(0));
    const b = assessRecovery([entry(day(0), { sleepHours: 7.5, deepSleepMin: 5, remSleepMin: 5 })], day(0));
    expect(b.sleep.status).toBe(a.sleep.status);
    expect(b.level).toBe(a.level);
  });
  it('ohne Phasen bleibt stages null', () => {
    expect(assessRecovery([entry(day(0), { sleepHours: 7 })], day(0)).sleep.stages).toBeNull();
  });
});
