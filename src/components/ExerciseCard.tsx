import { useMemo, useState } from 'react';
import { formatClock } from '../lib/timer';
import { fmtKg, fmtShortYear } from '../lib/format';
import { exerciseSessions, recentOneRmSeries, setSlotHistory, type HistWorkout } from '../lib/stats';
import { formatKg, kgText } from '../lib/weight';
import { describeLastSets, type DraftExercise, type DraftSet } from '../lib/workout';
import { LineChart } from './Chart';
import { SetEditor, SetLine } from './SetRow';
import { MuscleLegend } from './MuscleFigure';
import { EquipmentField, Icon } from './ui';

interface Props {
  exercise: DraftExercise;
  /** Abgeschlossene Trainings, für die Satz-Historie ("Verlauf") im Editor. */
  history: HistWorkout[];
  /** Satz, dessen Editor offen ist; null = alle Sätze erledigt oder keiner gewählt. */
  activeSetId: string | null;
  onSelect: (setId: string | null) => void;
  onSetWeight: (setId: string, kg: number) => void;
  onUpdateSet: (setId: string, patch: Partial<Pick<DraftSet, 'reps' | 'type'>>) => void;
  onToggleSet: (setId: string) => void;
  onAddSet: () => void;
  onRemoveSet: (setId: string) => void;
  onWarmup: (level: 'full' | 'short') => void;
  onRest: (seconds: number) => void;
  onEquipment: (kg: number | null) => void;
  onRemove: () => void;
  /** Große Schaltfläche nach dem letzten Satz ("Weiter: …" bzw. "Training beenden"). */
  next: { label: string; onClick: () => void } | null;
}

const REST_OPTIONS = [60, 90, 120, 180, 240];

/**
 * Eine Übung im Fokus: Kopf, letzte Werte, Sätze als schmale Zeilen und nur beim
 * aktiven Satz die großen Eingabefelder. Seltenes (Stange/Maschine, Pause, Entfernen)
 * steckt unter "Mehr".
 */
