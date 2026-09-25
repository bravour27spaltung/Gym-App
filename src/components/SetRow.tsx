import { useState } from 'react';
import type { LoggedSet } from '../lib/progression';
import { formatKg, kgText, totalLoad } from '../lib/weight';
import type { DraftSet } from '../lib/workout';
import { Icon, NumberInput } from './ui';

interface Props {
  index: number;
  set: DraftSet;
  /** Entsprechender Satz vom letzten Training (Anzeige "Vorher"). */
  previous: LoggedSet | null;
  equipmentKg: number | null;
  onWeight: (kg: number) => void;
  onReps: (reps: number) => void;
  onToggle: () => void;
  onToggleType: () => void;
  onRemove: () => void;
}

/**
 * Ein Satz als Tabellenzeile: Nummer | Vorher | kg | Wdh. | Haken.
 * Gewicht und Wiederholungen tippst du direkt ein. Ein Tipp auf die Nummer öffnet
 * "Aufwärmsatz/Arbeitssatz" und "Entfernen".
 */
export function SetRow({
  index,
  set,
  previous,
  equipmentKg,
  onWeight,
  onReps,
  onToggle,
  onToggleType,
  onRemove,
}: Props) {
  const [menu, setMenu] = useState(false);
  const warm = set.type === 'warmup';
  const label = warm ? `Aufwärmsatz ${index}` : `Satz ${index}`;
  const showTotal = equipmentKg !== null && equipmentKg > 0 && set.weightKg > 0;

  return (
    <li className={`setrow ${warm ? 'warm' : ''} ${set.done ? 'done' : ''}`}>
      <div className="setgrid">
        <button
          type="button"
          className="setbadge"
          aria-expanded={menu}
          aria-label={`${label}: Optionen`}
          onClick={() => setMenu(!menu)}
        >
          {warm ? `W${index}` : index}
        </button>
        <span className="prev">
          {previous ? `${kgText(previous.weightKg)} × ${previous.reps}` : '–'}
        </span>
        <div className="wcell">
          <NumberInput
            kind="kg"
            blankZero={!set.done}
            placeholder="0"
            label={`${label}: Gewicht in kg`}
            value={set.weightKg}
            onCommit={onWeight}
          />
          {showTotal && <small>Σ {formatKg(totalLoad(set.weightKg, equipmentKg))}</small>}
        </div>
        <NumberInput
          kind="int"
          label={`${label}: Wiederholungen`}
          value={set.reps}
          onCommit={onReps}
        />
        <button
          type="button"
          className={set.done ? 'check on' : 'check'}
          aria-pressed={set.done}
          aria-label={`${label} erledigt`}
          onClick={onToggle}
        >
          <Icon name="check" size={22} />
        </button>
      </div>

      {menu && (
        <div className="setmenu">
          <button
            type="button"
            className="textbtn"
            onClick={() => {
              onToggleType();
              setMenu(false);
            }}
          >
            {warm ? 'Als Arbeitssatz markieren' : 'Als Aufwärmsatz markieren'}
          </button>
          <button type="button" className="textbtn danger" onClick={onRemove}>
            <Icon name="trash" size={16} /> Entfernen
          </button>
        </div>
      )}
    </li>
  );
}
