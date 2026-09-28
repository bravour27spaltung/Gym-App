import { newId } from './workout';

/**
 * Zustand einer laufenden Stretching-Session. Reine Logik ohne Browser- oder
 * Datenbankzugriff (wie workout.ts), damit sie sich testen lässt und offline
 * funktioniert. Alle Funktionen geben neue Objekte zurück, nichts wird verändert.
 */

export type StretchSide = 'links' | 'rechts' | 'beidseitig';

export interface StretchItem {
  id: string;
  stretchExerciseId: string;
  name: string;
  /** true = eigene Dehnübung, die beim Abschluss erst in der Datenbank angelegt wird. */
  isNew: boolean;
  /** Nur für eigene Übungen (isNew) nötig. */
  muscles: string[];
  side: StretchSide;
  /** Tatsächlich gehaltene Zeit in Sekunden (aus dem Live-Timer). */
  holdSeconds: number;
  sets: number;
}

export interface QueuedStretch {
  input: StretchExerciseInput;
  side: StretchSide;
  holdSeconds: number;
  sets: number;
}

export interface StretchDraft {
  id: string;
  startedAt: string;
  /** Verspannung vor der Session, 1 (locker) – 10 (sehr verspannt); null = nicht erfasst. */
  feelingBefore: number | null;
  items: StretchItem[];
  /** Ende des laufenden Haltezeit-Timers (Date.now()-Zeit in ms); null = kein Timer aktiv. */
  timerEndsAt?: number | null;
  /** Aus einer Vorlage übernommene, noch abzuarbeitende Übungen (ältere Entwürfe haben keine). */
  queue?: QueuedStretch[];
  /** Name der Vorlage, falls die Session daraus gestartet wurde. */
  planName?: string | null;
}

export interface StretchExerciseInput {
  stretchExerciseId: string;
  name: string;
  isNew: boolean;
  muscles?: string[];
  defaultHoldSeconds?: number | null;
}

export function createStretchDraft(
  now: Date,
  feelingBefore: number | null,
  queue: QueuedStretch[] = [],
  planName: string | null = null,
): StretchDraft {
  return { id: newId(), startedAt: now.toISOString(), feelingBefore, items: [], queue, planName };
}

/**
 * Nächste Übung aus der Vorlagen-Warteschlange mit dem tatsächlichen Timer-Ergebnis
 * verbuchen und aus der Warteschlange nehmen. Ohne Warteschlange passiert nichts.
 */
export function consumeQueued(draft: StretchDraft, side: StretchSide, holdSeconds: number): StretchDraft {
  const queue = draft.queue ?? [];
  if (queue.length === 0) return draft;
  const [head, ...rest] = queue;
  const withItem = addStretchItem(draft, head.input, side, holdSeconds, head.sets);
  return { ...withItem, queue: rest };
}

/** Restliche Vorlagen-Warteschlange verwerfen (z. B. um manuell weiterzumachen). */
export function clearQueue(draft: StretchDraft): StretchDraft {
  return { ...draft, queue: [] };
}

/** Neue Dehnübung mit gemessener Haltezeit zur Session hinzufügen. */
export function addStretchItem(
  draft: StretchDraft,
  input: StretchExerciseInput,
  side: StretchSide,
  holdSeconds: number,
  sets = 1,
): StretchDraft {
  const item: StretchItem = {
    id: newId(),
    stretchExerciseId: input.stretchExerciseId,
    name: input.name,
    isNew: input.isNew,
    muscles: input.muscles ?? [],
    side,
    holdSeconds,
    sets,
  };
  return { ...draft, items: [...draft.items, item] };
}

export function removeStretchItem(draft: StretchDraft, itemId: string): StretchDraft {
  return { ...draft, items: draft.items.filter((i) => i.id !== itemId) };
}

