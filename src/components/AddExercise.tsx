import { useMemo, useState } from 'react';
import type { ExerciseListItem } from '../lib/storage';
import { newId, type ExerciseInput } from '../lib/workout';
import { MUSCLES, muscleLabel, toggleMuscle } from '../lib/muscles';
import { EQUIPMENT, equipmentLabel } from '../lib/equipment';
import { MuscleFigure } from './MuscleFigure';
import { Icon, IconButton, Stepper } from './ui';

interface Props {
  exercises: ExerciseListItem[];
  onClose: () => void;
  /** Einzelauswahl (Training): Tippen wählt sofort, Sätze und Wdh. stellst du hier ein. */
  onPick?: (input: ExerciseInput) => void;
  /** Mehrfachauswahl (Plan): mehrere ankreuzen und gemeinsam hinzufügen. */
  onPickMany?: (inputs: ExerciseInput[]) => void;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

const NO_GROUP = '_none';

/** Übungen nach Hauptmuskel gruppieren, in der Reihenfolge der Muskelliste. */
function groupByMuscle(
  list: ExerciseListItem[],
): { key: string; label: string; items: ExerciseListItem[] }[] {
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
  const rest = [...groups.keys()].filter(
    (k) => k !== NO_GROUP && !MUSCLES.some((m) => m.key === k),
  );
  for (const k of rest) ordered.push({ key: k, label: muscleLabel(k), items: groups.get(k)! });
  if (groups.has(NO_GROUP)) {
    ordered.push({ key: NO_GROUP, label: 'Ohne Zuordnung', items: groups.get(NO_GROUP)! });
  }
  return ordered;
}

export function AddExercise({ exercises, onClose, onPick, onPickMany }: Props) {
  const multiple = onPickMany !== undefined;

  const [query, setQuery] = useState('');
  const [repMin, setRepMin] = useState(8);
  const [repMax, setRepMax] = useState(12);
  const [sets, setSets] = useState(3);
  const [muscleFilter, setMuscleFilter] = useState<string | null>(null);
  const [equipmentFilter, setEquipmentFilter] = useState<string | null>(null);
  const [primary, setPrimary] = useState<string[]>([]);
  const [secondary, setSecondary] = useState<string[]>([]);
  const [equipment, setEquipment] = useState('');
  // Mehrfachauswahl: gewählte Übungen in der Reihenfolge des Anklickens.
  const [selected, setSelected] = useState<ExerciseInput[]>([]);
  // In dieser Sitzung neu angelegte eigene Übungen (erscheinen sofort in der Liste).
  const [created, setCreated] = useState<ExerciseListItem[]>([]);

  const all = useMemo(() => [...created, ...exercises], [created, exercises]);
  const q = normalize(query);

  // Filter nur mit Werten anbieten, zu denen es auch Übungen gibt.
  const musclesInUse = useMemo(() => {
    const used = new Set(all.flatMap((x) => x.primaryMuscles ?? []));
    return MUSCLES.filter((m) => used.has(m.key));
  }, [all]);
  const equipmentInUse = useMemo(() => {
    const used = new Set(all.map((x) => x.equipment).filter((x): x is string => !!x));
    return EQUIPMENT.filter((e) => used.has(e.key));
  }, [all]);

  const matches = useMemo(
    () =>
      all.filter(
        (x) =>
          (q === '' || normalize(x.name).includes(q)) &&
          (muscleFilter === null || (x.primaryMuscles ?? []).includes(muscleFilter)) &&
          (equipmentFilter === null || x.equipment === equipmentFilter),
      ),
    [all, q, muscleFilter, equipmentFilter],
  );
  const groups = useMemo(() => groupByMuscle(matches), [matches]);

  const exact = all.some((x) => normalize(x.name) === q);
  const rangeOk = repMin >= 1 && repMax >= repMin;
  const base = multiple
    ? { repMin: 8, repMax: 12, plannedSets: 3 }
    : { repMin, repMax, plannedSets: sets };

  const isSelected = (id: string) => selected.some((s) => s.exerciseId === id);

  function pickExisting(x: ExerciseListItem) {
    const input: ExerciseInput = {
      ...base,
      exerciseId: x.id,
      name: x.name,
      isNew: created.some((c) => c.id === x.id),
      equipment: x.equipment ?? null,
      primaryMuscles: x.primaryMuscles,
      secondaryMuscles: x.secondaryMuscles,
    };
    if (!multiple) {
      onPick?.(input);
      return;
    }
    setSelected((cur) =>
      cur.some((s) => s.exerciseId === x.id)
        ? cur.filter((s) => s.exerciseId !== x.id)
        : [...cur, input],
    );
  }

  function createCustom() {
    const input: ExerciseInput = {
      ...base,
      exerciseId: newId(),
      name: query.trim(),
      isNew: true,
      equipment: equipment === '' ? null : equipment,
      primaryMuscles: primary,
      secondaryMuscles: secondary,
    };
    if (!multiple) {
      onPick?.(input);
      return;
    }
    setCreated((cur) => [
      {
        id: input.exerciseId,
        name: input.name,
        equipment: input.equipment,
        primaryMuscles: primary,
        secondaryMuscles: secondary,
      },
      ...cur,
    ]);
    setSelected((cur) => [...cur, input]);
    setQuery('');
    setPrimary([]);
    setSecondary([]);
    setEquipment('');
  }

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-label="Übungen wählen">
      <header className="sheet-head">
        <IconButton icon="x" label="Schließen" onClick={onClose} />
        <h2>{multiple ? 'Übungen wählen' : 'Übung hinzufügen'}</h2>
        <span className="appbar-spacer" />
      </header>

      <div className="sheet-tools">
        <label className="searchbar">
          <Icon name="search" size={20} />
          <input
            type="search"
            placeholder="Übung suchen oder neu benennen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Übung suchen"
          />
        </label>

        {musclesInUse.length > 0 && (
          <div className="chips scroll" role="group" aria-label="Nach Muskelgruppe filtern">
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
          <div className="chips scroll sm" role="group" aria-label="Nach Gerät filtern">
            {equipmentInUse.map((e) => (
              <button
                key={e.key}
                type="button"
                className={equipmentFilter === e.key ? 'chip on' : 'chip'}
                aria-pressed={equipmentFilter === e.key}
                onClick={() => setEquipmentFilter(equipmentFilter === e.key ? null : e.key)}
              >
                {e.label}
              </button>
            ))}
          </div>
        )}

        {!multiple && (
          <div className="pick-config">
            <span>Sätze</span>
            <Stepper label="Sätze" value={sets} min={1} max={10} onChange={setSets} />
            <span>Wdh.</span>
            <Stepper
              label="Untere Wiederholungsgrenze"
              value={repMin}
              min={1}
              max={100}
              onChange={setRepMin}
            />
            <span>–</span>
            <Stepper
              label="Obere Wiederholungsgrenze"
              value={repMax}
              min={1}
              max={100}
              onChange={setRepMax}
            />
          </div>
        )}
        {!multiple && !rangeOk && (
          <p className="error">Die Obergrenze muss mindestens so groß sein wie die Untergrenze.</p>
        )}
      </div>

      <div className="sheet-scroll">
        {groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h3 className="group-title">
              {g.label} <span>{g.items.length}</span>
            </h3>
            <ul className="exlist">
              {g.items.map((x) => {
                const on = multiple && isSelected(x.id);
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      className={on ? 'exrow on' : 'exrow'}
                      aria-pressed={multiple ? on : undefined}
                      disabled={!multiple && !rangeOk}
                      onClick={() => pickExisting(x)}
                    >
                      {multiple && (
                        <span className="exrow-check" aria-hidden="true">
                          {on && <Icon name="check" size={16} />}
                        </span>
                      )}
                      <span className="exrow-text">
                        <strong>{x.name}</strong>
                        <small>
                          {[
                            ...(x.primaryMuscles ?? []).slice(0, 2).map(muscleLabel),
                            x.equipment ? equipmentLabel(x.equipment) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Ohne Zuordnung'}
                        </small>
                      </span>
                      <MuscleFigure
                        primary={x.primaryMuscles ?? []}
                        secondary={x.secondaryMuscles ?? []}
                        view="auto"
                        height={44}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

        {matches.length === 0 && (
          <p className="empty">
            {q !== '' || muscleFilter !== null || equipmentFilter !== null
              ? 'Keine Übung gefunden.'
              : 'Noch keine Übungen im Katalog.'}
          </p>
        )}

        {q !== '' && !exact && (
          <div className="card newex">
            <h3>Eigene Übung „{query.trim()}" anlegen</h3>
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
            <fieldset className="muscles">
              <legend>Gerät (optional)</legend>
              <div className="chips">
                {EQUIPMENT.map((e) => (
                  <button
                    key={e.key}
                    type="button"
                    className={equipment === e.key ? 'chip on' : 'chip'}
                    aria-pressed={equipment === e.key}
                    onClick={() => setEquipment(equipment === e.key ? '' : e.key)}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </fieldset>
            {primary.length === 0 && (
              <p className="muted">
                Wähle mindestens einen Hauptmuskel, damit die Übung einsortiert werden kann.
              </p>
            )}
            <button
              type="button"
              className="btn primary block"
              disabled={(!multiple && !rangeOk) || primary.length === 0}
              onClick={createCustom}
            >
              {multiple ? 'Anlegen und auswählen' : 'Anlegen und hinzufügen'}
            </button>
          </div>
        )}
      </div>

      {multiple && (
        <footer className="sheet-foot">
          <button
            type="button"
            className="btn primary block"
            disabled={selected.length === 0}
            onClick={() => onPickMany?.(selected)}
          >
            {selected.length === 0
              ? 'Übungen antippen zum Auswählen'
              : selected.length === 1
                ? '1 Übung hinzufügen'
                : `${selected.length} Übungen hinzufügen`}
          </button>
        </footer>
      )}
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
