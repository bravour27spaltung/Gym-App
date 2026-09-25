import { useEffect, useState } from 'react';
import {
  newPlan,
  newTemplate,
  templateDay,
  visibleDays,
  visibleExercises,
  type Plan,
} from '../lib/plan';
import type { ExerciseListItem, LastInfo } from '../lib/storage';
import { PlanEditor, musclesOfDay } from './PlanEditor';
import { Icon, IconButton } from './ui';

interface Props {
  plans: Plan[];
  exercises: ExerciseListItem[];
  /** Gibt eine Fehlermeldung zurück oder null bei Erfolg. */
  onSave: (plan: Plan) => Promise<string | null>;
  onArchive: (planId: string) => Promise<string | null>;
  /** Startet ein Training aus einem Tag (bei Vorlagen: dem einzigen Tag). */
  onStart: (plan: Plan, dayId: string) => void;
  /** Meldet, ob gerade ein Editor offen ist (dann blendet die App die untere Leiste aus). */
  onEditingChange: (open: boolean) => void;
  loadLast: (exerciseId: string, isNew: boolean) => Promise<LastInfo>;
}

export function PlansScreen({
  plans,
  exercises,
  onSave,
  onArchive,
  onStart,
  onEditingChange,
  loadLast,
}: Props) {
  const [editing, setEditing] = useState<Plan | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    onEditingChange(editing !== null);
    return () => onEditingChange(false);
  }, [editing, onEditingChange]);

  const templates = plans.filter((p) => p.kind === 'template');
  const fullPlans = plans.filter((p) => p.kind === 'plan');

  if (editing) {
    return (
      <PlanEditor
        // Beim Wechsel zwischen Plänen den Zustand des Editors neu aufbauen.
        key={editing.id}
        initial={editing}
        exercises={exercises}
        templates={templates}
        loadLast={loadLast}
        onCancel={() => setEditing(null)}
        onSave={async (plan) => {
          const err = await onSave(plan);
          if (!err) setEditing(null);
          return err;
        }}
      />
    );
  }

  function create(kind: 'plan' | 'template') {
    setMessage(null);
    setMenuOpen(false);
    setEditing(kind === 'template' ? newTemplate() : newPlan());
  }

  function archiveRow(plan: Plan) {
    if (confirmArchive !== plan.id) return null;
    return (
      <div className="banner" role="alertdialog" aria-label={`${plan.name} archivieren`}>
        <p>„{plan.name}" archivieren? Vergangene Trainings bleiben erhalten.</p>
        <div className="row">
          <button
            type="button"
            className="btn danger compact"
            onClick={async () => {
              setConfirmArchive(null);
              setMessage(await onArchive(plan.id));
            }}
          >
            Archivieren
          </button>
          <button type="button" className="btn compact" onClick={() => setConfirmArchive(null)}>
            Abbrechen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Pläne</h1>
        <IconButton
          icon={menuOpen ? 'x' : 'plus'}
          tone="accent"
          label={menuOpen ? 'Menü schließen' : 'Neu anlegen'}
          onClick={() => setMenuOpen((o) => !o)}
        />
      </header>

      {menuOpen && (
        <div className="menu" role="menu">
          <button type="button" role="menuitem" onClick={() => create('template')}>
            <Icon name="dumbbell" size={22} />
            <span>
              <strong>Neue Vorlage</strong>
              <small>Eine einzelne Trainingseinheit, jederzeit startbar</small>
            </span>
          </button>
          <button type="button" role="menuitem" onClick={() => create('plan')}>
            <Icon name="list" size={22} />
            <span>
              <strong>Neuer Plan</strong>
              <small>Mehrere Trainingstage mit Rotation, z. B. Push / Pull / Legs</small>
            </span>
          </button>
        </div>
      )}

      {message && (
        <p className="errorbox" role="alert">
          {message}
        </p>
      )}

      <h2 className="section-title">Vorlagen</h2>
      {templates.length === 0 ? (
        <div className="empty-state">
          <Icon name="dumbbell" size={32} />
          <p>Noch keine Vorlage.</p>
          <button type="button" className="btn primary compact" onClick={() => create('template')}>
            Vorlage erstellen
          </button>
        </div>
      ) : (
        <ul className="tiles">
          {templates.map((t) => {
            const day = templateDay(t);
            const n = day ? visibleExercises(day).length : 0;
            const muscles = day ? musclesOfDay(day, exercises) : '';
            return (
              <li key={t.id}>
                <div className="tile">
                  <button
                    type="button"
                    className="tile-main"
                    onClick={() => {
                      setMessage(null);
                      setEditing(t);
                    }}
                    aria-label={`${t.name} bearbeiten`}
                  >
                    <span className="tile-title">
                      <strong>{t.name}</strong>
                      <small>
                        {n} {n === 1 ? 'Übung' : 'Übungen'}
                        {muscles && ` · ${muscles}`}
                      </small>
                    </span>
                  </button>
                  {day && n > 0 && (
                    <IconButton
                      icon="play"
                      tone="accent"
                      label={`${t.name} starten`}
                      onClick={() => onStart(t, day.id)}
                    />
                  )}
                  <IconButton
                    icon="trash"
                    label={`${t.name} archivieren`}
                    onClick={() => setConfirmArchive(t.id)}
                  />
                </div>
                {archiveRow(t)}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="section-title">Pläne</h2>
      {fullPlans.length === 0 ? (
        <div className="empty-state">
          <Icon name="list" size={32} />
          <p>Noch kein Plan.</p>
          <button type="button" className="btn compact" onClick={() => create('plan')}>
            Plan erstellen
          </button>
        </div>
      ) : (
        <ul className="tiles">
          {fullPlans.map((p) => {
            const days = visibleDays(p);
            return (
              <li key={p.id}>
                <div className="tile">
                  <button
                    type="button"
                    className="tile-main"
                    onClick={() => {
                      setMessage(null);
                      setEditing(p);
                    }}
                    aria-label={`${p.name} bearbeiten`}
                  >
                    <span className="tile-title">
                      <strong>{p.name}</strong>
                      <small>
                        {days.length} {days.length === 1 ? 'Tag' : 'Tage'}
                      </small>
                      <span className="daychips">
                        {days.map((d) => (
                          <span key={d.id} className="pill">
                            {d.name}
                          </span>
                        ))}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    icon="trash"
                    label={`${p.name} archivieren`}
                    onClick={() => setConfirmArchive(p.id)}
                  />
                </div>
                {archiveRow(p)}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
