import { useMemo, useRef, useState } from 'react';
import {
  buildStretchPlanPayload,
  movePlanItem,
  newExerciseRow,
  newPlanItem,
  removePlanItem,
  setPlanItemMode,
  sideLabel,
  updatePlanItem,
  type NewStretchExerciseRow,
  type StretchAmount,
  type StretchExerciseInput,
  type StretchPlan,
  type StretchPlanItem,
  type StretchPlanPayload,
  type StretchSide,
} from '../lib/stretch';
import type { StretchExerciseListItem } from '../lib/storage';
import { newId } from '../lib/workout';
import { AddStretchExercise } from './AddStretchExercise';
import { Icon, IconButton, Stepper } from './ui';

interface Props {
  /** Bestehende Vorlage bearbeiten; null = neue Vorlage anlegen. */
  plan: StretchPlan | null;
  exercises: StretchExerciseListItem[];
  /** Speichert die Vorlage; gibt eine Fehlermeldung zurück oder null bei Erfolg. */
  onSave: (payload: StretchPlanPayload) => Promise<string | null>;
  onClose: () => void;
}

const SIDES: StretchSide[] = ['beidseitig', 'links', 'rechts', 'mittig'];

/** Eine Menge gilt nur mit einer ganzen Zahl > 0 (Zeit oder Wiederholungen) und mindestens einem Satz. */
function itemValid(it: StretchPlanItem): boolean {
  const amount = it.reps != null ? it.reps : it.holdSeconds;
  return amount != null && Number.isFinite(amount) && amount > 0 && Number.isFinite(it.sets) && it.sets > 0;
}

/**
 * Dehnprogramm (Vorlage) anlegen oder bearbeiten: Name, Reihenfolge der Übungen, je Übung
 * Seite (beide nacheinander / links / rechts / ohne Seite), Haltezeit (Timer) oder
 * Wiederholungen (kein Timer) und Sätze.
 */
