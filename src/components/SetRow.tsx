import { useEffect, useRef } from 'react';
import { fmtShortYear } from '../lib/format';
import type { LoggedSet } from '../lib/progression';
import type { SetHistoryEntry } from '../lib/stats';
import { formatClock } from '../lib/timer';
import { formatKg, kgText, totalLoad } from '../lib/weight';
import type { DraftSet } from '../lib/workout';
import { SetTimer } from './SetTimer';
import { Icon, WheelPicker } from './ui';

/** Gewichtsrad in halben Kilo: "7,0", "7,5", "8,0" ... */
const WEIGHT_WHEEL = { min: 0, max: 250, step: 0.5 } as const;
/** Wiederholungsrad: 0 bis 100. */
const REPS_WHEEL = { min: 0, max: 100, step: 1 } as const;

function weightWheelText(kg: number): string {
  return kg.toFixed(1).replace('.', ',');
}

function setLabel(set: DraftSet, index: number): string {
  return set.type === 'warmup' ? `Aufwärmsatz ${index}` : `Satz ${index}`;
}

/** Zeit-Satz als Text: "0:45" bzw. "0:45 · 10 kg"; Wdh.-Satz: "12 × 50 kg". */
function timedText(seconds: number, weightKg: number): string {
  return weightKg > 0 ? `${formatClock(seconds)} · ${kgText(weightKg)} kg` : formatClock(seconds);
}

function previousText(previous: LoggedSet | null): string | null {
  if (!previous) return null;
  return previous.durationSeconds != null
    ? timedText(previous.durationSeconds, previous.weightKg)
    : `${previous.reps} × ${kgText(previous.weightKg)} kg`;
}

/** "31.08.26  7 × 5,00 kg" bzw. ohne Gewicht nur "31.08.26  10×". */
function historyLine(entry: SetHistoryEntry): string {
  const date = fmtShortYear(new Date(entry.at).getTime());
  if (entry.durationSeconds != null) return `${date} · ${timedText(entry.durationSeconds, entry.weightKg)}`;
  return entry.weightKg > 0 ? `${date} · ${entry.reps} × ${kgText(entry.weightKg)} kg` : `${date} · ${entry.reps}×`;
}

interface LineProps {
  index: number;
  set: DraftSet;
  previous: LoggedSet | null;
  /** Ziel für diesen Satz, z. B. "12 × 51,25 kg"; null bei Aufwärmsätzen oder ohne Vorgabe. */
  target?: string | null;
  onSelect: () => void;
}

/**
 * Ein Satz als schmale, nur lesbare Zeile. Ein Tipp macht ihn zum aktiven Satz und
 * öffnet den Editor (auch bei bereits erledigten Sätzen, zum Korrigieren).
 */
export function SetLine({ index, set, previous, target = null, onSelect }: LineProps) {
  const warm = set.type === 'warmup';
  const timed = set.durationSeconds != null;
  const prev = previousText(previous);
  return (
    <li>
      <button
        type="button"
        className={`fx-line ${warm ? 'warm' : ''} ${set.done ? 'done' : ''}`}
        aria-label={`${setLabel(set, index)}: ${set.weightKg > 0 ? formatKg(set.weightKg) : 'kein Gewicht'}, ${
          timed ? `${set.durationSeconds} Sekunden` : `${set.reps} Wiederholungen`
        }${set.done ? ', erledigt' : ''}. Zum Bearbeiten tippen`}
        onClick={onSelect}
      >
        <span className="fx-badge">{warm ? `W${index}` : index}</span>
        <span className="fx-val">
          {timed ? (
            timedText(set.durationSeconds ?? 0, set.weightKg)
          ) : (
            <>
              {set.reps} × {set.weightKg > 0 ? kgText(set.weightKg) : '–'} kg
            </>
          )}
        </span>
        {!set.done && (target || prev) && (
          <span className="fx-meta">
            {target && <span className="fx-target">Ziel {target}</span>}
            {prev && <span className="fx-prev">vorher {prev}</span>}
          </span>
        )}
        <span className={set.done ? 'fx-state on' : 'fx-state'} aria-hidden="true">
          <Icon name={set.done ? 'check' : 'pencil'} size={set.done ? 20 : 16} />
        </span>
      </button>
    </li>
  );
}

interface EditorProps {
  index: number;
  set: DraftSet;
  previous: LoggedSet | null;
  /** Ziel für diesen Satz, z. B. "12 × 51,25 kg"; null bei Aufwärmsätzen oder ohne Vorgabe. */
  target?: string | null;
  /** Bisherige Werte dieser genauen Satz-Position, neueste zuerst. */
  history: SetHistoryEntry[];
  equipmentKg: number | null;
  onWeight: (kg: number) => void;
  onReps: (reps: number) => void;
  /** Zeit in Sekunden setzen; null = zurück zu Wiederholungen. */
  onDuration: (seconds: number | null) => void;
  /** Abschließen (offener Satz) bzw. Umschalten auf "offen" (erledigter Satz). */
  onToggle: () => void;
  /** Editor schließen, ohne den Erledigt-Status zu ändern. */
  onClose: () => void;
  onToggleType: () => void;
  onRemove: () => void;
}

