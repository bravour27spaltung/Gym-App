import { formatClock } from '../lib/timer';
import { formatKg } from '../lib/weight';
import { describeLastSets, type DraftExercise, type DraftSet } from '../lib/workout';
import { SetRow } from './SetRow';
import { WeightPicker } from './WeightPicker';

interface Props {
  exercise: DraftExercise;
  onUpdateSet: (
    setId: string,
    patch: Partial<Pick<DraftSet, 'weightKg' | 'reps' | 'rir'>>,
  ) => void;
  onToggleSet: (setId: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onCopyWeight: (setId: string) => void;
  onWarmup: (level: 'full' | 'short') => void;
  onRest: (seconds: number) => void;
  onEquipment: (kg: number | null) => void;
  onRemove: () => void;
}

const REST_OPTIONS = [60, 90, 120, 180, 240];

export function ExerciseCard(props: Props) {
  const { exercise: e } = props;
  const last = describeLastSets(e.lastSets);
  const s = e.suggestion;

  let workingIndex = 0;
  let warmupIndex = 0;

  return (
    <section className="card">
      <header className="card-head">
        <h2>{e.name}</h2>
        <button type="button" className="link" onClick={props.onRemove}>
          Übung entfernen
        </button>
      </header>

      <p className="muted">
        Ziel: {e.repMin}–{e.repMax} Wiederholungen
        {e.targetRir != null ? ` · Ziel-RIR ${e.targetRir}` : ''} · Schritt {formatKg(e.incrementKg)}
      </p>
      <p className="muted">{last ? `Letztes Mal: ${last}` : 'Noch kein Training mit dieser Übung.'}</p>

      {s.action !== 'no-data' && (
        <p className={`hint ${s.action}`}>
          <strong>
            {s.action === 'increase' ? 'Steigern' : 'Halten'}
            {s.weightKg !== null ? `: ${formatKg(s.weightKg)}` : ''}
            {s.targetReps !== null ? ` × ${s.targetReps}` : ''}
          </strong>
          <br />
          {s.reason}
        </p>
      )}

      <div className="row wrap">
        <button type="button" className="btn small" onClick={() => props.onWarmup('full')}>
          Aufwärmen vorschlagen
        </button>
        <button type="button" className="btn small" onClick={() => props.onWarmup('short')}>
          Kurz aufwärmen
        </button>
      </div>

      <ul className="sets">
        {e.sets.map((set) => {
          const idx = set.type === 'warmup' ? ++warmupIndex : ++workingIndex;
          return (
            <SetRow
              key={set.id}
              index={idx}
              set={set}
              equipmentKg={e.equipmentKg}
              onChange={(patch) => props.onUpdateSet(set.id, patch)}
              onToggle={() => props.onToggleSet(set.id)}
              onRemove={() => props.onRemoveSet(set.id)}
              onCopyWeight={() => props.onCopyWeight(set.id)}
            />
          );
        })}
      </ul>

      <button type="button" className="btn" onClick={props.onAddSet}>
        + Satz hinzufügen
      </button>

      <div className="rest-setting">
        <span className="unit">Pause</span>
        <div className="chips" role="radiogroup" aria-label={`Pause für ${e.name}`}>
          {REST_OPTIONS.map((sec) => (
            <button
              key={sec}
              type="button"
              role="radio"
              aria-checked={e.restSeconds === sec}
              className={e.restSeconds === sec ? 'chip on' : 'chip'}
              onClick={() => props.onRest(sec)}
            >
              {formatClock(sec)} min
            </button>
          ))}
        </div>
      </div>

      <details className="equipment">
        <summary>
          Stangen-/Maschinengewicht{' '}
          {e.equipmentKg !== null ? `(${formatKg(e.equipmentKg)})` : '(optional)'}
        </summary>
        <WeightPicker
          label="Stangen- oder Maschinengewicht"
          value={e.equipmentKg ?? 0}
          onChange={(kg) => props.onEquipment(kg)}
        />
        {e.equipmentKg !== null && (
          <button type="button" className="link" onClick={() => props.onEquipment(null)}>
            Angabe entfernen
          </button>
        )}
      </details>
    </section>
  );
}
