import { useMemo, useState } from 'react';
import type { StretchExerciseListItem } from '../lib/storage';
import { DEFAULT_HOLD_SECONDS, DEFAULT_REPS, defaultAmount, type StretchAmount, type StretchExerciseInput } from '../lib/stretch';
import { newId } from '../lib/workout';
import { MUSCLES, muscleLabel } from '../lib/muscles';
import { MuscleFigure } from './MuscleFigure';
import { MuscleSelector } from './MuscleSelector';
import { Icon, IconButton, Stepper } from './ui';

interface Props {
  exercises: StretchExerciseListItem[];
  onClose: () => void;
  /**
   * Übung plus Menge: Haltezeit (Timer) oder Wiederholungen (ohne Timer). Bei vorhandenen
   * Übungen gelten deren Standardwerte, sonst die oben gewählte Menge.
   */
  onPick: (input: StretchExerciseInput, amount: StretchAmount) => void;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

const NO_GROUP = '_none';

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
 * Dehnübung wählen oder neu anlegen. Statt Sätzen/Gewicht gibt es eine Menge: Haltezeit
 * (Timer läuft) oder Wiederholungen (kein Timer, nur "Abgeschlossen").
 */
export function AddStretchExercise({ exercises, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'hold' | 'reps'>('hold');
  const [holdSeconds, setHoldSeconds] = useState(DEFAULT_HOLD_SECONDS);
  const [reps, setReps] = useState(DEFAULT_REPS);
  const [muscles, setMuscles] = useState<string[]>([]);

  const q = normalize(query);
  const matches = useMemo(
    () => exercises.filter((x) => q === '' || normalize(x.name).includes(q)),
    [exercises, q],
  );
  const groups = useMemo(() => groupByMuscle(matches), [matches]);
  const exact = exercises.some((x) => normalize(x.name) === q);

  const chosen: StretchAmount =
    mode === 'reps' ? { holdSeconds: null, reps } : { holdSeconds, reps: null };

  function pickExisting(x: StretchExerciseListItem) {
    const hasDefault = x.defaultReps != null || x.defaultHoldSeconds != null;
    onPick(
      { stretchExerciseId: x.id, name: x.name, isNew: false, muscles: x.muscles },
      hasDefault ? defaultAmount(x) : chosen,
    );
  }

  function createCustom() {
    onPick({ stretchExerciseId: newId(), name: query.trim(), isNew: true, muscles }, chosen);
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
          <div className="chips" role="group" aria-label="Art der Übung">
            <button
              type="button"
              className={mode === 'hold' ? 'chip on' : 'chip'}
              aria-pressed={mode === 'hold'}
              onClick={() => setMode('hold')}
            >
              Haltezeit
            </button>
            <button
              type="button"
              className={mode === 'reps' ? 'chip on' : 'chip'}
              aria-pressed={mode === 'reps'}
              onClick={() => setMode('reps')}
            >
              Wiederholungen
            </button>
          </div>
          {mode === 'hold' ? (
            <>
              <Stepper label="Haltezeit in Sekunden" value={holdSeconds} min={5} max={300} onChange={setHoldSeconds} />
              <span>s</span>
            </>
          ) : (
            <>
              <Stepper label="Wiederholungen" value={reps} min={1} max={50} onChange={setReps} />
              <span>Wdh.</span>
            </>
          )}
        </div>
        <p className="muted pick-hint">
          Für eigene Übungen und Übungen ohne Standardwert. Wiederholungs-Übungen laufen ohne Timer.
        </p>
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
                          x.defaultReps ? `${x.defaultReps} Wdh.` : x.defaultHoldSeconds ? `${x.defaultHoldSeconds} s` : null,
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
