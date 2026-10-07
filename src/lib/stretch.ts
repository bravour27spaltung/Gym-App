import { newId } from './workout';

/**
 * Zustand einer laufenden Stretching-Session. Reine Logik ohne Browser- oder
 * Datenbankzugriff (wie workout.ts), damit sie sich testen lässt und offline
 * funktioniert. Alle Funktionen geben neue Objekte zurück, nichts wird verändert.
 */

/**
 * Seite einer Dehnübung im Plan/Entwurf:
 * - 'beidseitig': beide Seiten nacheinander, jede Seite bekommt einen eigenen Durchgang
 *   (Timer bzw. Wiederholungen) – gespeichert wird je Seite ein Eintrag (links, rechts).
 * - 'links' / 'rechts': nur diese Seite, ein Durchgang.
 * - 'mittig': symmetrische Übung ohne Seitenbezug (z. B. Schmetterling), ein Durchgang.
 */
export type StretchSide = 'links' | 'rechts' | 'beidseitig' | 'mittig';

/** Seite eines einzelnen Durchgangs (nach Auflösen von 'beidseitig'). */
export type RoundSide = 'links' | 'rechts' | 'mittig';

/** Ergebnis eines Durchgangs: entweder gehaltene Zeit oder Wiederholungen, nie beides. */
export interface StretchRound {
  side: RoundSide;
  holdSeconds: number | null;
  reps: number | null;
}

export interface PlannedRound {
  side: RoundSide;
  /** Satz-Nummer ab 1. */
  set: number;
}

/** Seiten, die nacheinander bearbeitet werden. */
export function roundSides(side: StretchSide): RoundSide[] {
  return side === 'beidseitig' ? ['links', 'rechts'] : [side];
}

/** Durchgänge einer Übung: je Satz alle Seiten, dann der nächste Satz. */
export function plannedRounds(side: StretchSide, sets: number): PlannedRound[] {
  const n = Math.max(1, Math.floor(sets) || 1);
  const out: PlannedRound[] = [];
  for (let set = 1; set <= n; set++) {
    for (const s of roundSides(side)) out.push({ side: s, set });
  }
  return out;
}

export interface StretchItem {
  id: string;
  stretchExerciseId: string;
  name: string;
  /** true = eigene Dehnübung, die beim Abschluss erst in der Datenbank angelegt wird. */
  isNew: boolean;
  /** Nur für eigene Übungen (isNew) nötig. */
  muscles: string[];
  side: StretchSide;
  /** Tatsächlich gehaltene Zeit in Sekunden (aus dem Live-Timer); null bei Wiederholungs-Übungen. */
  holdSeconds: number | null;
  /** Wiederholungen bei Übungen ohne Haltezeit (kein Timer); fehlt in älteren Entwürfen. */
  reps?: number | null;
  sets: number;
}

export interface QueuedStretch {
  input: StretchExerciseInput;
  side: StretchSide;
  /** Ziel-Haltezeit; null, wenn die Übung nach Wiederholungen läuft. */
  holdSeconds: number | null;
  /** Ziel-Wiederholungen; gesetzt = Übung ohne Timer. Fehlt in älteren Entwürfen. */
  reps?: number | null;
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
  defaultReps?: number | null;
}

/** Soll/Ist einer Übung: Haltezeit (Timer) oder Wiederholungen (kein Timer). */
export interface StretchAmount {
  holdSeconds: number | null;
  reps: number | null;
}

export const DEFAULT_HOLD_SECONDS = 30;

/** Automatische Pause zwischen zwei Dehn-Durchgängen (Seitenwechsel, Satz, nächste Übung). */
export const STRETCH_AUTO_PAUSE_SECONDS = 5;
export const DEFAULT_REPS = 10;

