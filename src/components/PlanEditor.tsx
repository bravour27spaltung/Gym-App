import { useMemo, useState } from 'react';
import { muscleLabel } from '../lib/muscles';
import {
  addDay,
  addDayFromTemplate,
  addPlanExercise,
  moveDay,
  movePlanExercise,
  removeDay,
  removePlanExercise,
  renameDay,
  setPlanName,
  templateDay,
  updatePlanExercise,
  validatePlan,
  visibleDays,
  visibleExercises,
  type Plan,
  type PlanDay,
} from '../lib/plan';
import { lastWorkingSetCount, lastWorkingWeightKg } from '../lib/progression';
import type { ExerciseListItem, LastInfo } from '../lib/storage';
import type { ExerciseInput } from '../lib/workout';
import { DayEditor } from './DayEditor';
import { AppBar, Icon, IconButton } from './ui';

interface Props {
  initial: Plan;
  exercises: ExerciseListItem[];
  /** Gespeicherte Vorlagen, aus denen sich Tage in einen Plan kopieren lassen. */
  templates: Plan[];
  /** Gibt eine Fehlermeldung zurück oder null bei Erfolg. */
  onSave: (plan: Plan) => Promise<string | null>;
  onCancel: () => void;
  /** Lädt, was du beim letzten Training einer Übung gemacht hast (Gewicht, Sätze, Stange). */
  loadLast: (exerciseId: string, isNew: boolean) => Promise<LastInfo>;
}

/** Übersicht der Hauptmuskeln eines Tags, z. B. "Brust, Schultern, Trizeps". */
export function musclesOfDay(day: PlanDay, catalog: ExerciseListItem[]): string {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const counts = new Map<string, number>();
  for (const e of visibleExercises(day)) {
    const list = e.newExercise?.primaryMuscles ?? byId.get(e.exerciseId)?.primaryMuscles ?? [];
    for (const m of list) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([m]) => muscleLabel(m))
    .join(', ');
}

