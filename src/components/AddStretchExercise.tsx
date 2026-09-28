import { useMemo, useState } from 'react';
import type { StretchExerciseListItem } from '../lib/storage';
import type { StretchExerciseInput } from '../lib/stretch';
import { newId } from '../lib/workout';
import { MUSCLES, muscleLabel } from '../lib/muscles';
import { MuscleFigure } from './MuscleFigure';
import { MuscleSelector } from './MuscleSelector';
import { Icon, IconButton, Stepper } from './ui';

interface Props {
  exercises: StretchExerciseListItem[];
  onClose: () => void;
  /** Übung plus gewählte Haltezeit (Vorschlag für den folgenden Timer). */
  onPick: (input: StretchExerciseInput, holdSeconds: number) => void;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

const NO_GROUP = '_none';
const DEFAULT_HOLD = 30;

/** Übungen nach erstem Muskel gruppieren, in der Reihenfolge der Muskelliste. */
function groupByMuscle(
  list: StretchExerciseListItem[],
): { key: string; label: string; items: StretchExerciseListItem[] }[] {
  const groups = new Map<string, StretchExerciseListItem[]>();
  for (const x of list) {
    const key = x.muscles[0] ?? NO_GROUP;
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  const ordered = MUSCLES.filter((m) => groups.has(m.key)).map((m) => ({
    key: m.key as string,
    label: m.label as string,
    items: groups.get(m.key)!,
  }));
  const rest = [...groups.keys()].filter(
    (k) => k !== NO_GROUP && !MUSCLES.some((m) => m.key === k),
  );
  for (const k of rest) ordered.push({ key: k, label: muscleLabel(k), items: groups.get(k)! });
  if (groups.has(NO_GROUP)) {
    ordered.push({ key: NO_GROUP, label: 'Ohne Zuordnung', items: groups.get(NO_GROUP)! });
  }
  return ordered;
}

/**
 * Dehnübung wählen oder neu anlegen. Anders als bei AddExercise gibt es keine Sätze/
 * Wiederholungen, nur eine Haltezeit als Vorschlag für den folgenden Timer.
 */
export function AddStretchExercise({ exercises, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [holdSeconds, setHoldSeconds] = useState(DEFAULT_HOLD);
  const [muscles, setMuscles] = useState<string[]>([]);

  const q = normalize(query);
  const matches = useMemo(
    () => exercises.filter((x) => q === '' || normalize(x.name).includes(q)),
    [exercises, q],
  );
  const groups = useMemo(() => groupByMuscle(matches), [matches]);
  const exact = exercises.some((x) => normalize(x.name) === q);

  function pickExisting(x: StretchExerciseListItem) {
    onPick(
      { stretchExerciseId: x.id, name: x.name, isNew: false, muscles: x.muscles },
      x.defaultHoldSeconds ?? holdSeconds,
    );
  }

  function createCustom() {
    onPick({ stretchExerciseId: newId(), name: query.trim(), isNew: true, muscles }, holdSeconds);
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Dehnübung wählen">
      <header className="sheet-head">
        <IconButton icon="x" label="Schließen" onClick={onClose} />
        <h2>Dehnübung wählen</h2>
        <span className="appbar-spacer" />
      </header>

      <div className="sheet-tools">
        <label className="searchbar">
          <Icon name="search" size={20} />
          <input
            type="search"
            placeholder="Suchen oder neu anlegen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Dehnübung suchen"
          />
        </label>
        <div className="pick-config">
          <span>Haltezeit</span>
          <Stepper
            label="Haltezeit in Sekunden"
            value={holdSeconds}
            min={5}
            max={300}
            onChange={setHoldSeconds}
          />
          <span>s</span>
        </div>
      </div>

      <div className="sheet-scroll">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3 className="group-title">
              {g.label} <span>{g.items.length}</span>
            </h3>
            <ul className="exlist">
              {g.items.map((x) => (
                <li key={x.id}>
                  <button type="button" className="exrow" onClick={() => pickExisting(x)}>
                    <span className="exrow-text">
                      <strong>{x.name}</strong>
                      <small>
                        {[
                          ...x.muscles.slice(0, 2).map(muscleLabel),
                          x.defaultHoldSeconds ? `${x.defaultHoldSeconds} s` : null,
                        ]
                          .filter(Boolean)
                          .join(' · ') || 'Ohne Zuordnung'}
                      </small>
                    </span>
                    <MuscleFigure primary={x.muscles} secondary={[]} view="auto" height={44} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}

        {matches.length === 0 && (
          <p className="empty">{q !== '' ? 'Keine Übung gefunden.' : 'Noch keine Dehnübungen im Katalog.'}</p>
        )}

        {q !== '' && !exact && (
          <div className="card newex">
            <h3>Eigene Dehnübung „{query.trim()}" anlegen</h3>
            <p className="muted newex-hint">Tippe auf die Muskeln, die dabei gedehnt werden.</p>
            <MuscleSelector primary={muscles} secondary={[]} onChange={(p, s) => setMuscles([...p, ...s])} />
            {muscles.length === 0 && <p className="muted">Wähle mindestens einen Muskel.</p>}
            <button
              type="button"
              className="btn primary block"
              disabled={muscles.length === 0}
              onClick={createCustom}
            >
              Anlegen und starten
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
