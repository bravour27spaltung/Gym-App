import { useState } from 'react';
import { formatKg, totalLoad } from '../lib/weight';
import type { DraftSet } from '../lib/workout';
import { WeightPicker } from './WeightPicker';

interface Props {
  index: number;
  set: DraftSet;
  equipmentKg: number | null;
  onChange: (patch: Partial<Pick<DraftSet, 'weightKg' | 'reps' | 'rir'>>) => void;
  onToggle: () => void;
  onRemove: () => void;
  onCopyWeight: () => void;
}

const RIR_VALUES = [0, 1, 2, 3, 4];

/**
 * Ein Satz als einzelne Zeile: Nummer, "52,5 kg × 8", Haken.
 * Ein Tipp auf den Haken übernimmt die vorbelegten Werte. Nur wer etwas ändern
 * will, klappt die Zeile auf.
 */
export function SetRow({
  index,
  set,
  equipmentKg,
  onChange,
  onToggle,
  onRemove,
  onCopyWeight,
}: Props) {
  const warm = set.type === 'warmup';
  const label = warm ? `Aufwärmsatz ${index}` : `Satz ${index}`;
  // Ohne Gewicht (z. B. neue Übung) ist Abhaken sinnlos: dann ist die Zeile aufgeklappt.
  // Sobald du selbst etwas bedienst (auf-/zuklappen, ändern), gilt deine Wahl.
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? (set.weightKg === 0 && !set.done);
  const change: Props['onChange'] = (patch) => {
    setManual(true);
    onChange(patch);
  };

  const weightText = String(set.weightKg).replace('.', ',');

  return (
    <li className={`set compact ${warm ? 'warm' : ''} ${set.done ? 'done' : ''}`}>
      <div className="set-line">
        <button
          type="button"
          className="set-main"
          aria-expanded={open}
          aria-label={`${label} bearbeiten: ${weightText} kg, ${set.reps} Wiederholungen`}
          onClick={() => setManual(!open)}
        >
          <span className="badge">{warm ? `W${index}` : index}</span>
          <span className="summary">
            {weightText} kg × {set.reps}
          </span>
          {set.rir !== null && <span className="tag">RIR {set.rir}</span>}
          {equipmentKg !== null && (
            <span className="tag">Σ {formatKg(totalLoad(set.weightKg, equipmentKg))}</span>
          )}
        </button>
        <button
          type="button"
          className={set.done ? 'check on' : 'check'}
          aria-pressed={set.done}
          aria-label={`${label} erledigt`}
          onClick={() => {
            if (!set.done) setManual(false);
            onToggle();
          }}
        >
          ✓
        </button>
      </div>

      {open && (
        <div className="set-edit">
          <WeightPicker
            label={`${label} Gewicht`}
            value={set.weightKg}
            onChange={(kg) => change({ weightKg: kg })}
          />

          <div className="row wrap">
            <div className="stepper">
              <button
                type="button"
                className="step"
                aria-label={`${label}: eine Wiederholung weniger`}
                onClick={() => change({ reps: Math.max(0, set.reps - 1) })}
              >
                −
              </button>
              <input
                className="num"
                type="number"
                inputMode="numeric"
                min={0}
                value={set.reps}
                aria-label={`${label}: Wiederholungen`}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) =>
                  change({ reps: Math.max(0, parseInt(e.target.value || '0', 10)) })
                }
              />
              <button
                type="button"
                className="step"
                aria-label={`${label}: eine Wiederholung mehr`}
                onClick={() => change({ reps: set.reps + 1 })}
              >
                +
              </button>
              <span className="unit">Wdh.</span>
            </div>

            {!warm && (
              <div
                className="chips"
                role="radiogroup"
                aria-label={`${label}: Wiederholungen in Reserve`}
              >
                <span className="unit">RIR</span>
                {RIR_VALUES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={set.rir === r}
                    className={set.rir === r ? 'chip on' : 'chip'}
                    onClick={() => change({ rir: set.rir === r ? null : r })}
                  >
                    {r}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="row wrap">
            <button type="button" className="link" onClick={onCopyWeight}>
              Gewicht für folgende Sätze
            </button>
            <button type="button" className="link" onClick={onRemove}>
              Satz entfernen
            </button>
            <button type="button" className="link" onClick={() => setManual(false)}>
              Zuklappen
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