/** Menge für eine Übung nach ihren Standardwerten; ohne Angabe die übergebene Haltezeit. */
export function defaultAmount(
  x: { defaultHoldSeconds?: number | null; defaultReps?: number | null },
  fallbackHold = DEFAULT_HOLD_SECONDS,
): StretchAmount {
  if (x.defaultReps != null) return { holdSeconds: null, reps: x.defaultReps };
  return { holdSeconds: x.defaultHoldSeconds ?? fallbackHold, reps: null };
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
 * Nächste Übung aus der Vorlagen-Warteschlange mit den tatsächlich absolvierten
 * Durchgängen verbuchen (je Durchgang ein Eintrag) und aus der Warteschlange nehmen.
 * Ohne Durchgänge (Überspringen) wird die Übung nur aus der Warteschlange genommen.
 * Ohne Warteschlange passiert nichts.
 */
export function consumeQueued(draft: StretchDraft, rounds: StretchRound[]): StretchDraft {
  const queue = draft.queue ?? [];
  if (queue.length === 0) return draft;
  const [head, ...rest] = queue;
  const withItems = addStretchRounds(draft, head.input, rounds);
  return { ...withItems, queue: rest };
}

/** Restliche Vorlagen-Warteschlange verwerfen (z. B. um manuell weiterzumachen). */
export function clearQueue(draft: StretchDraft): StretchDraft {
  return { ...draft, queue: [] };
}

/** Neue Dehnübung mit gemessener Haltezeit (oder Wiederholungen) zur Session hinzufügen. */
export function addStretchItem(
  draft: StretchDraft,
  input: StretchExerciseInput,
  side: StretchSide,
  holdSeconds: number | null,
  sets = 1,
  reps: number | null = null,
): StretchDraft {
  const item: StretchItem = {
    id: newId(),
    stretchExerciseId: input.stretchExerciseId,
    name: input.name,
    isNew: input.isNew,
    muscles: input.muscles ?? [],
    side,
    holdSeconds,
    reps,
    sets,
  };
  return { ...draft, items: [...draft.items, item] };
}

/** Absolvierte Durchgänge einer Übung verbuchen: je Durchgang ein Eintrag mit einem Satz. */
export function addStretchRounds(
  draft: StretchDraft,
  input: StretchExerciseInput,
  rounds: StretchRound[],
): StretchDraft {
  return rounds.reduce(
    (d, r) => addStretchItem(d, input, r.side, r.holdSeconds, 1, r.reps),
    draft,
  );
}

export function removeStretchItem(draft: StretchDraft, itemId: string): StretchDraft {
  return { ...draft, items: draft.items.filter((i) => i.id !== itemId) };
}

export function updateStretchItem(
  draft: StretchDraft,
  itemId: string,
  patch: Partial<Pick<StretchItem, 'side' | 'holdSeconds' | 'reps' | 'sets'>>,
): StretchDraft {
  return {
    ...draft,
    items: draft.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
  };
}

/** Gesamte Haltezeit der bisher geloggten Übungen in Sekunden (Haltezeit × Sätze); Wiederholungen zählen nicht. */
export function totalHoldSeconds(draft: StretchDraft): number {
  return draft.items.reduce((sum, i) => sum + (i.holdSeconds ?? 0) * i.sets, 0);
}

const SIDE_LABELS: Record<StretchSide, string> = {
  links: 'Links',
  rechts: 'Rechts',
  beidseitig: 'Beide Seiten',
  mittig: 'Ohne Seite',
};

export function sideLabel(side: StretchSide): string {
  return SIDE_LABELS[side];
}

/** "30 s", "10 Wdh." – bei mehreren Sätzen mit "× n". */
export function amountLabel(holdSeconds: number | null, reps: number | null | undefined, sets: number): string {
  const base = reps != null ? `${reps} Wdh.` : `${holdSeconds ?? 0} s`;
  return sets > 1 ? `${base} × ${sets}` : base;
}

/** Eine Zeile für Listen: Seite (außer bei symmetrischen Übungen) und Menge. */
export function itemSummary(
  side: StretchSide,
  holdSeconds: number | null,
  reps: number | null | undefined,
  sets: number,
): string {
  const amount = amountLabel(holdSeconds, reps, sets);
  return side === 'mittig' ? amount : `${sideLabel(side)} · ${amount}`;
}

// ---------------------------------------------------------------------------
// Vorlagen (fertige Routinen aus Dehnübungen)

export interface StretchPlanItem {
  id: string;
  stretchExerciseId: string;
  side: StretchSide;
  /** Ziel-Haltezeit (Timer); null, wenn die Übung nach Wiederholungen läuft. */
  holdSeconds: number | null;
  /** Ziel-Wiederholungen (kein Timer); null/fehlt bei Haltezeit-Übungen. */
  reps?: number | null;
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
    reps: it.reps ?? null,
    sets: it.sets,
  }));
}

// ---------------------------------------------------------------------------
// Vorlagen bearbeiten (reine Funktionen für den Editor)

