import { describe, expect, it } from 'vitest';
import {
  addStretchItem,
  buildStretchPayload,
  clearQueue,
  consumeQueued,
  createStretchDraft,
  amountLabel,
  addStretchRounds,
  buildStretchPlanPayload,
  itemSummary,
  movePlanItem,
  newPlanItem,
  plannedRounds,
  queueFromPlan,
  roundSides,
  setPlanItemMode,
  removeStretchItem,
  totalHoldSeconds,
  updateStretchItem,
  type StretchPlan,
} from './stretch';

const NOW = new Date('2026-09-28T18:00:00.000Z');

describe('createStretchDraft', () => {
  it('startet ohne Übungen, mit dem angegebenen Ausgangsgefühl', () => {
    const d = createStretchDraft(NOW, 4);
    expect(d.items).toEqual([]);
    expect(d.feelingBefore).toBe(4);
    expect(d.startedAt).toBe(NOW.toISOString());
  });
});

describe('addStretchItem / removeStretchItem / updateStretchItem', () => {
  it('fügt eine Übung mit Haltezeit und Seite hinzu', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchItem(
      d,
      { stretchExerciseId: 'ex1', name: 'Quadrizeps-Dehnung', isNew: false },
      'links',
      30,
    );
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({
      stretchExerciseId: 'ex1',
      name: 'Quadrizeps-Dehnung',
      side: 'links',
      holdSeconds: 30,
      sets: 1,
    });
  });

  it('entfernt eine Übung wieder', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchItem(d, { stretchExerciseId: 'ex1', name: 'A', isNew: false }, 'beidseitig', 30);
    const id = d.items[0].id;
    d = removeStretchItem(d, id);
    expect(d.items).toEqual([]);
  });

  it('aktualisiert Seite und Haltezeit einer bestehenden Übung', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchItem(d, { stretchExerciseId: 'ex1', name: 'A', isNew: false }, 'links', 30);
    const id = d.items[0].id;
    d = updateStretchItem(d, id, { side: 'rechts', holdSeconds: 45 });
    expect(d.items[0].side).toBe('rechts');
    expect(d.items[0].holdSeconds).toBe(45);
  });
});

describe('totalHoldSeconds', () => {
  it('summiert Haltezeit mal Sätze über alle Übungen', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchItem(d, { stretchExerciseId: 'ex1', name: 'A', isNew: false }, 'links', 30, 2);
    d = addStretchItem(d, { stretchExerciseId: 'ex2', name: 'B', isNew: false }, 'beidseitig', 20, 1);
    expect(totalHoldSeconds(d)).toBe(30 * 2 + 20 * 1);
  });
});

describe('buildStretchPayload', () => {
  it('liefert null ohne Übungen', () => {
    const d = createStretchDraft(NOW, 5);
    expect(buildStretchPayload(d, NOW, 3, '')).toBeNull();
  });

  it('baut Session- und Item-Zeilen, Notiz wird getrimmt', () => {
    let d = createStretchDraft(NOW, 6);
    d = addStretchItem(d, { stretchExerciseId: 'ex1', name: 'A', isNew: false }, 'links', 30);
    const finishedAt = new Date('2026-09-28T18:10:00.000Z');
    const payload = buildStretchPayload(d, finishedAt, 3, '  Gut gedehnt  ');
    expect(payload).not.toBeNull();
    expect(payload!.session).toMatchObject({
      id: d.id,
      started_at: d.startedAt,
      finished_at: finishedAt.toISOString(),
      feeling_before: 6,
      feeling_after: 3,
      note: 'Gut gedehnt',
    });
    expect(payload!.items).toEqual([
      {
        id: d.items[0].id,
        session_id: d.id,
        stretch_exercise_id: 'ex1',
        position: 1,
        side: 'links',
        hold_seconds: 30,
        sets: 1,
      },
    ]);
    expect(payload!.newExercises).toEqual([]);
  });

  it('leere Notiz wird zu null', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchItem(d, { stretchExerciseId: 'ex1', name: 'A', isNew: false }, 'links', 30);
    const payload = buildStretchPayload(d, NOW, null, '   ');
    expect(payload!.session.note).toBeNull();
  });

  it('legt neue eigene Übungen einmalig an, auch bei mehrfacher Nutzung in der Session', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchItem(
      d,
      { stretchExerciseId: 'new1', name: 'Eigene Dehnung', isNew: true, muscles: ['hamstrings'] },
      'links',
      30,
    );
    d = addStretchItem(
      d,
      { stretchExerciseId: 'new1', name: 'Eigene Dehnung', isNew: true, muscles: ['hamstrings'] },
      'rechts',
      30,
    );
    const payload = buildStretchPayload(d, NOW, null, '');
    expect(payload!.newExercises).toEqual([
      { id: 'new1', name_de: 'Eigene Dehnung', muscles: ['hamstrings'], default_hold_seconds: 30 },
    ]);
    expect(payload!.items).toHaveLength(2);
  });
});