export function updateStretchItem(
  draft: StretchDraft,
  itemId: string,
  patch: Partial<Pick<StretchItem, 'side' | 'holdSeconds' | 'sets'>>,
): StretchDraft {
  return {
    ...draft,
    items: draft.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
  };
}

/** Gesamtdauer der bisher geloggten Übungen in Sekunden (Haltezeit × Sätze). */
export function totalHoldSeconds(draft: StretchDraft): number {
  return draft.items.reduce((sum, i) => sum + i.holdSeconds * i.sets, 0);
}

const SIDE_LABELS: Record<StretchSide, string> = {
  links: 'Links',
  rechts: 'Rechts',
  beidseitig: 'Beidseitig',
};

export function sideLabel(side: StretchSide): string {
  return SIDE_LABELS[side];
}

// ---------------------------------------------------------------------------
// Vorlagen (fertige Routinen aus Dehnübungen)

export interface StretchPlanItem {
  id: string;
  stretchExerciseId: string;
  side: StretchSide;
  holdSeconds: number;
  sets: number;
}

export interface StretchPlan {
  id: string;
  name: string;
  items: StretchPlanItem[];
}

/** Baut aus einer Vorlage die Warteschlange für eine neue Session. */
export function queueFromPlan(
  plan: StretchPlan,
  nameOf: (stretchExerciseId: string) => string,
  musclesOf: (stretchExerciseId: string) => string[],
): QueuedStretch[] {
  return plan.items.map((it) => ({
    input: {
      stretchExerciseId: it.stretchExerciseId,
      name: nameOf(it.stretchExerciseId),
      isNew: false,
      muscles: musclesOf(it.stretchExerciseId),
    },
    side: it.side,
    holdSeconds: it.holdSeconds,
    sets: it.sets,
  }));
}

// ---------------------------------------------------------------------------
// Abschluss: Entwurf -> Datenbankzeilen

export interface NewStretchExerciseRow {
  id: string;
  name_de: string;
  muscles: string[];
  default_hold_seconds: number | null;
}

export interface StretchPayload {
  newExercises: NewStretchExerciseRow[];
  session: {
    id: string;
    started_at: string;
    finished_at: string;
    feeling_before: number | null;
    feeling_after: number | null;
    note: string | null;
  };
  items: {
    id: string;
    session_id: string;
    stretch_exercise_id: string;
    position: number;
    side: StretchSide;
    hold_seconds: number;
    sets: number;
  }[];
}

/**
 * Baut die Zeilen für die Datenbank. Eine Session ohne Übungen wird nicht gespeichert.
 * Alle IDs stammen aus dem Entwurf, ein Sync-Versuch kann deshalb gefahrlos wiederholt
 * werden (Upsert).
 */
export function buildStretchPayload(
  draft: StretchDraft,
  finishedAt: Date,
  feelingAfter: number | null,
  note: string,
): StretchPayload | null {
  if (draft.items.length === 0) return null;

  const finished = finishedAt.toISOString();
  const payload: StretchPayload = {
    newExercises: [],
    session: {
      id: draft.id,
      started_at: draft.startedAt,
      finished_at: finished,
      feeling_before: draft.feelingBefore,
      feeling_after: feelingAfter,
      note: note.trim() === '' ? null : note.trim(),
    },
    items: [],
  };

  const seenNew = new Set<string>();
  draft.items.forEach((it, i) => {
    if (it.isNew && !seenNew.has(it.stretchExerciseId)) {
      seenNew.add(it.stretchExerciseId);
      payload.newExercises.push({
        id: it.stretchExerciseId,
        name_de: it.name,
        muscles: it.muscles,
        default_hold_seconds: it.holdSeconds,
      });
    }
    payload.items.push({
      id: it.id,
      session_id: draft.id,
      stretch_exercise_id: it.stretchExerciseId,
      position: i + 1,
      side: it.side,
      hold_seconds: it.holdSeconds,
      sets: it.sets,
    });
  });
  return payload;
}