export function ExerciseCard(props: Props) {
  const { exercise: e, activeSetId } = props;
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showWarm, setShowWarm] = useState(false);
  const last = describeLastSets(e.lastSets);
  const sessions = exerciseSessions(props.history, e.exerciseId);
  const oneRm = useMemo(
    () => recentOneRmSeries(props.history, e.exerciseId, Date.now()),
    [props.history, e.exerciseId],
  );
  const oneRmFirst = oneRm[0];
  const oneRmLast = oneRm[oneRm.length - 1];
  const oneRmDelta =
    oneRm.length >= 2 && oneRmFirst.best1RM !== null && oneRmLast.best1RM !== null
      ? Math.round((oneRmLast.best1RM - oneRmFirst.best1RM) * 10) / 10
      : null;
  const s = e.suggestion;
  const primary = e.primaryMuscles ?? [];
  const secondary = e.secondaryMuscles ?? [];
  const doneCount = e.sets.filter((x) => x.done && x.type === 'working').length;
  const workingCount = e.sets.filter((x) => x.type === 'working').length;
  const previousByType = {
    warmup: e.lastSets.filter((x) => x.type === 'warmup'),
    working: e.lastSets.filter((x) => x.type === 'working'),
  };

  const warmSets = e.sets.filter((x) => x.type === 'warmup');
  const warmDone = warmSets.length > 0 && warmSets.every((x) => x.done);
  const activeIsWarm = warmSets.some((x) => x.id === activeSetId);
  // Erledigte Aufwärmsätze klappen zu einer Zeile zusammen, solange keiner bearbeitet wird.
  const collapseWarm = warmDone && !showWarm && !activeIsWarm;

  let workingIndex = 0;
  let warmupIndex = 0;
  let warmSummaryShown = false;

  const rows = e.sets.map((set) => {
    const idx = set.type === 'warmup' ? ++warmupIndex : ++workingIndex;
    if (set.type === 'warmup' && collapseWarm) {
      if (warmSummaryShown) return null;
      warmSummaryShown = true;
      return (
        <li key="warm-summary">
          <button type="button" className="fx-line warm done" onClick={() => setShowWarm(true)}>
            <span className="fx-badge">W</span>
            <span className="fx-val">Aufwärmen · {warmSets.length} erledigt</span>
            <span className="fx-state" aria-hidden="true">
              <Icon name="down" size={18} />
            </span>
          </button>
        </li>
      );
    }
    const previous = previousByType[set.type][idx - 1] ?? null;
    if (set.id === activeSetId) {
      return (
        <SetEditor
          key={set.id}
          index={idx}
          set={set}
          previous={previous}
          history={setSlotHistory(props.history, e.exerciseId, set.type, idx)}
          equipmentKg={e.equipmentKg}
          onWeight={(kg) => props.onSetWeight(set.id, kg)}
          onReps={(reps) => props.onUpdateSet(set.id, { reps })}
          onToggle={() => props.onToggleSet(set.id)}
          onClose={() => props.onSelect(null)}
          onToggleType={() =>
            props.onUpdateSet(set.id, { type: set.type === 'warmup' ? 'working' : 'warmup' })
          }
          onRemove={() => {
            props.onSelect(null);
            props.onRemoveSet(set.id);
          }}
        />
      );
    }
    return (
      <SetLine
        key={set.id}
        index={idx}
        set={set}
        previous={previous}
        onSelect={() => props.onSelect(set.id)}
      />
    );
  });

  return (
    <section className="card excard">
      <header className="excard-head">
        <div className="excard-name">
          <h2>{e.name}</h2>
          <p className="excard-sub">{e.repMin}–{e.repMax} Wdh.</p>
          <MuscleLegend primary={primary} secondary={secondary} />
        </div>
        <span className="excard-progress" aria-label={`${doneCount} von ${workingCount} Sätzen erledigt`}>
          {doneCount}/{workingCount}
        </span>
      </header>

      {e.note && (
        <p className="note">
          <Icon name="note" size={16} /> {e.note}
        </p>
      )}

      <div className={`hint ${s.action}`}>
        <strong>
          {s.action === 'no-data'
            ? `Empfehlung: Gewicht wählen, Ziel ${s.targetReps ?? e.repMax} Wdh.`
            : s.action === 'increase'
              ? s.incrementKg !== null && s.weightKg !== null
                ? `Empfehlung: Steigern auf ${formatKg(s.weightKg)} (+${formatKg(s.incrementKg)}), Ziel ${
                    s.targetReps ?? e.repMax
                  } Wdh.`
                : `Empfehlung: Steigern (du wählst das Gewicht), Ziel ${s.targetReps ?? e.repMax} Wdh.`
              : `Empfehlung: Halten, ${s.targetReps ?? e.repMax} Wdh.${
                  s.weightKg !== null ? ` × ${formatKg(s.weightKg)}` : ''
                }`}
        </strong>
        {s.action !== 'no-data' && <small className="fx-hint-reason">{s.reason}</small>}
      </div>

      <p className="lasttime">
        <span>Letztes Mal</span> {last || 'noch kein Training mit dieser Übung'}
      </p>

      <ul className="fx-sets">{rows}</ul>

      {props.next && (
        <button type="button" className="btn primary block fx-go" onClick={props.next.onClick}>
          {props.next.label}
        </button>
      )}

      <div className="fx-actions">
        <button type="button" className="textbtn" onClick={props.onAddSet}>
          <Icon name="plus" size={16} /> Satz
        </button>
        {warmSets.length === 0 && (
          <button type="button" className="textbtn" onClick={() => props.onWarmup('full')}>
            <Icon name="flame" size={16} /> Aufwärmsätze vorschlagen
          </button>
        )}
      </div>

      {sessions.length > 0 && (
        <details className="fx-exhist" open>
          <summary>
            <Icon name="clock" size={14} /> Verlauf · letzte {sessions.length} Training{sessions.length === 1 ? '' : 's'}
          </summary>
          <ul>
            {sessions.map((x) => (
              <li key={x.workoutId}>
                <span className="fx-exhist-date">{fmtShortYear(new Date(x.at).getTime())}</span>
                <span className="fx-exhist-sets">
                  {describeLastSets(x.sets).replace(/ × 0 kg/g, '×')}
                </span>
                {x.deltaKg !== null && x.deltaKg !== 0 && (
                  <span className={x.deltaKg > 0 ? 'fx-delta up' : 'fx-delta down'}>
                    {x.deltaKg > 0 ? '▲ +' : '▼ −'}
                    {kgText(Math.abs(x.deltaKg))} kg
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}

      {oneRm.length >= 2 && oneRmLast.best1RM !== null && (
        <details className="fx-exhist fx-onerm" open>
          <summary>
            <Icon name="clock" size={14} /> 1RM-Verlauf (geschätzt)
          </summary>
          <p className="fx-onerm-now">
            <strong>{fmtKg(oneRmLast.best1RM)}</strong>
            {oneRmDelta !== null && oneRmDelta !== 0 && (
              <span className={oneRmDelta > 0 ? 'fx-delta up' : 'fx-delta down'}>
                {oneRmDelta > 0 ? '▲ +' : '▼ −'}
                {kgText(Math.abs(oneRmDelta))} kg seit {fmtShortYear(oneRmFirst.at)}
              </span>
            )}
          </p>
          <LineChart
            label={`Geschätztes 1RM ${e.name}`}
            format={fmtKg}
            points={oneRm.map((p) => ({
              at: p.at,
              value: p.best1RM as number,
              caption: p.topSet ? `${p.topSet.reps} × ${kgText(p.topSet.weightKg)} kg` : undefined,
            }))}
          />
          <small className="muted">
            Schätzung nach Epley, nur bis 12 Wiederholungen; bei vielen Wiederholungen ungenauer.
          </small>
        </details>
      )}

      <details className="equipment fx-more">
        <summary>
          <Icon name="clock" size={16} /> Mehr · Pause {formatClock(e.restSeconds)}
          {e.equipmentKg ? ` · Stange/Maschine ${formatKg(e.equipmentKg)}` : ''}
        </summary>

        <EquipmentField name={e.name} value={e.equipmentKg} onChange={props.onEquipment} />

        <div className="rest-setting">
          <p className="fx-flabel">Pause</p>
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

        <p className="muted fx-reason">{s.reason}</p>

        {!confirmRemove ? (
          <button type="button" className="textbtn danger" onClick={() => setConfirmRemove(true)}>
            <Icon name="trash" size={16} /> Übung entfernen
          </button>
        ) : (
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
      </details>
    </section>
  );
}
