import type { Plan } from './plan';
import type { LoggedSet } from './progression';
import type { Draft, WorkoutPayload } from './workout';

/**
 * Lokaler Zwischenspeicher (localStorage), damit im Studio bei schlechtem
 * Empfang nichts verloren geht:
 *  - draft:   das laufende Training
 *  - outbox:  abgeschlossene Trainings, die noch nicht in Supabase sind
 *  - lastSets: Sätze des letzten Trainings je Übung (Vorbelegung auch offline)
 *  - exercises: Übungsliste für die Auswahl
 *
 * Jeder Zugriff ist abgesichert: Im privaten Modus oder bei gesperrtem
 * Speicher wirft localStorage Fehler, die App läuft dann ohne Zwischenspeicher.
 */

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface ExerciseListItem {
  id: string;
  name: string;
  /** Geräteart, z. B. 'barbell' (Schlüssel siehe equipment.ts). */
  equipment?: string | null;
  /** Optional, weil ältere Zwischenspeicher-Stände diese Felder nicht haben. */
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
}

/** Sätze und Stangen-/Maschinengewicht des letzten Trainings einer Übung. */
export interface LastInfo {
  sets: LoggedSet[];
  equipmentKg: number | null;
}

const KEYS = {
  draft: 'gym.draft.v1',
  outbox: 'gym.outbox.v1',
  lastSets: 'gym.lastSets.v1',
  lastEquipment: 'gym.lastEquipment.v1',
  exercises: 'gym.exercises.v1',
  plans: 'gym.plans.v1',
  lastPlanDay: 'gym.lastPlanDay.v1',
} as const;

export function createStore(storage: KeyValueStorage | null) {
  function read<T>(key: string, fallback: T): T {
    if (!storage) return fallback;
    try {
      const raw = storage.getItem(key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  function write(key: string, value: unknown): boolean {
    if (!storage) return false;
    try {
      storage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  return {
    loadDraft: () => read<Draft | null>(KEYS.draft, null),
    saveDraft: (d: Draft) => write(KEYS.draft, d),
    clearDraft() {
      try {
        storage?.removeItem(KEYS.draft);
      } catch {
        /* ignorieren */
      }
    },

    loadOutbox: () => read<WorkoutPayload[]>(KEYS.outbox, []),
    saveOutbox: (items: WorkoutPayload[]) => write(KEYS.outbox, items),
    enqueue(p: WorkoutPayload): boolean {
      const items = read<WorkoutPayload[]>(KEYS.outbox, []).filter(
        (x) => x.workout.id !== p.workout.id,
      );
      items.push(p);
      return write(KEYS.outbox, items);
    },

    loadLastSets: () => read<Record<string, LoggedSet[]>>(KEYS.lastSets, {}),
    getLastSets(exerciseId: string): LoggedSet[] {
      return read<Record<string, LoggedSet[]>>(KEYS.lastSets, {})[exerciseId] ?? [];
    },
    setLastSets(exerciseId: string, sets: LoggedSet[]): boolean {
      const all = read<Record<string, LoggedSet[]>>(KEYS.lastSets, {});
      all[exerciseId] = sets;
      return write(KEYS.lastSets, all);
    },

    getLastEquipment(exerciseId: string): number | null {
      return read<Record<string, number | null>>(KEYS.lastEquipment, {})[exerciseId] ?? null;
    },
    setLastEquipment(exerciseId: string, kg: number | null): boolean {
      const all = read<Record<string, number | null>>(KEYS.lastEquipment, {});
      all[exerciseId] = kg;
      return write(KEYS.lastEquipment, all);
    },

    loadExercises: () => read<ExerciseListItem[]>(KEYS.exercises, []),
    saveExercises: (items: ExerciseListItem[]) => write(KEYS.exercises, items),

    loadPlans: () => read<Plan[]>(KEYS.plans, []),
    savePlans: (items: Plan[]) => write(KEYS.plans, items),

    /** Zuletzt trainierter Plantag, Grundlage der Rotation (Push -> Pull -> Lower). */
    getLastPlanDayId: () => read<string | null>(KEYS.lastPlanDay, null),
    setLastPlanDayId: (id: string) => write(KEYS.lastPlanDay, id),
  };
}

export type Store = ReturnType<typeof createStore>;

export function browserStore(): Store {
  let storage: KeyValueStorage | null = null;
  try {
    storage = typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    storage = null;
  }
  return createStore(storage);
}