describe('Vorlagen: queueFromPlan / consumeQueued / clearQueue', () => {
  const plan: StretchPlan = {
    id: 'plan1',
    name: 'Testroutine',
    items: [
      { id: 'pi1', stretchExerciseId: 'ex1', side: 'links', holdSeconds: 20, sets: 1 },
      { id: 'pi2', stretchExerciseId: 'ex2', side: 'beidseitig', holdSeconds: 30, sets: 2 },
    ],
  };
  const nameOf = (id: string) => (id === 'ex1' ? 'Übung A' : 'Übung B');
  const musclesOf = (id: string) => (id === 'ex1' ? ['neck'] : ['chest']);

  it('baut aus der Vorlage eine Warteschlange in Reihenfolge', () => {
    const queue = queueFromPlan(plan, nameOf, musclesOf);
    expect(queue).toEqual([
      { input: { stretchExerciseId: 'ex1', name: 'Übung A', isNew: false, muscles: ['neck'] }, side: 'links', holdSeconds: 20, reps: null, sets: 1 },
      { input: { stretchExerciseId: 'ex2', name: 'Übung B', isNew: false, muscles: ['chest'] }, side: 'beidseitig', holdSeconds: 30, reps: null, sets: 2 },
    ]);
  });

  it('legt eine Session direkt mit Warteschlange und Vorlagenname an', () => {
    const queue = queueFromPlan(plan, nameOf, musclesOf);
    const d = createStretchDraft(NOW, null, queue, plan.name);
    expect(d.queue).toHaveLength(2);
    expect(d.planName).toBe('Testroutine');
    expect(d.items).toEqual([]);
  });

  it('consumeQueued verbucht die erste Übung der Warteschlange mit der gemessenen Zeit', () => {
    const queue = queueFromPlan(plan, nameOf, musclesOf);
    let d = createStretchDraft(NOW, null, queue, plan.name);
    d = consumeQueued(d, [{ side: 'rechts', holdSeconds: 25, reps: null }]);
    expect(d.items).toHaveLength(1);
    expect(d.items[0]).toMatchObject({ stretchExerciseId: 'ex1', side: 'rechts', holdSeconds: 25, sets: 1 });
    expect(d.queue).toHaveLength(1);
    expect(d.queue![0].input.stretchExerciseId).toBe('ex2');
  });

  it('consumeQueued ohne Warteschlange lässt den Entwurf unverändert', () => {
    const d = createStretchDraft(NOW, null);
    expect(consumeQueued(d, [{ side: 'links', holdSeconds: 20, reps: null }])).toBe(d);
  });

  it('clearQueue verwirft die restliche Warteschlange, geloggte Übungen bleiben', () => {
    const queue = queueFromPlan(plan, nameOf, musclesOf);
    let d = createStretchDraft(NOW, null, queue, plan.name);
    d = consumeQueued(d, [{ side: 'links', holdSeconds: 20, reps: null }]);
    d = clearQueue(d);
    expect(d.queue).toEqual([]);
    expect(d.items).toHaveLength(1);
  });
});


describe('Seiten und Durchgänge', () => {
  it('beidseitig = erst links, dann rechts; alle anderen Seiten ein Durchgang', () => {
    expect(roundSides('beidseitig')).toEqual(['links', 'rechts']);
    expect(roundSides('links')).toEqual(['links']);
    expect(roundSides('rechts')).toEqual(['rechts']);
    expect(roundSides('mittig')).toEqual(['mittig']);
  });

  it('plannedRounds: je Satz alle Seiten, dann der nächste Satz', () => {
    expect(plannedRounds('beidseitig', 2)).toEqual([
      { side: 'links', set: 1 },
      { side: 'rechts', set: 1 },
      { side: 'links', set: 2 },
      { side: 'rechts', set: 2 },
    ]);
    expect(plannedRounds('mittig', 1)).toEqual([{ side: 'mittig', set: 1 }]);
  });

  it('plannedRounds rechnet ungültige Satzzahlen auf mindestens einen Satz', () => {
    expect(plannedRounds('links', 0)).toHaveLength(1);
    expect(plannedRounds('links', NaN)).toHaveLength(1);
  });
});

