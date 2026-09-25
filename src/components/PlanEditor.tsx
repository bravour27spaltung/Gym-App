import { useState } from 'react';
import { formatClock } from '../lib/timer';
import {
  addDay,
  addPlanExercise,
  moveDay,
  movePlanExercise,
  removeDay,
  removePlanExercise,
  renameDay,
  setPlanName,
  updatePlanExercise,
  validatePlan,
  visibleDays,
  visibleExercises,
  type Plan,
} from '../lib/plan';
import type { ExerciseListItem } from '../lib/storage';
import { AddExercise } from './AddExercise';

interface Props {
  initial: Plan;
  exercises: ExerciseListItem[];
  /** Gibt eine Fehlermeldung zurück oder null bei Erfolg. */
  onSave: (plan: Plan) => Promise<string | null>;
  onCancel: () => void;
}

const REST_OPTIONS = [60, 90, 120, 150, 180, 240, 300];
const RIR_OPTIONS = [0, 1, 2, 3, 4, 5];

function NumField(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <label className="numfield">
      {props.label}
      <input
        className="num small"
        type="number"
        inputMode="numeric"
        min={props.min}
        max={props.max}
        value={Number.isFinite(props.value) ? props.value : ''}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => props.onChange(parseInt(e.target.value, 10))}
      />
    </label>
  );
}

export function PlanEditor({ initial, exercises, onSave, onCancel }: Props) {
  const [plan, setPlan] = useState<Plan>(initial);
  const [pickForDay, setPickForDay] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const days = visibleDays(plan);

  async function save() {
    const problems = validatePlan(plan);
    setErrors(problems);
    if (problems.length > 0) return;
    setSaving(true);
    const err = await onSave(plan);
    setSaving(false);
    if (err) setErrors([err]);
  }

  return (
    <div className="screen">
      <header className="top">
        <h1>{initial.isNew ? 'Neuer Plan' : 'Plan bearbeiten'}</h1>
      </header>

      <label>
        Name des Plans
        <input
          className="text"
          type="text"
          placeholder="z. B. Push / Pull / Lower"
          value={plan.name}
          onChange={(e) => setPlan((p) => setPlanName(p, e.target.value))}
        />
      </label>

      {days.map((day, di) => {
        const exs = visibleExercises(day);
        return (
          <section className="card" key={day.id}>
            <header className="card-head">
              <h2>Tag {di + 1}</h2>
              <div className="row">
                <button
                  type="button"
                  className="step"
                  aria-label={`Tag ${di + 1} nach oben`}
                  disabled={di === 0}
                  onClick={() => setPlan((p) => moveDay(p, day.id, -1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="step"
                  aria-label={`Tag ${di + 1} nach unten`}
                  disabled={di === days.length - 1}
                  onClick={() => setPlan((p) => moveDay(p, day.id, 1))}
                >
                  ↓
                </button>
              </div>
            </header>

            <input
              className="text"
              type="text"
              placeholder="Name, z. B. Push"
              aria-label={`Name von Tag ${di + 1}`}
              value={day.name}
              onChange={(e) => setPlan((p) => renameDay(p, day.id, e.target.value))}
            />

            <ul className="plan-exercises">
              {exs.map((ex, ei) => (
                <li className="plan-ex" key={ex.id}>
                  <div className="card-head">
                    <strong>{ex.name}</strong>
                    <div className="row">
                      <button
                        type="button"
                        className="step"
                        aria-label={`${ex.name} nach oben`}
                        disabled={ei === 0}
                        onClick={() => setPlan((p) => movePlanExercise(p, day.id, ex.id, -1))}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="step"
                        aria-label={`${ex.name} nach unten`}
                        disabled={ei === exs.length - 1}
                        onClick={() => setPlan((p) => movePlanExercise(p, day.id, ex.id, 1))}
                      >
                        ↓
                      </button>
                    </div>
                  </div>

                  <div className="row wrap">
                    <NumField
                      label="Sätze"
                      value={ex.sets}
                      min={1}
                      max={10}
                      onChange={(n) => setPlan((p) => updatePlanExercise(p, day.id, ex.id, { sets: n }))}
                    />
                    <NumField
                      label="Wdh. von"
                      value={ex.repMin}
                      min={1}
                      max={100}
                      onChange={(n) => setPlan((p) => updatePlanExercise(p, day.id, ex.id, { repMin: n }))}
                    />
                    <NumField
                      label="bis"
                      value={ex.repMax}
                      min={1}
                      max={100}
                      onChange={(n) => setPlan((p) => updatePlanExercise(p, day.id, ex.id, { repMax: n }))}
                    />
                  </div>

                  <div className="row wrap">
                    <label>
                      Ziel-RIR
                      <select
                        value={ex.targetRir === null ? '' : String(ex.targetRir)}
                        onChange={(e) =>
                          setPlan((p) =>
                            updatePlanExercise(p, day.id, ex.id, {
                              targetRir: e.target.value === '' ? null : parseInt(e.target.value, 10),
                            }),
                          )
                        }
                      >
                        <option value="">keine</option>
                        {RIR_OPTIONS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Pause
                      <select
                        value={ex.restSeconds}
                        onChange={(e) =>
                          setPlan((p) =>
                            updatePlanExercise(p, day.id, ex.id, {
                              restSeconds: parseInt(e.target.value, 10),
                            }),
                          )
                        }
                      >
                        {[...new Set([...REST_OPTIONS, ex.restSeconds])]
                          .sort((a, b) => a - b)
                          .map((s) => (
                            <option key={s} value={s}>
                              {formatClock(s)} min
                            </option>
                          ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="link"
                      onClick={() => setPlan((p) => removePlanExercise(p, day.id, ex.id))}
                    >
                      Übung entfernen
                    </button>
                  </div>
                </li>
              ))}
              {exs.length === 0 && <li className="muted">Noch keine Übung an diesem Tag.</li>}
            </ul>

            <div className="row wrap">
              <button type="button" className="btn" onClick={() => setPickForDay(day.id)}>
                + Übung hinzufügen
              </button>
              <button
                type="button"
                className="link"
                onClick={() => setPlan((p) => removeDay(p, day.id))}
              >
                Tag entfernen
              </button>
            </div>
          </section>
        );
      })}

      <button type="button" className="btn" onClick={() => setPlan((p) => addDay(p, ''))}>
        + Trainingstag hinzufügen
      </button>

      {errors.length > 0 && (
        <ul className="error" role="alert">
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      <div className="finish">
        <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
          {saving ? 'Speichere …' : 'Plan speichern'}
        </button>
        <button type="button" className="btn" disabled={saving} onClick={onCancel}>
          Abbrechen
        </button>
      </div>

      {pickForDay !== null && (
        <AddExercise
          exercises={exercises}
          onClose={() => setPickForDay(null)}
          onPick={(input) => {
            const dayId = pickForDay;
            setPickForDay(null);
            setPlan((p) =>
              addPlanExercise(p, dayId, {
                exerciseId: input.exerciseId,
                name: input.name,
                isNew: input.isNew,
                incrementKg: input.incrementKg,
                equipmentKg: input.equipmentKg,
                sets: input.plannedSets,
                repMin: input.repMin,
                repMax: input.repMax,
              }),
            );
          }}
        />
      )}
    </div>
  );
}
