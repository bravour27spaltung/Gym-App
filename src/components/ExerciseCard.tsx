import { useState } from 'react';
import { muscleLabel } from '../lib/muscles';
import { formatClock } from '../lib/timer';
import { formatKg } from '../lib/weight';
import { describeLastSets, type DraftExercise, type DraftSet } from '../lib/workout';
import { SetRow } from './SetRow';
import { EquipmentField, Icon, IconButton } from './ui';

interface Props {
  exercise: DraftExercise;
  onSetWeight: (setId: string, kg: number) => void;
  onUpdateSet: (setId: string, patch: Partial<Pick<DraftSet, 'reps' | 'type'>>) => void;
  onToggleSet: (setId: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onWarmup: (level: 'full' | 'short') => void;
  onRest: (seconds: number) => void;
  onEquipment: (kg: number | null) => void;
  onRemove: () => void;
}

const REST_OPTIONS = [60, 90, 120, 180, 240];

export function ExerciseCard(props: Props) {
  const { exercise: e } = props;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const last = describeLastSets(e.lastSets);
  const s = e.suggestion;
  const muscles = (e.primaryMuscles ?? []).slice(0, 2).map(muscleLabel).join(', ');
  const doneCount = e.sets.filter((x) => x.done && x.type === 'working').length;
  const workingCount = e.sets.filter((x) => x.type === 'working').length;
  const previousByType = {
    warmup: e.lastSets.filter((x) => x.type === 'warmup'),
    working: e.lastSets.filter((x) => x.type === 'working'),
  };

  let workingIndex = 0;
  let warmupIndex = 0;

  return (
    <section className="card excard">
      <header className="excard-head">
        <div className="excard-name">
          <h2>{e.name}</h2>
          <p className="excard-sub">
            {[muscles, `${e.repMin}–${e.repMax} Wdh.`].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="excard-progress" aria-label={`${doneCount} von ${workingCount} Sätzen erledigt`}>
          {doneCount}/{workingCount}
        </span>
        <IconButton
          icon="trash"
          tone="danger"
          size={18}
          label={`${e.name} entfernen`}
          onClick={() => setConfirmRemove(true)}
        />
      </header>

      {confirmRemove && (
        <div className="banner" role="alertdialog" aria-label={`${e.name} entfernen`}>
          <p>Übung mit allen Sätzen entfernen?</p>
          <div className="row">
            <button type="button" className="btn danger compact" onClick={props.onRemove}>
              Entfernen
            </button>
            <button type="button" className="btn compact" onClick={() => setConfirmRemove(false)}>
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {e.note && (
        <p className="note">
          <Icon name="note" size={16} /> {e.note}
        </p>
      )}

      {s.action !== 'no-data' && (
        <p className={`hint ${s.action}`}>
          <strong>
            {s.action === 'increase'
              ? `Empfehlung: Steigern, ab ${s.targetReps ?? e.repMin} Wdh.`
              : `Empfehlung: Halten${s.weightKg !== null ? `: ${formatKg(s.weightKg)}` : ''}${
                  s.targetReps !== null ? ` × ${s.targetReps}` : ''
                }`}
          </strong>
          <br />
          {s.reason}
        </p>
      )}

      <EquipmentField name={e.name} value={e.equipmentKg} onChange={props.onEquipment} />

      <div className="setgrid sethead" aria-hidden="true">
        <span>Satz</span>
        <span>Vorher</span>
        <span>kg</span>
        <span>Wdh.</span>
        <span />
      </div>
      <ul className="sets">
        {e.sets.map((set) => {
          const idx = set.type === 'warmup' ? ++warmupIndex : ++workingIndex;
          return (
            <SetRow
              key={set.id}
              index={idx}
              set={set}
              previous={previousByType[set.type][idx - 1] ?? null}
              equipmentKg={e.equipmentKg}
              onWeight={(kg) => props.onSetWeight(set.id, kg)}
              onReps={(reps) => props.onUpdateSet(set.id, { reps })}
              onToggle={() => props.onToggleSet(set.id)}
              onToggleType={() =>
                props.onUpdateSet(set.id, { type: set.type === 'warmup' ? 'working' : 'warmup' })
              }
              onRemove={() => props.onRemoveSet(set.id)}
            />
          );
        })}
      </ul>

      <div className="excard-actions">
        <button type="button" className="addtile small" onClick={props.onAddSet}>
          <Icon name="plus" size={18} /> Satz
        </button>
        <button type="button" className="addtile small" onClick={() => props.onWarmup('full')}>
          <Icon name="flame" size={16} /> Aufwärmen
        </button>
      </div>

      <p className="lasttime">
        <span>Letztes Mal</span> {last || 'noch kein Training mit dieser Übung'}
      </p>

      <details className="equipment">
        <summary>
          <Icon name="clock" size={16} /> Pause {formatClock(e.restSeconds)}
        </summary>
        <div className="rest-setting">
          <div className="chips" role="radiogroup" aria-label={`Pause für ${e.name}`}>
            {[...new Set([...REST_OPTIONS, e.restSeconds])]
              .sort((a, b) => a - b)
              .map((sec) => (
                <button
                  key={sec}
                  type="button"
                  role="radio"
                  aria-checked={e.restSeconds === sec}
                  className={e.restSeconds === sec ? 'chip on' : 'chip'}
                  onClick={() => props.onRest(sec)}
                >
                  {formatClock(sec)}
                </button>
              ))}
          </div>
        </div>
      </details>
    </section>
  );
}