describe('Wiederholungs-Übungen (kein Timer)', () => {
  const input = { stretchExerciseId: 'cc', name: 'Cat-Cow', isNew: false };

  it('addStretchRounds legt je Durchgang einen Eintrag an, Wiederholungen ohne Haltezeit', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchRounds(d, input, [
      { side: 'links', holdSeconds: null, reps: 8 },
      { side: 'rechts', holdSeconds: null, reps: 8 },
    ]);
    expect(d.items.map((i) => [i.side, i.holdSeconds, i.reps, i.sets])).toEqual([
      ['links', null, 8, 1],
      ['rechts', null, 8, 1],
    ]);
  });

  it('Payload: Wiederholungen ohne hold_seconds, Haltezeit-Einträge ohne reps-Feld', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchRounds(d, input, [{ side: 'mittig', holdSeconds: null, reps: 10 }]);
    d = addStretchRounds(d, { stretchExerciseId: 'q', name: 'Quad', isNew: false }, [
      { side: 'links', holdSeconds: 31, reps: null },
    ]);
    const p = buildStretchPayload(d, NOW, null, '');
    expect(p!.items[0]).toMatchObject({ side: 'mittig', hold_seconds: null, reps: 10 });
    expect(p!.items[1]).not.toHaveProperty('reps');
    expect(p!.items[1]).toMatchObject({ side: 'links', hold_seconds: 31 });
  });

  it('neue eigene Wiederholungs-Übung bekommt default_reps statt default_hold_seconds', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchRounds(
      d,
      { stretchExerciseId: 'n1', name: 'Eigene', isNew: true, muscles: ['neck'] },
      [{ side: 'mittig', holdSeconds: null, reps: 12 }],
    );
    expect(buildStretchPayload(d, NOW, null, '')!.newExercises).toEqual([
      { id: 'n1', name_de: 'Eigene', muscles: ['neck'], default_hold_seconds: null, default_reps: 12 },
    ]);
  });

  it('totalHoldSeconds ignoriert Wiederholungs-Einträge', () => {
    let d = createStretchDraft(NOW, null);
    d = addStretchRounds(d, input, [{ side: 'mittig', holdSeconds: null, reps: 10 }]);
    d = addStretchItem(d, { stretchExerciseId: 'q', name: 'Q', isNew: false }, 'links', 30);
    expect(totalHoldSeconds(d)).toBe(30);
  });

  it('queueFromPlan übernimmt Wiederholungen aus der Vorlage', () => {
    const plan: StretchPlan = {
      id: 'p',
      name: 'P',
      items: [{ id: 'i', stretchExerciseId: 'cc', side: 'mittig', holdSeconds: null, reps: 10, sets: 1 }],
    };
    expect(queueFromPlan(plan, () => 'Cat-Cow', () => [])[0]).toMatchObject({
      side: 'mittig',
      holdSeconds: null,
      reps: 10,
    });
  });

  it('Beschriftung: Sekunden oder Wdh., Seite nur wenn vorhanden', () => {
    expect(amountLabel(30, null, 1)).toBe('30 s');
    expect(amountLabel(null, 10, 2)).toBe('10 Wdh. × 2');
    expect(itemSummary('mittig', null, 10, 1)).toBe('10 Wdh.');
    expect(itemSummary('links', 30, null, 1)).toBe('Links · 30 s');
    expect(itemSummary('beidseitig', 30, null, 1)).toBe('Beide Seiten · 30 s');
  });
});

describe('Vorlagen bearbeiten', () => {
  const a = { id: 'a', stretchExerciseId: 'ex1', side: 'links' as const, holdSeconds: 20, reps: null, sets: 1 };
  const b = { id: 'b', stretchExerciseId: 'ex2', side: 'mittig' as const, holdSeconds: null, reps: 10, sets: 1 };

  it('movePlanItem verschiebt und bleibt am Rand unverändert', () => {
    expect(movePlanItem([a, b], 'b', -1).map((i) => i.id)).toEqual(['b', 'a']);
    const same = [a, b];
    expect(movePlanItem(same, 'a', -1)).toBe(same);
    expect(movePlanItem(same, 'b', 1)).toBe(same);
  });

  it('setPlanItemMode wechselt zwischen Zeit und Wiederholungen und setzt den anderen Wert zurück', () => {
    expect(setPlanItemMode([a], 'a', 'reps')[0]).toMatchObject({ holdSeconds: null, reps: 10 });
    expect(setPlanItemMode([b], 'b', 'hold')[0]).toMatchObject({ holdSeconds: 30, reps: null });
  });

  it('newPlanItem startet mit Standardseite beidseitig und einem Satz', () => {
    const it = newPlanItem('ex9', { holdSeconds: 30, reps: null });
    expect(it).toMatchObject({ stretchExerciseId: 'ex9', side: 'beidseitig', holdSeconds: 30, sets: 1 });
  });

  it('buildStretchPlanPayload: null ohne Namen oder Übungen, sonst Zeilen in Reihenfolge', () => {
    expect(buildStretchPlanPayload({ id: 'p', name: '  ', items: [a] }, [])).toBeNull();
    expect(buildStretchPlanPayload({ id: 'p', name: 'X', items: [] }, [])).toBeNull();
    const p = buildStretchPlanPayload(
      { id: 'p', name: ' Meine ', items: [a, b] },
      [
        { id: 'ex1', name_de: 'unbenutzt?', muscles: [], default_hold_seconds: 20 },
        { id: 'zzz', name_de: 'nicht in Vorlage', muscles: [], default_hold_seconds: 20 },
      ],
    )!;
    expect(p.plan).toEqual({ id: 'p', name: 'Meine' });
    expect(p.newExercises.map((x) => x.id)).toEqual(['ex1']);
    expect(p.items.map((i) => [i.position, i.side, i.hold_seconds])).toEqual([
      [1, 'links', 20],
      [2, 'mittig', null],
    ]);
    expect(p.items[1]).toMatchObject({ reps: 10 });
    expect(p.items[0]).not.toHaveProperty('reps');
  });
});