export function StretchPlanEditor({ plan, exercises, onSave, onClose }: Props) {
  const planId = useRef(plan?.id ?? newId());
  const [name, setName] = useState(plan?.name ?? '');
  const [items, setItems] = useState<StretchPlanItem[]>(plan?.items ?? []);
  // Im Editor neu angelegte eigene Übungen; werden erst beim Speichern in der Datenbank angelegt.
  const [created, setCreated] = useState<NewStretchExerciseRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allExercises = useMemo<StretchExerciseListItem[]>(
    () => [
      ...exercises,
      ...created.map((c) => ({
        id: c.id,
        name: c.name_de,
        muscles: c.muscles,
        defaultHoldSeconds: c.default_hold_seconds,
        defaultReps: c.default_reps ?? null,
      })),
    ],
    [exercises, created],
  );
  const nameOf = (id: string) => allExercises.find((x) => x.id === id)?.name ?? 'Unbekannte Übung';

  function handlePick(input: StretchExerciseInput, amount: StretchAmount) {
    setAdding(false);
    if (input.isNew) {
      setCreated((c) => [...c, newExerciseRow(input.stretchExerciseId, input.name, input.muscles ?? [], amount)]);
    }
    setItems((list) => [...list, newPlanItem(input.stretchExerciseId, amount)]);
  }

  const update = (id: string, patch: Partial<Omit<StretchPlanItem, 'id' | 'stretchExerciseId'>>) =>
    setItems((list) => updatePlanItem(list, id, patch));

  async function save() {
    if (name.trim() === '') return setError('Bitte einen Namen eingeben.');
    if (items.length === 0) return setError('Füge mindestens eine Übung hinzu.');
    if (!items.every(itemValid)) return setError('Bitte bei jeder Übung Zeit bzw. Wiederholungen und Sätze ausfüllen.');
    const payload = buildStretchPlanPayload({ id: planId.current, name, items }, created);
    if (!payload) return;
    setError(null);
    setSaving(true);
    const err = await onSave(payload);
    setSaving(false);
    if (err) setError(err);
    else onClose();
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label={plan ? 'Vorlage bearbeiten' : 'Neue Vorlage'}>
      <header className="sheet-head">
        <IconButton icon="x" label="Schließen ohne Speichern" onClick={onClose} disabled={saving} />
        <h2>{plan ? 'Vorlage bearbeiten' : 'Neue Vorlage'}</h2>
        <button type="button" className="btn primary compact" disabled={saving} onClick={() => void save()}>
          {saving ? 'Speichere …' : 'Speichern'}
        </button>
      </header>

      <div className="sheet-scroll">
        <label className="notefield">
          Name
          <input
            className="input"
            type="text"
            value={name}
            maxLength={60}
            placeholder="z. B. Nach dem Beintraining"
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {items.length === 0 && <p className="empty">Noch keine Übung in dieser Vorlage.</p>}

        <ul className="exlist">
          {items.map((it, i) => {
            const reps = it.reps != null;
            return (
              <li key={it.id} className="card plan-item">
                <div className="plan-item-head">
                  <strong>
                    {i + 1}. {nameOf(it.stretchExerciseId)}
                  </strong>
                  <IconButton
                    icon="arrow-up"
                    label={`${nameOf(it.stretchExerciseId)} nach oben`}
                    disabled={i === 0}
                    onClick={() => setItems((l) => movePlanItem(l, it.id, -1))}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={`${nameOf(it.stretchExerciseId)} nach unten`}
                    disabled={i === items.length - 1}
                    onClick={() => setItems((l) => movePlanItem(l, it.id, 1))}
                  />
                  <IconButton
                    icon="trash"
                    label={`${nameOf(it.stretchExerciseId)} entfernen`}
                    tone="danger"
                    onClick={() => setItems((l) => removePlanItem(l, it.id))}
                  />
                </div>

                <div className="chips" role="group" aria-label="Seite">
                  {SIDES.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={it.side === s ? 'chip on' : 'chip'}
                      aria-pressed={it.side === s}
                      onClick={() => update(it.id, { side: s })}
                    >
                      {sideLabel(s)}
                    </button>
                  ))}
                </div>
                {it.side === 'beidseitig' && (
                  <p className="muted pick-hint">Jede Seite bekommt einen eigenen Durchgang.</p>
                )}

                <div className="chips" role="group" aria-label="Art der Übung">
                  <button
                    type="button"
                    className={!reps ? 'chip on' : 'chip'}
                    aria-pressed={!reps}
                    onClick={() => reps && setItems((l) => setPlanItemMode(l, it.id, 'hold'))}
                  >
                    Haltezeit
                  </button>
                  <button
                    type="button"
                    className={reps ? 'chip on' : 'chip'}
                    aria-pressed={reps}
                    onClick={() => !reps && setItems((l) => setPlanItemMode(l, it.id, 'reps'))}
                  >
                    Wiederholungen
                  </button>
                </div>

                <div className="pick-config">
                  {reps ? (
                    <>
                      <Stepper
                        label="Wiederholungen"
                        value={it.reps ?? 0}
                        min={1}
                        max={50}
                        onChange={(n) => update(it.id, { reps: n })}
                      />
                      <span>Wdh.</span>
                    </>
                  ) : (
                    <>
                      <Stepper
                        label="Haltezeit in Sekunden"
                        value={it.holdSeconds ?? 0}
                        min={5}
                        max={300}
                        onChange={(n) => update(it.id, { holdSeconds: n })}
                      />
                      <span>s</span>
                    </>
                  )}
                  <Stepper label="Sätze" value={it.sets} min={1} max={10} onChange={(n) => update(it.id, { sets: n })} />
                  <span>{it.sets === 1 ? 'Satz' : 'Sätze'}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <button type="button" className="addtile" onClick={() => setAdding(true)}>
          <Icon name="plus" size={20} /> Übung hinzufügen
        </button>
      </div>

      {adding && <AddStretchExercise exercises={allExercises} onPick={handlePick} onClose={() => setAdding(false)} />}
    </div>
  );
}
