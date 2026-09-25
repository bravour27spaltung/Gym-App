import { useMemo, useState } from 'react';
import type { ExerciseListItem } from '../lib/storage';
import { newId, type ExerciseInput } from '../lib/workout';
import { MUSCLES, muscleLabel, toggleMuscle } from '../lib/muscles';
import { EQUIPMENT, equipmentLabel } from '../lib/equipment';

interface Props {
  exercises: ExerciseListItem[];
  onPick: (input: ExerciseInput) => void;
  onClose: () => void;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

const NO_GROUP = '_none';

/** Übungen nach Hauptmuskel gruppieren, in der Reihenfolge der Muskelliste. */
function groupByMuscle(list: ExerciseListItem[]): { key: string; label: string; items: ExerciseListItem[] }[] {
  const groups = new Map<string, ExerciseListItem[]>();
  for (const x of list) {
    const key = x.primaryMuscles?.[0] ?? NO_GROUP;
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  const ordered = MUSCLES.filter((m) => groups.has(m.key)).map((m) => ({
    key: m.key as string,
    label: m.label as string,
    items: groups.get(m.key)!,
  }));
  const rest = [...groups.keys()].filter((k) => k !== NO_GROUP && !MUSCLES.some((m) => m.key === k));
  for (const k of rest) ordered.push({ key: k, label: muscleLabel(k), items: groups.get(k)! });
  if (groups.has(NO_GROUP)) ordered.push({ key: NO_GROUP, label: 'Ohne Zuordnung', items: groups.get(NO_GROUP)! });
  return ordered;
}

export function AddExercise({ exercises, onPick, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [repMin, setRepMin] = useState(8);
  const [repMax, setRepMax] = useState(12);
  const [sets, setSets] = useState(3);
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState('');
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [equipment, setEquipment] = useState('');

  const q = normalize(query);

  // Filter nur mit Werten anbieten, zu denen es auch Übungen gibt.
  const musclesInUse = useMemo(() => {
    const used = new Set(exercises.flatMap((x) => x.primaryMuscles ?? []));
    return MUSCLES.filter((m) => used.has(m.key));
  }, [exercises]);
  const equipmentInUse = useMemo(() => {
    const used = new Set(exercises.map((x) => x.equipment).filter((x): x is string => !!x));
    return EQUIPMENT.filter((e) => used.has(e.key));
  }, [exercises]);

  const matches = useMemo(
    () =>
      exercises.filter(
        (x) =>
          (q === '' || normalize(x.name).includes(q)) &&
          (muscleFilter === null || (x.primaryMuscles ?? []).includes(muscleFilter)) &&
          (equipmentFilter === '' || x.equipment === equipmentFilter),
      ),
    [exercises, q, muscleFilter, equipmentFilter],
  );
  const groups = useMemo(() => groupByMuscle(matches), [matches]);

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

        {musclesInUse.length > 0 && (
          <div className="chips" role="group" aria-label="Nach Muskelgruppe filtern">
            <button
              type="button"
              className={muscleFilter === null ? 'chip on' : 'chip'}
              aria-pressed={muscleFilter === null}
              onClick={() => setMuscleFilter(null)}
            >
              Alle
            </button>
            {musclesInUse.map((m) => (
              <button
                key={m.key}
                type="button"
                className={muscleFilter === m.key ? 'chip on' : 'chip'}
                aria-pressed={muscleFilter === m.key}
                onClick={() => setMuscleFilter(muscleFilter === m.key ? null : m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}

        {equipmentInUse.length > 0 && (
          <label>
            Gerät
            <select value={equipmentFilter} onChange={(e) => setEquipmentFilter(e.target.value)}>
              <option value="">Alle Geräte</option>
              {equipmentInUse.map((e) => (
                <option key={e.key} value={e.key}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
        )}

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

        {groups.map((g) => (
          <section key={g.key} className="pick-group" aria-label={g.label}>
            <h3 className="pick-heading">{g.label}</h3>
            <ul className="pick-list">
              {g.items.map((x) => (
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
                      })
                    }
                  >
                    {x.name}
                    {x.equipment && <span className="muted"> · {equipmentLabel(x.equipment)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {matches.length === 0 && (q !== '' || muscleFilter !== null || equipmentFilter !== '') && (
          <p className="muted">Keine Übung gefunden.</p>
        )}

        {q !== '' && !exact && (
          <div className="new-exercise">
            <p>
              Eigene Übung „<strong>{query.trim()}</strong>" anlegen
            </p>
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
            <label>
              Gerät (optional)
              <select value={equipment} onChange={(e) => setEquipment(e.target.value)}>
                <option value="">Keine Angabe</option>
                {EQUIPMENT.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.label}
                  </option>
                ))}
              </select>
            </label>
            {primary.length === 0 && (
              <p className="muted">Wähle mindestens einen Hauptmuskel, damit die Übung einsortiert werden kann.</p>
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
                  equipment: equipment === '' ? null : equipment,
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
