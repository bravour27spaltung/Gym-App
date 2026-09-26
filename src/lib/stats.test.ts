import { describe, expect, it } from 'vitest';
import {
  draftToHist,
  estimate1RM,
  exercisePoints,
  exerciseStats,
  findRecords,
  lastDays,
  mergeHistory,
  muscleSets,
  payloadToHist,
  summarizeWorkout,
  windowTotals,
  workoutTotals,
  type HistWorkout,
} from './stats';
import { addExercise, buildPayload, createDraft, toggleDone } from './workout';

const d = (day: number, h = 10) => new Date(2026, 8, day, h, 0, 0).toISOString();
const end = (day: number, h = 11) => new Date(2026, 8, day, h, 0, 0).toISOString();

function workout(id: string, day: number, sets: [number, number][], opts: { eq?: number | null; exerciseId?: string } = {}): HistWorkout {
  return {
    id,
    name: 'Push',
    startedAt: d(day),
    finishedAt: end(day),
    exercises: [
      {
        exerciseId: opts.exerciseId ?? 'bench',
        equipmentKg: opts.eq ?? null,
        sets: sets.map(([weightKg, reps]) => ({ type: 'working' as const, weightKg, reps })),
      },
    ],
  };
}

describe('1RM-Schätzung', () => {
  it('rechnet nach Epley und liefert bei einer Wiederholung die Last selbst', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 10)).toBe(133.3);
    expect(estimate1RM(80, 5)).toBe(93.3);
  });

  it('schätzt nicht ohne Gewicht, bei 0 Wiederholungen oder über der Grenze', () => {
    expect(estimate1RM(0, 8)).toBeNull();
    expect(estimate1RM(100, 0)).toBeNull();
    expect(estimate1RM(100, 13)).toBeNull();
    expect(estimate1RM(100, 12)).not.toBeNull();
  });
});

describe('Übungswerte', () => {
  it('zählt nur Arbeitssätze und rechnet mit der Gesamtlast inklusive Stange', () => {
    const w = workout('a', 1, [[60, 10], [60, 8]], { eq: 20 });
    w.exercises[0].sets.unshift({ type: 'warmup', weightKg: 20, reps: 10 });
    const st = exerciseStats(w.exercises[0]);
    expect(st.workingSets).toBe(2);
    expect(st.reps).toBe(18);
    expect(st.volumeKg).toBe(80 * 10 + 80 * 8);
    expect(st.topLoadKg).toBe(80);
    expect(st.topSet).toMatchObject({ weightKg: 60, loadKg: 80, reps: 10 });
  });

  it('wählt den Satz mit dem besten geschätzten 1RM als besten Satz', () => {
    const st = exerciseStats(workout('a', 1, [[100, 3], [90, 8], [80, 12]]).exercises[0]);
    // 100x3 -> 110, 90x8 -> 114, 80x12 -> 112
    expect(st.topSet).toMatchObject({ weightKg: 90, reps: 8 });
    expect(st.best1RM).toBe(114);
  });

  it('nimmt bei Körpergewichtsübungen ohne Last die meisten Wiederholungen', () => {
    const st = exerciseStats(workout('a', 1, [[0, 8], [0, 12], [0, 10]]).exercises[0]);
    expect(st.topSet).toMatchObject({ reps: 12 });
    expect(st.best1RM).toBeNull();
    expect(st.volumeKg).toBe(0);
  });

  it('meldet keinen besten Satz, wenn nur Aufwärmsätze vorliegen', () => {
    const w = workout('a', 1, []);
    w.exercises[0].sets.push({ type: 'warmup', weightKg: 40, reps: 8 });
    expect(exerciseStats(w.exercises[0]).topSet).toBeNull();
  });
});

describe('Training gesamt', () => {
  it('summiert Sätze, Wiederholungen, Volumen und Dauer', () => {
    const t = workoutTotals(workout('a', 1, [[50, 10], [50, 10]]));
    expect(t).toEqual({ exercises: 1, workingSets: 2, reps: 20, volumeKg: 1000, durationMin: 60 });
  });

  it('kennt die Dauer nicht, wenn das Ende fehlt', () => {
    const w = { ...workout('a', 1, [[50, 10]]), finishedAt: null };
    expect(workoutTotals(w).durationMin).toBeNull();
  });
});

