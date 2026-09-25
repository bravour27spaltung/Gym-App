import { useEffect, useState } from 'react';
import { muscleLabel } from '../lib/muscles';
import { summarizePlanExercise, type PlanExercise, type updatePlanExercise } from '../lib/plan';
import type { ExerciseListItem, LastInfo } from '../lib/storage';
import { formatClock } from '../lib/timer';
import { describeLastSets, type ExerciseInput } from '../lib/workout';
import { lastWorkingWeightKg } from '../lib/progression';
import { formatKg } from '../lib/weight';
import { AddExercise } from './AddExercise';
import { EquipmentField, Icon, IconButton, NumberInput, Stepper, Switch } from './ui';

type Patch = Parameters<typeof updatePlanExercise>[3];

interface Props {
  exercises: PlanExercise[];
  catalog: ExerciseListItem[];
  onUpdate: (exId: string, patch: Patch) => void;
  onMove: (exId: string, dir: -1 | 1) => void;
  onRemove: (exId: string) => void;
  onAdd: (inputs: ExerciseInput[]) => void;
  /** Lädt, was du beim letzten Training dieser Übung gemacht hast. */
  loadLast: (exerciseId: string, isNew: boolean) => Promise<LastInfo>;
}

const REST_OPTIONS = [60, 90, 120, 180, 240];

/**
 * Übungen eines Trainingstags bzw. einer Vorlage: Karten mit Kurzfassung, die sich
 * zum Bearbeiten aufklappen (Sätze, Wiederholungsbereich, Ziel-RIR, Pause,
 * Aufwärmen, Notiz).
 */