/** Der aktive Satz: große Felder für Gewicht und Wiederholungen und ein großer Haupt-Button. */
export function SetEditor({
  index,
  set,
  previous,
  target = null,
  history,
  equipmentKg,
  onWeight,
  onReps,
  onDuration,
  onToggle,
  onClose,
  onToggleType,
  onRemove,
}: EditorProps) {
  const ref = useRef<HTMLLIElement>(null);
  const warm = set.type === 'warmup';
  const label = setLabel(set, index);
  const prev = previousText(previous);
  const timed = set.durationSeconds != null;
  const showTotal = equipmentKg !== null && equipmentKg > 0 && set.weightKg > 0;

  // Beim Wechsel des aktiven Satzes in den sichtbaren Bereich holen (nicht beim ersten Öffnen
  // des Bildschirms, damit dort Übungsname und Empfehlung oben sichtbar bleiben).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [set.id]);

  return (
    <li ref={ref} className={`fx-editor ${warm ? 'warm' : ''}`} aria-label={`${label} bearbeiten`}>
      <div className="fx-editor-head">
        <strong>{label}</strong>
        {(target || prev) && (
          <span className="fx-meta right">
            {target && <span className="fx-target">Ziel {target}</span>}
            {prev && <span className="fx-prev">Vorher {prev}</span>}
          </span>
        )}
      </div>

      <div className={timed ? undefined : 'fx-wheelrow'}>
        <div className="fx-field">
          <span className="fx-flabel">Gewicht</span>
          <div className="fx-weightwheels">
            <WheelPicker
              className="wide"
              label={`${label}: Gewicht in kg`}
              value={set.weightKg}
              min={WEIGHT_WHEEL.min}
              max={WEIGHT_WHEEL.max}
              step={WEIGHT_WHEEL.step}
              format={weightWheelText}
              onCommit={onWeight}
            />
            <span className="wheel-unit" aria-hidden="true">
              kg
            </span>
          </div>
        </div>

        <div className="fx-field">
          <div className="fx-modehead">
            {timed && <span className="fx-flabel">Zeit</span>}
            <div className="chips sm" role="group" aria-label={`${label}: Erfassung`}>
              <button
                type="button"
                className={timed ? 'chip' : 'chip on'}
                aria-pressed={!timed}
                onClick={() => timed && onDuration(null)}
              >
                Wdh.
              </button>
              <button
                type="button"
                className={timed ? 'chip on' : 'chip'}
                aria-pressed={timed}
                onClick={() => !timed && onDuration(previous?.durationSeconds ?? 30)}
              >
                Zeit
              </button>
            </div>
          </div>
          {timed ? (
            <SetTimer
              label={`${label}: Zeit`}
              seconds={set.durationSeconds ?? 0}
              targetSeconds={previous?.durationSeconds ?? null}
              onChange={onDuration}
            />
          ) : (
            <div className="fx-weightwheels">
              <WheelPicker
                label={`${label}: Wiederholungen`}
                value={set.reps}
                min={REPS_WHEEL.min}
                max={REPS_WHEEL.max}
                step={REPS_WHEEL.step}
                onCommit={onReps}
              />
            </div>
          )}
        </div>
      </div>
      {showTotal && <small className="fx-total">Σ {formatKg(totalLoad(set.weightKg, equipmentKg))} inkl. Stange/Maschine</small>}

      {history.length > 0 && (
        <details className="fx-history">
          <summary>
            <Icon name="clock" size={14} /> Verlauf · {history.length}×
          </summary>
          <ul>
            {history.map((h) => (
              <li key={h.at}>{historyLine(h)}</li>
            ))}
          </ul>
        </details>
      )}

      {set.done ? (
        <>
          <button type="button" className="btn primary block fx-go" onClick={onClose}>
            Übernehmen
          </button>
          <button type="button" className="btn block" onClick={onToggle}>
            Als offen markieren
          </button>
        </>
      ) : (
        <button type="button" className="btn primary block fx-go" onClick={onToggle}>
          <Icon name="check" size={22} /> {warm ? 'Aufwärmsatz erledigt' : 'Satz abschließen'}
        </button>
      )}

      <div className="fx-editor-foot">
        <button type="button" className="textbtn" onClick={onToggleType}>
          {warm ? 'Als Arbeitssatz' : 'Als Aufwärmsatz'}
        </button>
        <button type="button" className="textbtn danger" onClick={onRemove}>
          <Icon name="trash" size={16} /> Entfernen
        </button>
      </div>
    </li>
  );
}