describe('Verlauf einer Übung', () => {
  it('liefert einen Punkt je Training, älteste zuerst, ohne Trainings ohne Arbeitssatz', () => {
    const list = [workout('b', 8, [[62.5, 8]]), workout('a', 1, [[60, 8]]), workout('c', 15, [[65, 6]], { exerciseId: 'row' })];
    const pts = exercisePoints(list, 'bench');
    expect(pts.map((p) => p.workoutId)).toEqual(['a', 'b']);
    expect(pts[1].topLoadKg).toBe(62.5);
  });
});

describe('Bestwerte', () => {
  const before = [workout('a', 1, [[60, 8], [60, 8]]), workout('b', 8, [[62.5, 8]])];

  it('meldet Gewicht und 1RM, wenn beide übertroffen sind', () => {
    const cur = workout('c', 15, [[65, 8]]);
    const hits = findRecords(cur, before);
    expect(hits.map((h) => h.kind).sort()).toEqual(['e1rm', 'load']);
    expect(hits.find((h) => h.kind === 'load')).toMatchObject({ value: 65, previous: 62.5 });
  });

  it('meldet nichts bei gleicher oder schlechterer Leistung', () => {
    expect(findRecords(workout('c', 15, [[62.5, 8]]), before)).toEqual([]);
    expect(findRecords(workout('c', 15, [[55, 10]]), before)).toEqual([]);
  });

  it('meldet bei der ersten Einheit mit der Übung keinen Bestwert', () => {
    expect(findRecords(workout('c', 15, [[100, 5]]), [])).toEqual([]);
    expect(findRecords(workout('c', 15, [[100, 5]], { exerciseId: 'neu' }), before)).toEqual([]);
  });

  it('meldet 1RM auch bei gleichem Gewicht und mehr Wiederholungen', () => {
    const hits = findRecords(workout('c', 15, [[62.5, 10]]), before);
    expect(hits.map((h) => h.kind)).toEqual(['e1rm']);
  });

  it('vergleicht nicht mit sich selbst', () => {
    const cur = workout('c', 15, [[65, 8]]);
    expect(findRecords(cur, [...before, cur])).toHaveLength(2);
  });
});

describe('Zeitfenster und Muskeln', () => {
  const list = [workout('a', 1, [[60, 8]]), workout('b', 8, [[60, 8], [60, 8]]), workout('c', 12, [[60, 8]])];

  it('summiert Trainings im Fenster', () => {
    const w = windowTotals(list, new Date(2026, 8, 8), new Date(2026, 8, 15));
    expect(w).toEqual({ sessions: 2, workingSets: 3, volumeKg: 1440 });
  });

  it('nimmt das Fenster der letzten 7 Tage einschließlich des Endes', () => {
    const { from, to } = lastDays(new Date(2026, 8, 12, 11), 7);
    expect(windowTotals(list, from, to).sessions).toBe(2); // 8. und 12., nicht der 1.
  });

  it('zählt Hauptmuskeln voll und Hilfsmuskeln halb', () => {
    const res = muscleSets(list, new Date(2026, 8, 8), new Date(2026, 8, 15), () => ({ primary: ['chest'], secondary: ['triceps', 'chest'] }));
    expect(res).toEqual([
      { muscle: 'chest', sets: 3 },
      { muscle: 'triceps', sets: 1.5 },
    ]);
  });
});

