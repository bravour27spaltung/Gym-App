import { useMemo, useState } from 'react';
import type { ExerciseListItem } from '../lib/storage';
import { newId, type ExerciseInput } from '../lib/workout';
import { formatKg } from '../lib/weight';
import { MUSCLES, muscleLabel, toggleMuscle } from '../lib/muscles';

interface Props {
  exercises: ExerciseListItem[];
  onPick: (input: ExerciseInput) => void;
  onClose: () => void;
}

const INCREMENTS = [0.25, 0.5, 0.75, 1, 1.25, 2, 2.5, 5];

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

export function AddExercise({ exercises, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [repMin, setRepMin] = useState(8);
  const [repMax, setRepMax] = useState(12);
  const [sets, setSets] = useState(3);
  const [increment, setIncrement] = useState(2.5);
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);

  const q = normalize(query);
  const matches = useMemo(
    () => (q === '' ? exercises : exercises.filter((x) => normalize(x.name).includes(q))),
    [exercises, q],
  );
  const exact = exercises.some((x) => normalize(x.name) === q);
  const rangeOk = repMin >= 1 && repMax >= repMin;

  const base = { repMin, repMax, plannedSets: sets };

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Übung hinzufügen">
      <div className="sheet-body">
        <header className="card-head">
          <h2>Übung hinzufügen</h2>
          <button type="button" className="link" onClick={onClose}>
            Schließen
          </button>
        </header>

        <input
          className="text"
          type="search"
          placeholder="Übung suchen oder neu benennen"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Übung suchen"
        />

        <div className="row wrap">
          <label>
            Wdh. von
            <input
              className="num small"
              type="number"
              inputMode="numeric"
              min={1}
              value={repMin}
              onChange={(e) => setRepMin(parseInt(e.target.value || '0', 10))}
            />
          </label>
          <label>
            bis
            <input
              className="num small"
              type="number"
              inputMode="numeric"
              min={1}
              value={repMax}
              onChange={(e) => setRepMax(parseInt(e.target.value || '0', 10))}
            />
          </label>
          <label>
            Sätze
            <input
              className="num small"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              value={sets}
              onChange={(e) => setSets(Math.max(1, Math.min(10, parseInt(e.target.value || '1', 10))))}
            />
          </label>
        </div>
        {!rangeOk && <p className="error">Die Obergrenze muss mindestens so groß sein wie die Untergrenze.</p>}

        <ul className="pick-list">
          {matches.map((x) => (
            <li key={x.id}>
              <button
                type="button"
                className="pick"
                disabled={!rangeOk}
                onClick={() =>
                  onPick({
                    ...base,
                    exerciseId: x.id,
                    name: x.name,
                    isNew: false,
                    incrementKg: x.incrementKg,
                    equipmentKg: x.equipmentKg,
                  })
                }
              >
                {x.name}
                <span className="muted"> · Schritt {formatKg(x.incrementKg)}</span>
                {x.primaryMuscles && x.primaryMuscles.length > 0 && (
                  <span className="muted"> · {x.primaryMuscles.map(muscleLabel).join(', ')}</span>
                )}
              </button>
            </li>
          ))}
          {matches.length === 0 && q !== '' && <li className="muted">Keine Übung gefunden.</li>}
        </ul>

        {q !== '' && !exact && (
          <div className="new-exercise">
            <p>
              Eigene Übung „<strong>{query.trim()}</strong>" anlegen
            </p>
            <label>
              Gewichtsschritt
              <select
                value={increment}
                onChange={(e) => setIncrement(parseFloat(e.target.value))}
              >
                {INCREMENTS.map((i) => (
                  <option key={i} value={i}>
                    {formatKg(i)}
                  </option>
                ))}
              </select>
            </label>
            <MusclePicker
              legend="Hauptmuskel (mindestens einer)"
              selected={primary}
              onToggle={(key) => {
                const r = toggleMuscle(primary, secondary, key);
                setPrimary(r.list);
                setSecondary(r.other);
              }}
            />
            <MusclePicker
              legend="Hilfsmuskeln (optional)"
              selected={secondary}
              onToggle={(key) => {
                const r = toggleMuscle(secondary, primary, key);
                setSecondary(r.list);
                setPrimary(r.other);
              }}
            />
            {primary.length === 0 && (
              <p className="muted">Wähle mindestens einen Hauptmuskel, damit die Übung später zugeordnet werden kann.</p>
            )}
            <button
              type="button"
              className="btn primary"
              disabled={!rangeOk || primary.length === 0}
              onClick={() =>
                onPick({
                  ...base,
                  exerciseId: newId(),
                  name: query.trim(),
                  isNew: true,
                  incrementKg: increment,
                  equipmentKg: null,
                  primaryMuscles: primary,
                  secondaryMuscles: secondary,
                })
              }
            >
              Anlegen und hinzufügen
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface MusclePickerProps {
  legend: string;
  selected: string[];
  onToggle: (key: string) => void;
}

/** Auswahl per Tippen auf Schilder; Mehrfachauswahl. */
function MusclePicker({ legend, selected, onToggle }: MusclePickerProps) {
  return (
    <fieldset className="muscles">
      <legend>{legend}</legend>
      <div className="chips">
        {MUSCLES.map((m) => {
          const on = selected.includes(m.key);
          return (
            <button
              key={m.key}
              type="button"
              className={on ? 'chip on' : 'chip'}
              aria-pressed={on}
              onClick={() => onToggle(m.key)}
            >
              {m.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
