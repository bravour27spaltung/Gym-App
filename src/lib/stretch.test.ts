import { describe, expect, it } from 'vitest';
import {
  addStretchItem,
  buildStretchPayload,
  createStretchDraft,
  removeStretchItem,
  totalHoldSeconds,
  updateStretchItem,
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