describe('Umwandlungen', () => {
  function done() {
    let dr = createDraft('Push', null, new Date(2026, 8, 20, 10));
    dr = addExercise(dr, { exerciseId: 'bench', name: 'Bankdrücken', isNew: false, plannedSets: 3, weightKg: 60, equipmentKg: 20, repMin: 8, repMax: 12 });
    const ex = dr.exercises[0];
    dr = toggleDone(dr, ex.id, ex.sets[0].id);
    dr = toggleDone(dr, ex.id, ex.sets[1].id);
    return dr;
  }

  it('übernimmt nur abgehakte Sätze aus dem Entwurf', () => {
    const h = draftToHist(done(), new Date(2026, 8, 20, 11));
    expect(h.exercises).toHaveLength(1);
    expect(h.exercises[0].sets).toHaveLength(2);
    expect(h.exercises[0].equipmentKg).toBe(20);
  });

  it('wandelt einen noch nicht gesendeten Datensatz in denselben Verlaufseintrag um', () => {
    const dr = done();
    const fin = new Date(2026, 8, 20, 11);
    const fromPayload = payloadToHist(buildPayload(dr, fin)!);
    const fromDraft = draftToHist(dr, fin);
    expect(fromPayload).toEqual(fromDraft);
  });

  it('führt Datenbank und ungesendete Trainings ohne Doppelte zusammen', () => {
    const dr = done();
    const payload = buildPayload(dr, new Date(2026, 8, 20, 11))!;
    const dbCopy = payloadToHist(payload);
    const older = workout('old', 1, [[50, 10]]);
    const merged = mergeHistory([older, dbCopy], [payload]);
    expect(merged.map((w) => w.id)).toEqual([dr.id, 'old']);
  });
});

describe('Auswertung nach dem Training', () => {
  const ctx = {
    nameOf: (id: string) => (id === 'bench' ? 'Bankdrücken' : id),
    muscleOf: () => ({ primary: ['chest'], secondary: ['triceps'] }),
    rangeOf: (id: string) => (id === 'bench' ? { repMin: 8, repMax: 10 } : null),
  };
  const before = [workout('a', 1, [[60, 10], [60, 9]]), workout('b', 8, [[62.5, 8], [62.5, 8]])];

  it('vergleicht mit der letzten Einheit und meldet Bestwerte', () => {
    const cur = workout('c', 15, [[65, 8], [65, 8]]);
    const s = summarizeWorkout(cur, before, ctx);
    const ex = s.exercises[0];
    expect(ex.name).toBe('Bankdrücken');
    expect(ex.previous?.volumeKg).toBe(62.5 * 16);
    expect(ex.volumeDeltaPct).toBe(4); // 1040 gegen 1000
    expect(ex.records.map((r) => r.kind).sort()).toEqual(['e1rm', 'load']);
    expect(s.records).toHaveLength(2);
    expect(s.totals.workingSets).toBe(2);
  });

  it('empfiehlt zu steigern, wenn in mehr als einem Satz die Obergrenze erreicht wurde', () => {
    const cur = workout('c', 15, [[65, 10], [65, 10], [65, 9]]);
    expect(summarizeWorkout(cur, before, ctx).exercises[0].next).toBe('increase');
    const hold = workout('c', 15, [[65, 9], [65, 8]]);
    expect(summarizeWorkout(hold, before, ctx).exercises[0].next).toBe('hold');
  });

  it('gibt ohne Wiederholungsbereich keine Empfehlung', () => {
    const cur = workout('c', 15, [[65, 10]], { exerciseId: 'row' });
    expect(summarizeWorkout(cur, before, ctx).exercises[0].next).toBeNull();
  });

  it('kennzeichnet die erste Einheit einer Übung und macht keinen Vergleich', () => {
    const cur = workout('c', 15, [[65, 8]]);
    const s = summarizeWorkout(cur, [], ctx);
    expect(s.exercises[0].previous).toBeNull();
    expect(s.exercises[0].volumeDeltaPct).toBeNull();
    expect(s.records).toEqual([]);
  });

  it('zählt die Sätze pro Muskel im Training und in den letzten 7 Tagen', () => {
    const cur = workout('c', 15, [[65, 8], [65, 8]]);
    const s = summarizeWorkout(cur, before, ctx);
    const chest = s.muscles.find((m) => m.muscle === 'chest')!;
    expect(chest.workout).toBe(2);
    // Fenster 9. bis 15.: nur dieses Training (b vom 8. liegt davor, wenn Ende 15. 11 Uhr)
    expect(chest.week).toBe(2);
    const triceps = s.muscles.find((m) => m.muscle === 'triceps')!;
    expect(triceps.workout).toBe(1);
  });
});
