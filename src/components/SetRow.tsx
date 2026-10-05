import { useEffect, useRef } from 'react';
import { fmtShortYear } from '../lib/format';
import type { LoggedSet } from '../lib/progression';
import type { SetHistoryEntry } from '../lib/stats';
import { composeWeight, formatKg, kgText, splitWeight, totalLoad, type Fraction } from '../lib/weight';
import type { DraftSet } from '../lib/workout';
import { Icon, NumberInput, WheelPicker } from './ui';

/** Nachkommastellen-Optionen als Rad, zweistellig ("00", "25", "50", "75"). */
const FRACTION_STEPS = { min: 0, max: 75, step: 25 } as const;

function setLabel(set: DraftSet, index: number): string {
  return set.type === 'warmup' ? `Aufwärmsatz ${index}` : `Satz ${index}`;
}

function previousText(previous: LoggedSet | null): string | null {
  return previous ? `${previous.reps} × ${kgText(previous.weightKg)} kg` : null;
}

/** "31.08.26  7 × 5,00 kg" bzw. ohne Gewicht nur "31.08.26  10×". */
function historyLine(entry: SetHistoryEntry): string {
  const date = fmtShortYear(new Date(entry.at).getTime());
  return entry.weightKg > 0 ? `${date} · ${entry.reps} × ${kgText(entry.weightKg)} kg` : `${date} · ${entry.reps}×`;
}

/** Ganze Kilo und Bruchteil getrennt; Werte außerhalb des 0,25-Rasters fallen auf "ganz" zurück. */
function safeSplit(kg: number): { wholeKg: number; fraction: Fraction } {
  try {
    return splitWeight(kg);
  } catch {
    return { wholeKg: Math.floor(kg), fraction: 0 };
  }
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
  const prev = previousText(previous);
  return (
    <li>
      <button
        type="button"
        className={`fx-line ${warm ? 'warm' : ''} ${set.done ? 'done' : ''}`}
        aria-label={`${setLabel(set, index)}: ${set.weightKg > 0 ? formatKg(set.weightKg) : 'kein Gewicht'}, ${set.reps} Wiederholungen${
          set.done ? ', erledigt' : ''
        }. Zum Bearbeiten tippen`}
        onClick={onSelect}
      >
        <span className="fx-badge">{warm ? `W${index}` : index}</span>
        <span className="fx-val">
          {set.reps} × {set.weightKg > 0 ? kgText(set.weightKg) : '–'} kg
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
  onToggle,
  onClose,
  onToggleType,
  onRemove,
}: EditorProps) {
  const ref = useRef<HTMLLIElement>(null);
  const warm = set.type === 'warmup';
  const label = setLabel(set, index);
  const prev = previousText(previous);
  const { wholeKg, fraction } = safeSplit(set.weightKg);
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

      <div className="fx-field">
        <span className="fx-flabel">Gewicht</span>
        <div className="fx-weightwheels">
          <WheelPicker
            label={`${label}: ganze Kilo`}
            value={wholeKg}
            min={0}
            max={250}
            step={1}
            onCommit={(w) => onWeight(composeWeight(w, fraction))}
          />
          <span className="wheel-sep" aria-hidden="true">
            ,
          </span>
          <WheelPicker
            label={`${label}: Nachkommastellen`}
            value={fraction * 100}
            min={FRACTION_STEPS.min}
            max={FRACTION_STEPS.max}
            step={FRACTION_STEPS.step}
            format={(n) => String(n).padStart(2, '0')}
            onCommit={(f) => onWeight(composeWeight(wholeKg, (f / 100) as Fraction))}
          />
          <span className="wheel-unit" aria-hidden="true">
            kg
          </span>
        </div>
        {showTotal && <small className="fx-total">Σ {formatKg(totalLoad(set.weightKg, equipmentKg))} inkl. Stange/Maschine</small>}
      </div>

      <div className="fx-field">
        <span className="fx-flabel">Wiederholungen</span>
        <div className="fx-stepper">
          <button
            type="button"
            aria-label={`${label}: eine Wiederholung weniger`}
            disabled={set.reps <= 0}
            onClick={() => onReps(Math.max(0, set.reps - 1))}
          >
            −
          </button>
          <div className="fx-input">
            <NumberInput
              kind="int"
              className="bigin"
              label={`${label}: Wiederholungen`}
              value={set.reps}
              onCommit={onReps}
            />
          </div>
          <button
            type="button"
            aria-label={`${label}: eine Wiederholung mehr`}
            onClick={() => onReps(Math.min(999, set.reps + 1))}
          >
            +
          </button>
        </div>
      </div>

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