export function DayEditor({ exercises, catalog, onUpdate, onMove, onRemove, onAdd, loadLast }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Letztes Training je Übung, geladen beim Aufklappen einer Karte.
  const [lastById, setLastById] = useState<Record<string, LastInfo>>({});

  useEffect(() => {
    const open = exercises.find((x) => x.id === openId);
    if (!open || lastById[open.exerciseId]) return;
    let cancelled = false;
    void loadLast(open.exerciseId, open.newExercise !== null).then((info) => {
      if (!cancelled) setLastById((cur) => ({ ...cur, [open.exerciseId]: info }));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, exercises]);

  const byId = new Map(catalog.map((c) => [c.id, c]));
  const musclesOf = (e: PlanExercise): string[] =>
    e.newExercise?.primaryMuscles ?? byId.get(e.exerciseId)?.primaryMuscles ?? [];

  return (
    <div className="dayeditor">
      {exercises.length === 0 && (
        <div className="empty-state">
          <Icon name="dumbbell" size={32} />
          <p>Noch keine Übungen.</p>
          <p className="muted">Füge Übungen hinzu und stelle dann Sätze und Wiederholungen ein.</p>
        </div>
      )}

      <ol className="exercards">
        {exercises.map((e, i) => {
          const open = openId === e.id;
          const muscles = musclesOf(e).slice(0, 2).map(muscleLabel).join(', ');
          const restChoices = [...new Set([...REST_OPTIONS, e.restSeconds])].sort((a, b) => a - b);
          return (
            <li key={e.id} className={open ? 'exercard open' : 'exercard'}>
              <button
                type="button"
                className="exercard-head"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : e.id)}
              >
                <span className="index">{i + 1}</span>
                <span className="exercard-title">
                  <strong>{e.name}</strong>
                  {muscles && <small>{muscles}</small>}
                </span>
                <Icon name={open ? 'up' : 'down'} size={20} />
              </button>

              <p className="exercard-sum">
                {summarizePlanExercise(e)}
                {e.note.trim() !== '' && (
                  <span className="has-note" title={e.note}>
                    <Icon name="note" size={14} /> Notiz
                  </span>
                )}
              </p>

              {open && (
                <div className="exercard-edit">
                  <div className="field stack">
                    <span>Gewicht (Arbeitsgewicht)</span>
                    <div className="weightline">
                      <NumberInput
                        kind="kg"
                        blankZero
                        placeholder="0"
                        label={`${e.name}: Gewicht in kg`}
                        value={e.weightKg ?? 0}
                        onCommit={(kg) => onUpdate(e.id, { weightKg: kg > 0 ? kg : null })}
                      />
                      <span className="unit">kg</span>
                      {(() => {
                        const last = lastById[e.exerciseId];
                        const w = last ? lastWorkingWeightKg(last.sets) : null;
                        if (w === null || !last) return null;
                        if (e.weightKg === w && e.equipmentKg === last.equipmentKg) return null;
                        return (
                          <button
                            type="button"
                            className="btn compact"
                            onClick={() => onUpdate(e.id, { weightKg: w, equipmentKg: last.equipmentKg })}
                          >
                            Letztes Mal: {formatKg(w)} übernehmen
                          </button>
                        );
                      })()}
                    </div>
                    {(() => {
                      const last = lastById[e.exerciseId];
                      if (!last) return null;
                      const text = describeLastSets(last.sets);
                      return (
                        <p className="lasttime">
                          <span>Letztes Mal</span>
                          {text
                            ? `${text}${last.equipmentKg ? ` · Stange ${formatKg(last.equipmentKg)}` : ''}`
                            : 'noch kein Training mit dieser Übung'}
                        </p>
                      );
                    })()}
                  </div>

                  <div className="field stack">
                    <EquipmentField
                      name={e.name}
                      value={e.equipmentKg}
                      onChange={(kg) => onUpdate(e.id, { equipmentKg: kg })}
                    />
                  </div>

                  <div className="field">
                    <span>Sätze</span>
                    <Stepper
                      label={`${e.name}: Sätze`}
                      value={e.sets}
                      min={1}
                      max={10}
                      onChange={(n) => onUpdate(e.id, { sets: n })}
                    />
                  </div>

                  <div className="field stack">
                    <span>Wiederholungen (Bereich für die Steigerung)</span>
                    <div className="range">
                      <Stepper
                        label={`${e.name}: untere Grenze`}
                        value={e.repMin}
                        min={1}
                        max={100}
                        onChange={(n) =>
                          onUpdate(
                            e.id,
                            Number.isFinite(n)
                              ? { repMin: n, repMax: Math.max(e.repMax, n) }
                              : { repMin: n },
                          )
                        }
                      />
                      <span className="dash">–</span>
                      <Stepper
                        label={`${e.name}: obere Grenze`}
                        value={e.repMax}
                        min={1}
                        max={100}
                        onChange={(n) =>
                          onUpdate(
                            e.id,
                            Number.isFinite(n)
                              ? { repMax: n, repMin: Math.min(e.repMin, n) }
                              : { repMax: n },
                          )
                        }
                      />
                    </div>
                  </div>

                  <div className="field stack">
                    <span>Pause</span>
                    <div className="chips" role="radiogroup" aria-label={`${e.name}: Pause`}>
                      {restChoices.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          role="radio"
                          aria-checked={e.restSeconds === sec}
                          className={e.restSeconds === sec ? 'chip on' : 'chip'}
                          onClick={() => onUpdate(e.id, { restSeconds: sec })}
                        >
                          {formatClock(sec)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="field">
                    <span>
                      Aufwärmsätze vorschlagen
                      <small>Die App plant vor den Arbeitssätzen eine Rampe ein.</small>
                    </span>
                    <Switch
                      label={`${e.name}: Aufwärmsätze`}
                      checked={e.warmup}
                      onChange={(on) => onUpdate(e.id, { warmup: on })}
                    />
                  </div>

                  <label className="field stack">
                    <span>Notiz</span>
                    <input
                      className="input"
                      type="text"
                      placeholder="z. B. Sitz auf Stufe 4, Rückenlehne 2"
                      value={e.note}
                      onChange={(ev) => onUpdate(e.id, { note: ev.target.value })}
                    />
                  </label>

                  <div className="exercard-actions">
                    <IconButton
                      icon="arrow-up"
                      label={`${e.name} nach oben`}
                      disabled={i === 0}
                      onClick={() => onMove(e.id, -1)}
                    />
                    <IconButton
                      icon="arrow-down"
                      label={`${e.name} nach unten`}
                      disabled={i === exercises.length - 1}
                      onClick={() => onMove(e.id, 1)}
                    />
                    <span className="grow" />
                    <button
                      type="button"
                      className="textbtn danger"
                      onClick={() => {
                        setOpenId(null);
                        onRemove(e.id);
                      }}
                    >
                      <Icon name="trash" size={18} /> Entfernen
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <button type="button" className="addtile" onClick={() => setAdding(true)}>
        <Icon name="plus" size={20} /> Übungen hinzufügen
      </button>

      {adding && (
        <AddExercise
          exercises={catalog}
          onClose={() => setAdding(false)}
          onPickMany={(inputs) => {
            setAdding(false);
            onAdd(inputs);
          }}
        />
      )}
    </div>
  );
}
