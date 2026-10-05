import { describe, expect, it } from 'vitest';
import {
  draftToHist,
  estimate1RM,
  exercisePoints,
  exerciseSessions,
  recentOneRmSeries,
  exerciseStats,
  findRecords,
  lastDays,
  mergeHistory,
  muscleSets,
  musclePoints,
  payloadToHist,
  setSlotHistory,
  summarizeWorkout,
  trainedMuscles,
  weakestMuscle,
  windowTotals,
  workoutTotals,
  type HistWorkout,
} from './stats';
import { addExercise, buildPayload, createDraft, setFeedback, toggleDone } from './workout';

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

describe('Historie einer Satz-Position', () => {
  function workoutWithTypes(id: string, day: number, sets: { type: 'warmup' | 'working'; weightKg: number; reps: number }[]): HistWorkout {
    return { id, name: 'Push', startedAt: d(day), finishedAt: end(day), exercises: [{ exerciseId: 'bench', equipmentKg: null, sets }] };
  }

  it('liefert die Werte des 2. Arbeitssatzes, neueste zuerst', () => {
    const list = [
      workoutWithTypes('a', 1, [{ type: 'working', weightKg: 60, reps: 8 }, { type: 'working', weightKg: 60, reps: 7 }]),
      workoutWithTypes('b', 8, [{ type: 'working', weightKg: 62.5, reps: 8 }, { type: 'working', weightKg: 62.5, reps: 8 }]),
    ];
    const hist = setSlotHistory(list, 'bench', 'working', 2);
    expect(hist).toEqual([
      { at: d(8), reps: 8, weightKg: 62.5 },
      { at: d(1), reps: 7, weightKg: 60 },
    ]);
  });

  it('überspringt Trainings ohne Satz an dieser Position, statt eine Lücke zu zeigen', () => {
    const list = [
      workoutWithTypes('a', 1, [{ type: 'working', weightKg: 60, reps: 8 }]),
      workoutWithTypes('b', 8, [{ type: 'working', weightKg: 62.5, reps: 8 }, { type: 'working', weightKg: 62.5, reps: 6 }]),
    ];
    expect(setSlotHistory(list, 'bench', 'working', 2)).toEqual([{ at: d(8), reps: 6, weightKg: 62.5 }]);
  });

  it('begrenzt auf `limit` Einträge', () => {
    const list = [1, 2, 3, 4, 5, 6, 7].map((day) =>
      workoutWithTypes(String(day), day, [{ type: 'working', weightKg: 60, reps: 8 }]),
    );
    expect(setSlotHistory(list, 'bench', 'working', 1, 3)).toHaveLength(3);
  });

  it('liefert nichts für eine andere Übung oder einen anderen Satz-Typ', () => {
    const list = [workoutWithTypes('a', 1, [{ type: 'warmup', weightKg: 20, reps: 10 }])];
    expect(setSlotHistory(list, 'row', 'working', 1)).toEqual([]);
    expect(setSlotHistory(list, 'bench', 'working', 1)).toEqual([]);
    expect(setSlotHistory(list, 'bench', 'warmup', 1)).toEqual([{ at: d(1), reps: 10, weightKg: 20 }]);
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

describe('Kraftverlauf pro Körperpartie und Schwachstellen', () => {
  // 'bench' trifft primär die Brust, 'row' primär den Rücken.
  const muscleOf = (id: string) =>
    id === 'bench' ? { primary: ['chest'], secondary: ['triceps'] } : { primary: ['middle back'], secondary: [] };

  function multi(id: string, day: number, benchSet: [number, number], rowSet?: [number, number]): HistWorkout {
    const w = workout(id, day, [benchSet], { exerciseId: 'bench' });
    if (rowSet) {
      w.exercises.push({ exerciseId: 'row', equipmentKg: null, sets: [{ type: 'working', weightKg: rowSet[0], reps: rowSet[1] }] });
    }
    return w;
  }

  it('nimmt je Training die Übung mit der höchsten Last für den Muskel', () => {
    const list = [multi('a', 1, [60, 8]), multi('b', 8, [65, 6])];
    const points = musclePoints(list, 'chest', muscleOf);
    expect(points.map((p) => ({ at: p.at, topLoadKg: p.topLoadKg, exerciseId: p.exerciseId }))).toEqual([
      { at: new Date(2026, 8, 1, 10).getTime(), topLoadKg: 60, exerciseId: 'bench' },
      { at: new Date(2026, 8, 8, 10).getTime(), topLoadKg: 65, exerciseId: 'bench' },
    ]);
  });

  it('zählt einen Muskel nicht, wenn er nur Hilfsmuskel einer ausgeführten Übung ist', () => {
    const list = [multi('a', 1, [60, 8])];
    // 'triceps' ist bei 'bench' nur Hilfsmuskel.
    expect(musclePoints(list, 'triceps', muscleOf)).toEqual([]);
  });

  it('listet alle Hauptmuskeln, die schon einmal trainiert wurden', () => {
    const list = [multi('a', 1, [60, 8], [40, 8])];
    expect(trainedMuscles(list, muscleOf).sort()).toEqual(['chest', 'middle back']);
  });

  it('meldet den Muskel mit den wenigsten Sätzen der letzten 7 Tage unter dem Richtwert', () => {
    // Brust: 2 Sätze in den letzten 7 Tagen (unter dem Richtwert von 10); Rücken: gar nicht trainiert.
    const list = [multi('a', 10, [60, 8]), multi('b', 11, [60, 8])];
    const now = new Date(2026, 8, 12);
    const weak = weakestMuscle(list, now, muscleOf);
    expect(weak).toEqual({ muscle: 'chest', sets: 2 });
  });

  it('meldet nichts, wenn noch nie trainiert wurde', () => {
    expect(weakestMuscle([], new Date(2026, 8, 12), muscleOf)).toBeNull();
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
    expect(h.feedback).toBeNull();
  });

  it('übernimmt das Feedback ("Wie lief\'s?") in Verlauf und Payload', () => {
    const dr = setFeedback(done(), 'great');
    const fin = new Date(2026, 8, 20, 11);
    expect(draftToHist(dr, fin).feedback).toBe('great');
    expect(buildPayload(dr, fin)!.workout.feedback).toBe('great');
    expect(payloadToHist(buildPayload(dr, fin)!).feedback).toBe('great');
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

  it('nennt als Highlight den Bestwert mit der größten relativen Verbesserung', () => {
    const cur = workout('c', 15, [[65, 8], [65, 8]]);
    const s = summarizeWorkout(cur, before, ctx);
    // Last: 65 vs. vorher 62,5 (+4 %); 1RM: 82,3 vs. 80 (+2,9 %) – Last gewinnt.
    expect(s.highlight).toBe('Bankdrücken: neuer Bestwert – Höchste Last 65 kg (vorher 62,5 kg).');
  });

  it('ohne Bestwert oder Steigerungschance bleiben Highlight und Fokus leer', () => {
    const cur = workout('c', 15, [[50, 3]], { exerciseId: 'row' });
    const s = summarizeWorkout(cur, before, ctx);
    expect(s.highlight).toBeNull();
    expect(s.focus).toBeNull();
  });

  it('nennt als Fokus die Übung mit der klarsten Steigerungschance', () => {
    const cur = workout('c', 15, [[65, 10], [65, 10], [65, 9]]);
    expect(summarizeWorkout(cur, before, ctx).focus).toBe('Bankdrücken: nächstes Mal das Gewicht steigern.');
  });

  it('ohne Steigerungschance schlägt der Fokus eine Wiederholung mehr beim Halten vor', () => {
    const hold = workout('c', 15, [[65, 9], [65, 8]]);
    expect(summarizeWorkout(hold, before, ctx).focus).toBe('Bankdrücken: Gewicht halten, eine Wiederholung mehr anstreben.');
  });
});

describe('exerciseSessions (Verlauf in der Übungskarte)', () => {
  const list = [
    workout('a', 1, [[50, 10], [50, 9]]),
    workout('b', 8, [[50, 12], [50, 12], [50, 11]]),
    workout('c', 15, [[52.5, 8], [52.5, 8]]),
    workout('x', 16, [[100, 5]], { exerciseId: 'squat' }),
  ];

  it('listet nur Trainings dieser Übung, neueste zuerst, mit Änderung des Top-Gewichts', () => {
    const r = exerciseSessions(list, 'bench');
    expect(r.map((x) => x.workoutId)).toEqual(['c', 'b', 'a']);
    expect(r.map((x) => x.topWeightKg)).toEqual([52.5, 50, 50]);
    expect(r.map((x) => x.deltaKg)).toEqual([2.5, 0, null]);
    expect(r[1].sets.map((x) => x.reps)).toEqual([12, 12, 11]);
  });

  it('begrenzt die Liste, rechnet das Delta aber gegen das ältere Training außerhalb des Limits', () => {
    const r = exerciseSessions(list, 'bench', 2);
    expect(r.map((x) => x.workoutId)).toEqual(['c', 'b']);
    expect(r[1].deltaKg).toBe(0);
  });

  it('ignoriert Trainings ohne Arbeitssatz dieser Übung', () => {
    const onlyWarm: HistWorkout = {
      id: 'w',
      name: 'Push',
      startedAt: d(20),
      finishedAt: end(20),
      exercises: [{ exerciseId: 'bench', equipmentKg: null, sets: [{ type: 'warmup', weightKg: 20, reps: 10 }] }],
    };
    expect(exerciseSessions([onlyWarm], 'bench')).toEqual([]);
    expect(exerciseSessions([], 'bench')).toEqual([]);
  });
});

describe('recentOneRmSeries (1RM-Verlauf der letzten Wochen)', () => {
  const list = [
    workout('a', 1, [[50, 10]]),
    workout('b', 8, [[50, 12]]),
    workout('c', 15, [[52.5, 8]]),
    workout('d', 22, [[60, 15]]), // über 12 Wdh.: kein 1RM
  ];
  const at = (day: number) => new Date(2026, 8, day, 12).getTime();

  it('nimmt nur Trainings mit schätzbarem 1RM im Zeitfenster, älteste zuerst', () => {
    const r = recentOneRmSeries(list, 'bench', at(23), 3);
    expect(r.map((x) => x.workoutId)).toEqual(['b', 'c']);
    expect(r.every((x) => x.best1RM !== null)).toBe(true);
  });

  it('fällt bei weniger als zwei Werten im Fenster auf die letzten Werte zurück', () => {
    const r = recentOneRmSeries(list, 'bench', at(23), 1, 2);
    expect(r.map((x) => x.workoutId)).toEqual(['b', 'c']);
  });
});