/** Neuer Vorlagen-Eintrag; ohne Angabe die Standardwerte der Übung, Seite beide nacheinander. */
export function newPlanItem(
  stretchExerciseId: string,
  amount: StretchAmount,
  side: StretchSide = 'beidseitig',
): StretchPlanItem {
  return { id: newId(), stretchExerciseId, side, holdSeconds: amount.holdSeconds, reps: amount.reps, sets: 1 };
}

export function updatePlanItem(
  items: StretchPlanItem[],
  id: string,
  patch: Partial<Omit<StretchPlanItem, 'id' | 'stretchExerciseId'>>,
): StretchPlanItem[] {
  return items.map((it) => (it.id === id ? { ...it, ...patch } : it));
}

/** Zwischen Zeit- und Wiederholungs-Modus wechseln; der jeweils andere Wert wird zurückgesetzt. */
export function setPlanItemMode(
  items: StretchPlanItem[],
  id: string,
  mode: 'hold' | 'reps',
): StretchPlanItem[] {
  return updatePlanItem(
    items,
    id,
    mode === 'reps'
      ? { holdSeconds: null, reps: DEFAULT_REPS }
      : { holdSeconds: DEFAULT_HOLD_SECONDS, reps: null },
  );
}

export function removePlanItem(items: StretchPlanItem[], id: string): StretchPlanItem[] {
  return items.filter((it) => it.id !== id);
}

/** Eintrag eine Position nach oben (-1) oder unten (+1) schieben; am Rand bleibt alles gleich. */
export function movePlanItem(items: StretchPlanItem[], id: string, dir: -1 | 1): StretchPlanItem[] {
  const i = items.findIndex((it) => it.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

// ---------------------------------------------------------------------------
// Abschluss: Entwurf -> Datenbankzeilen

export interface NewStretchExerciseRow {
  id: string;
  name_de: string;
  muscles: string[];
  default_hold_seconds: number | null;
  /** Nur bei Wiederholungs-Übungen gesetzt (Spalte erst seit Migration 0015). */
  default_reps?: number;
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
    hold_seconds: number | null;
    /** Nur bei Wiederholungs-Übungen gesetzt (Spalte erst seit Migration 0015). */
    reps?: number;
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
      payload.newExercises.push(newExerciseRow(it.stretchExerciseId, it.name, it.muscles, it));
    }
    payload.items.push({
      id: it.id,
      session_id: draft.id,
      stretch_exercise_id: it.stretchExerciseId,
      position: i + 1,
      side: it.side,
      hold_seconds: it.reps != null ? null : it.holdSeconds,
      ...(it.reps != null ? { reps: it.reps } : {}),
      sets: it.sets,
    });
  });
  return payload;
}

/** Zeile für eine neu angelegte eigene Dehnübung; die Menge der ersten Verwendung wird Standard. */
export function newExerciseRow(
  id: string,
  name: string,
  muscles: string[],
  amount: { holdSeconds: number | null; reps?: number | null },
): NewStretchExerciseRow {
  return {
    id,
    name_de: name,
    muscles,
    default_hold_seconds: amount.reps != null ? null : amount.holdSeconds,
    ...(amount.reps != null ? { default_reps: amount.reps } : {}),
  };
}

export interface StretchPlanPayload {
  newExercises: NewStretchExerciseRow[];
  plan: { id: string; name: string };
  items: {
    id: string;
    plan_id: string;
    stretch_exercise_id: string;
    position: number;
    side: StretchSide;
    hold_seconds: number | null;
    reps?: number;
    sets: number;
  }[];
}

/**
 * Baut die Zeilen zum Speichern einer Vorlage. Ohne Namen oder ohne Übung gibt es
 * nichts zu speichern (null). Nur neue Übungen, die in der Vorlage vorkommen, werden mitgeschickt.
 */
export function buildStretchPlanPayload(
  plan: StretchPlan,
  newExercises: NewStretchExerciseRow[],
): StretchPlanPayload | null {
  const name = plan.name.trim();
  if (name === '' || plan.items.length === 0) return null;
  const used = new Set(plan.items.map((it) => it.stretchExerciseId));
  return {
    newExercises: newExercises.filter((x) => used.has(x.id)),
    plan: { id: plan.id, name },
    items: plan.items.map((it, i) => ({
      id: it.id,
      plan_id: plan.id,
      stretch_exercise_id: it.stretchExerciseId,
      position: i + 1,
      side: it.side,
      hold_seconds: it.reps != null ? null : it.holdSeconds,
      ...(it.reps != null ? { reps: it.reps } : {}),
      sets: it.sets,
    })),
  };
}
