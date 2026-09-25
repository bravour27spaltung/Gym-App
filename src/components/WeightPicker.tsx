import { FRACTIONS, composeWeight, splitWeight, type Fraction } from '../lib/weight';

interface Props {
  value: number;
  onChange: (kg: number) => void;
  label: string;
}

const FRACTION_LABEL: Record<Fraction, string> = {
  0: ',00',
  0.25: ',25',
  0.5: ',50',
  0.75: ',75',
};

function safeSplit(kg: number): { wholeKg: number; fraction: Fraction } {
  try {
    return splitWeight(kg);
  } catch {
    return { wholeKg: 0, fraction: 0 };
  }
}

/**
 * Gewichtsauswahl: ganze Kilo in Einzelschritten, dahinter 0 / 0,25 / 0,5 / 0,75.
 */
export function WeightPicker({ value, onChange, label }: Props) {
  const { wholeKg, fraction } = safeSplit(value);
  const setWhole = (n: number) =>
    onChange(composeWeight(Math.max(0, Math.min(999, Math.round(n))), fraction));

  return (
    <div className="weight" role="group" aria-label={label}>
      <div className="stepper">
        <button
          type="button"
          className="step"
          aria-label={`${label}: 1 kg weniger`}
          onClick={() => setWhole(wholeKg - 1)}
        >
          −
        </button>
        <input
          className="num"
          type="number"
          inputMode="numeric"
          min={0}
          max={999}
          step={1}
          value={wholeKg}
          aria-label={`${label}: ganze Kilo`}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setWhole(parseInt(e.target.value || '0', 10))}
        />
        <button
          type="button"
          className="step"
          aria-label={`${label}: 1 kg mehr`}
          onClick={() => setWhole(wholeKg + 1)}
        >
          +
        </button>
        <span className="unit">kg</span>
      </div>
      <div className="chips" role="radiogroup" aria-label={`${label}: Nachkomma`}>
        {FRACTIONS.map((f) => (
          <button
            key={f}
            type="button"
            role="radio"
            aria-checked={f === fraction}
            className={f === fraction ? 'chip on' : 'chip'}
            onClick={() => onChange(composeWeight(wholeKg, f))}
          >
            {FRACTION_LABEL[f]}
          </button>
        ))}
      </div>
    </div>
  );
}
