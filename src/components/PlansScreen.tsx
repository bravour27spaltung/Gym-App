import { useState } from 'react';
import { newPlan, visibleDays, visibleExercises, type Plan } from '../lib/plan';
import type { ExerciseListItem } from '../lib/storage';
import { PlanEditor } from './PlanEditor';

interface Props {
  plans: Plan[];
  exercises: ExerciseListItem[];
  /** Gibt eine Fehlermeldung zurück oder null bei Erfolg. */
  onSave: (plan: Plan) => Promise<string | null>;
  onArchive: (planId: string) => Promise<string | null>;
  onBack: () => void;
}

export function PlansScreen({ plans, exercises, onSave, onArchive, onBack }: Props) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (editing) {
    return (
      <PlanEditor
        initial={editing}
        exercises={exercises}
        onCancel={() => setEditing(null)}
        onSave={async (plan) => {
          const err = await onSave(plan);
          if (!err) setEditing(null);
          return err;
        }}
      />
    );
  }

  return (
    <div className="screen">
      <header className="top">
        <h1>Trainingspläne</h1>
      </header>

      {message && (
        <p className="error" role="alert">
          {message}
        </p>
      )}

      {plans.length === 0 && <p className="muted">Noch kein Plan angelegt.</p>}

      {plans.map((plan) => (
        <section className="card" key={plan.id}>
          <h2>{plan.name}</h2>
          <ul className="plan-summary">
            {visibleDays(plan).map((d) => (
              <li key={d.id}>
                <strong>{d.name}</strong>
                <span className="muted">
                  {' '}
                  · {visibleExercises(d).length} Übungen
                </span>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setMessage(null);
                setEditing(plan);
              }}
            >
              Bearbeiten
            </button>
            {confirmArchive === plan.id ? (
              <>
                <button
                  type="button"
                  className="btn danger"
                  onClick={async () => {
                    setConfirmArchive(null);
                    setMessage(await onArchive(plan.id));
                  }}
                >
                  Wirklich archivieren
                </button>
                <button type="button" className="link" onClick={() => setConfirmArchive(null)}>
                  Abbrechen
                </button>
              </>
            ) : (
              <button type="button" className="link" onClick={() => setConfirmArchive(plan.id)}>
                Archivieren
              </button>
            )}
          </div>
          {confirmArchive === plan.id && (
            <p className="muted">Vergangene Trainings bleiben erhalten.</p>
          )}
        </section>
      ))}

      <button
        type="button"
        className="btn primary"
        onClick={() => {
          setMessage(null);
          setEditing(newPlan());
        }}
      >
        + Neuer Plan
      </button>
      <button type="button" className="btn" onClick={onBack}>
        Zurück
      </button>
    </div>
  );
}