export function PlanEditor({ initial, exercises, templates, onSave, onCancel, loadLast }: Props) {
  const [plan, setPlan] = useState<Plan>(initial);
  const [editingDayId, setEditingDayId] = useState<string | null>(null);
  const [pickTemplate, setPickTemplate] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const isTemplate = plan.kind === 'template';
  const days = visibleDays(plan);
  const dirty = useMemo(() => JSON.stringify(plan) !== JSON.stringify(initial), [plan, initial]);

  function leave() {
    if (dirty) setConfirmLeave(true);
    else onCancel();
  }

  async function save() {
    const problems = validatePlan(plan);
    setErrors(problems);
    if (problems.length > 0) return;
    setSaving(true);
    const err = await onSave(plan);
    setSaving(false);
    if (err) setErrors([err]);
  }

  /**
   * Fügt Übungen hinzu und übernimmt dabei, was du beim letzten Mal gemacht hast:
   * Arbeitsgewicht, Anzahl der Arbeitssätze und Stangen-/Maschinengewicht.
   * Ohne bisheriges Training bleiben die Standardwerte.
   */
  async function addToDay(dayId: string, inputs: ExerciseInput[]) {
    const lasts = await Promise.all(
      inputs.map((i) => (i.isNew ? Promise.resolve(null) : loadLast(i.exerciseId, false))),
    );
    setPlan((p) =>
      inputs.reduce((acc, input, idx) => {
        const last = lasts[idx];
        const count = last ? lastWorkingSetCount(last.sets) : 0;
        return addPlanExercise(acc, dayId, {
          exerciseId: input.exerciseId,
          name: input.name,
          isNew: input.isNew,
          equipment: input.equipment,
          primaryMuscles: input.primaryMuscles,
          secondaryMuscles: input.secondaryMuscles,
          sets: count > 0 ? Math.min(10, count) : input.plannedSets,
          repMin: input.repMin,
          repMax: input.repMax,
          weightKg: last ? lastWorkingWeightKg(last.sets) : null,
          equipmentKg: last ? last.equipmentKg : null,
        });
      }, p),
    );
  }

  function renderDay(day: PlanDay) {
    return (
      <DayEditor
        exercises={visibleExercises(day)}
        catalog={exercises}
        onUpdate={(exId, patch) => setPlan((p) => updatePlanExercise(p, day.id, exId, patch))}
        onMove={(exId, dir) => setPlan((p) => movePlanExercise(p, day.id, exId, dir))}
        onRemove={(exId) => setPlan((p) => removePlanExercise(p, day.id, exId))}
        onAdd={(inputs) => void addToDay(day.id, inputs)}
        loadLast={loadLast}
      />
    );
  }

  const errorBox =
    errors.length > 0 ? (
      <ul className="errorbox" role="alert">
        {errors.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    ) : null;

  const leaveBox = confirmLeave ? (
    <div className="banner" role="alertdialog" aria-label="Änderungen verwerfen">
      <p>Nicht gespeicherte Änderungen gehen verloren.</p>
      <div className="row">
        <button type="button" className="btn danger compact" onClick={onCancel}>
          Verwerfen
        </button>
        <button type="button" className="btn compact" onClick={() => setConfirmLeave(false)}>
          Weiter bearbeiten
        </button>
      </div>
    </div>
  ) : null;

  const saveAction = {
    label: saving ? 'Speichere …' : 'Speichern',
    onClick: () => void save(),
    disabled: saving,
  };

  // ---- Vorlage: ein Bildschirm ------------------------------------------------
  if (isTemplate) {
    const day = templateDay(plan);
    return (
      <div className="editor">
        <AppBar
          title={initial.isNew ? 'Neue Vorlage' : 'Vorlage'}
          backIcon="x"
          backLabel="Schließen"
          onBack={leave}
          action={saveAction}
        />
        <div className="screen">
          {leaveBox}
          <input
            className="title-input"
            type="text"
            placeholder="Name, z. B. Oberkörper A"
            aria-label="Name der Vorlage"
            value={plan.name}
            onChange={(e) => setPlan((p) => setPlanName(p, e.target.value))}
          />
          {day && renderDay(day)}
          {errorBox}
        </div>
      </div>
    );
  }

  // ---- Plan: Tag bearbeiten ---------------------------------------------------
  const editingDay = days.find((d) => d.id === editingDayId) ?? null;
  if (editingDay) {
    const idx = days.findIndex((d) => d.id === editingDay.id);
    return (
      <div className="editor">
        <AppBar
          title={editingDay.name.trim() || `Tag ${idx + 1}`}
          backLabel="Zurück zum Plan"
          onBack={() => setEditingDayId(null)}
          action={{ label: 'Fertig', onClick: () => setEditingDayId(null) }}
        />
        <div className="screen">
          <input
            className="title-input"
            type="text"
            placeholder="Name des Tages, z. B. Push"
            aria-label={`Name von Tag ${idx + 1}`}
            value={editingDay.name}
            onChange={(e) => setPlan((p) => renameDay(p, editingDay.id, e.target.value))}
          />
          {renderDay(editingDay)}
        </div>
      </div>
    );
  }

  // ---- Plan: Übersicht --------------------------------------------------------
  return (
    <div className="editor">
      <AppBar
        title={initial.isNew ? 'Neuer Plan' : 'Plan'}
        backIcon="x"
        backLabel="Schließen"
        onBack={leave}
        action={saveAction}
      />
      <div className="screen">
        {leaveBox}
        <input
          className="title-input"
          type="text"
          placeholder="Name, z. B. Push / Pull / Legs"
          aria-label="Name des Plans"
          value={plan.name}
          onChange={(e) => setPlan((p) => setPlanName(p, e.target.value))}
        />

        <h2 className="section-title">Trainingstage</h2>
        <p className="muted">
          Nach jedem Training schlägt die App den nächsten Tag der Reihe nach vor.
        </p>

        {days.length === 0 && (
          <div className="empty-state">
            <Icon name="list" size={32} />
            <p>Noch kein Trainingstag.</p>
          </div>
        )}

        <ol className="daycards">
          {days.map((day, i) => {
            const n = visibleExercises(day).length;
            const muscles = musclesOfDay(day, exercises);
            const label = day.name.trim() || `Tag ${i + 1}`;
            return (
              <li key={day.id} className="daycard">
                <button
                  type="button"
                  className="daycard-main"
                  onClick={() => setEditingDayId(day.id)}
                  aria-label={`${label} bearbeiten`}
                >
                  <span className="index">{i + 1}</span>
                  <span className="daycard-title">
                    <strong>{label}</strong>
                    <small>
                      {n === 0 ? 'Noch keine Übung' : `${n} ${n === 1 ? 'Übung' : 'Übungen'}`}
                      {muscles && ` · ${muscles}`}
                    </small>
                  </span>
                  <Icon name="forward" size={20} />
                </button>
                <div className="daycard-actions">
                  <IconButton
                    icon="arrow-up"
                    label={`${label} nach oben`}
                    disabled={i === 0}
                    onClick={() => setPlan((p) => moveDay(p, day.id, -1))}
                    size={18}
                  />
                  <IconButton
                    icon="arrow-down"
                    label={`${label} nach unten`}
                    disabled={i === days.length - 1}
                    onClick={() => setPlan((p) => moveDay(p, day.id, 1))}
                    size={18}
                  />
                  <IconButton
                    icon="trash"
                    tone="danger"
                    label={`${label} entfernen`}
                    onClick={() => setPlan((p) => removeDay(p, day.id))}
                    size={18}
                  />
                </div>
              </li>
            );
          })}
        </ol>

        <div className="addrow">
          <button
            type="button"
            className="addtile"
            onClick={() => {
              const next = addDay(plan, '');
              setPlan(next);
              setEditingDayId(next.days[next.days.length - 1].id);
            }}
          >
            <Icon name="plus" size={20} /> Neuer Tag
          </button>
          {templates.length > 0 && (
            <button type="button" className="addtile" onClick={() => setPickTemplate(true)}>
              <Icon name="copy" size={20} /> Aus Vorlage
            </button>
          )}
        </div>

        {errorBox}
      </div>

      {pickTemplate && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Vorlage übernehmen">
          <header className="sheet-head">
            <IconButton icon="x" label="Schließen" onClick={() => setPickTemplate(false)} />
            <h2>Vorlage übernehmen</h2>
            <span className="appbar-spacer" />
          </header>
          <div className="sheet-scroll">
            <p className="muted pad">
              Die Vorlage wird als neuer Tag kopiert. Spätere Änderungen an der Vorlage wirken sich
              nicht auf den Plan aus.
            </p>
            <ul className="tiles">
              {templates.map((t) => {
                const d = templateDay(t);
                const n = d ? visibleExercises(d).length : 0;
                const muscles = d ? musclesOfDay(d, exercises) : '';
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      className="tile"
                      onClick={() => {
                        setPlan((p) => addDayFromTemplate(p, t));
                        setPickTemplate(false);
                      }}
                    >
                      <span className="tile-title">
                        <strong>{t.name}</strong>
                        <small>
                          {n} {n === 1 ? 'Übung' : 'Übungen'}
                          {muscles && ` · ${muscles}`}
                        </small>
                      </span>
                      <Icon name="plus" size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
