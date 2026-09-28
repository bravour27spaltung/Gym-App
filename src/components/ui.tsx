import { useEffect, useRef, useState, type ReactNode } from 'react';
import { kgText, parseKg, roundKg } from '../lib/weight';

/** Kleine Symbole (24-px-Raster, Linien), ohne externe Bibliothek. */
const PATHS = {
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  check: <path d="M20 6 9 17l-5-5" />,
  back: <path d="m15 18-6-6 6-6" />,
  forward: <path d="m9 18 6-6-6-6" />,
  down: <path d="m6 9 6 6 6-6" />,
  up: <path d="m18 15-6-6-6 6" />,
  'arrow-up': <path d="M12 19V5M5 12l7-7 7 7" />,
  'arrow-down': <path d="M12 5v14M19 12l-7 7-7-7" />,
  trash: (
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </>
  ),
  dumbbell: <path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />,
  flame: (
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  ),
  note: (
    <>
      <path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3Z" />
      <path d="M15 3v6h6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </>
  ),
  play: <path d="m7 4 13 8-13 8V4z" />,
  pencil: <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
  chart: <path d="M4 20h16M7 20v-7M12 20V6M17 20v-10" />,
  trophy: (
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  ),
  trend: <path d="m22 7-8.5 8.5-5-5L2 17M16 7h6v6" />,
  table: <path d="M3 5h18v14H3zM3 10h18M9 5v14" />,
  folder: <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
  football: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 6.8 3.4 2.5-1.3 4.1H9.9l-1.3-4.1Z" />
      <path d="M12 6.8V3.5M15.4 9.3l3.3-1.1M14.1 13.4l2 3.3M9.9 13.4l-2 3.3M8.6 9.3l-3.3-1.1" />
    </>
  ),
  heart: (
    <path d="M20.8 8.6c0 4.5-4.8 7.7-8.8 10.8-4-3.1-8.8-6.3-8.8-10.8a4.9 4.9 0 0 1 8.8-3 4.9 4.9 0 0 1 8.8 3Z" />
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}

/** Runder Symbol-Button mit Textalternative für Screenreader. */
export function IconButton(props: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'accent' | 'danger';
  size?: number;
}) {
  return (
    <button
      type="button"
      className={`iconbtn ${props.tone && props.tone !== 'default' ? props.tone : ''}`}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon name={props.icon} size={props.size} />
    </button>
  );
}

/** Zahl mit Minus und Plus, für Sätze und Wiederholungen. */
export function Stepper(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const { value, min, max } = props;
  const set = (n: number) => props.onChange(Math.max(min, Math.min(max, n)));
  return (
    <div className="stepper2" role="group" aria-label={props.label}>
      <button
        type="button"
        aria-label={`${props.label}: weniger`}
        disabled={value <= min}
        onClick={() => set(value - 1)}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={Number.isFinite(value) ? value : ''}
        aria-label={props.label}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          props.onChange(Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : NaN);
        }}
      />
      <button
        type="button"
        aria-label={`${props.label}: mehr`}
        disabled={value >= max}
        onClick={() => set(value + 1)}
      >
        +
      </button>
    </div>
  );
}

/** Schalter (an/aus) als Button mit role="switch". */
export function Switch(props: { label: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      className={props.checked ? 'switch on' : 'switch'}
      onClick={() => props.onChange(!props.checked)}
    >
      <span />
    </button>
  );
}

/** Feste Kopfleiste eines Bildschirms mit Zurück-Knopf, Titel und einer Hauptaktion. */
export function AppBar(props: {
  title: string;
  onBack: () => void;
  backIcon?: 'x' | 'back';
  backLabel: string;
  action?: { label: string; onClick: () => void; disabled?: boolean };
}) {
  return (
    <header className="appbar">
      <IconButton icon={props.backIcon ?? 'back'} label={props.backLabel} onClick={props.onBack} />
      <h1>{props.title}</h1>
      {props.action ? (
        <button
          type="button"
          className="btn primary compact"
          disabled={props.action.disabled}
          onClick={props.action.onClick}
        >
          {props.action.label}
        </button>
      ) : (
        <span className="appbar-spacer" />
      )}
    </header>
  );
}

export type Tab = 'home' | 'stretch' | 'football' | 'recovery' | 'history' | 'plans';

/** Untere Navigation (Training / Stretching / Fußball / Recovery / Verlauf / Pläne). */
export function TabBar(props: { active: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: IconName }[] = [
    { key: 'home', label: 'Training', icon: 'dumbbell' },
    { key: 'stretch', label: 'Stretching', icon: 'flame' },
    { key: 'football', label: 'Fußball', icon: 'football' },
    { key: 'recovery', label: 'Recovery', icon: 'heart' },
    { key: 'history', label: 'Verlauf', icon: 'chart' },
    { key: 'plans', label: 'Pläne', icon: 'list' },
  ];
  return (
    <nav className="tabbar" aria-label="Hauptnavigation">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          className={props.active === t.key ? 'tab on' : 'tab'}
          aria-current={props.active === t.key ? 'page' : undefined}
          onClick={() => props.onChange(t.key)}
        >
          <Icon name={t.icon} size={24} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}

/**
 * Zahlenfeld zum direkten Eintippen (Gewicht in kg oder ganze Zahl). Gültige Zwischenstände
 * werden sofort übernommen, damit ein Tipp auf den Haken direkt danach schon den neuen Wert
 * speichert. Beim Verlassen wird auf das 0,25-kg-Raster gerundet.
 */
export function NumberInput(props: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  kind: 'kg' | 'int';
  /** 0 als leeres Feld mit Platzhalter zeigen (noch nicht eingetragen). */
  blankZero?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const { value, kind } = props;
  const show = (v: number) => (props.blankZero && v === 0 ? '' : kgText(v));
  const [text, setText] = useState(() => show(value));
  const [focused, setFocused] = useState(false);

  // Wird der Wert von außen geändert (z. B. folgende Sätze ziehen mit), Anzeige nachführen.
  useEffect(() => {
    if (!focused) setText(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const parse = (t: string): number | null => {
    if (kind === 'kg') return t.trim() === '' && props.blankZero ? 0 : parseKg(t);
    return /^\d{1,3}$/.test(t.trim()) ? Number(t.trim()) : null;
  };

  return (
    <input
      className={props.className ?? 'cellinput'}
      type="text"
      inputMode={kind === 'kg' ? 'decimal' : 'numeric'}
      enterKeyHint="done"
      autoComplete="off"
      aria-label={props.label}
      placeholder={props.placeholder}
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parse(e.target.value);
        if (n !== null && n !== value) props.onCommit(n);
      }}
      onBlur={() => {
        setFocused(false);
        const loose = Number(text.trim().replace(',', '.'));
        if (text.trim() !== '' && Number.isFinite(loose)) {
          const n = kind === 'kg' ? roundKg(loose) : Math.min(999, Math.max(0, Math.round(loose)));
          if (n !== value) props.onCommit(n);
          setText(show(n));
        } else {
          setText(show(value));
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

/** Höhe einer Zeile im Zahlenrad (px), auch in styles.css verwendet (.wheel-track height = 3x). */
export const WHEEL_ITEM_H = 44;
const WHEEL_VISIBLE = 3;
const WHEEL_SETTLE_MS = 90;

function clampIndex(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i));
}

/**
 * Zahlenrad zum Scrollen/Ziehen statt Plus-/Minus-Tasten und Texteingabe. Die Mitte
 * zeigt den aktuellen Wert; ein Tipp auf eine andere Zeile springt direkt dorthin.
 * Wird der `value` von außen geändert (z. B. Vorbelegung), richtet sich das Rad neu
 * aus, außer der Nutzer scrollt gerade selbst (sonst würde ein Wisch abgebrochen).
 */
export function WheelPicker(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  onCommit: (n: number) => void;
}) {
  const { label, value, min, max, step, format, onCommit } = props;
  const count = Math.max(1, Math.round((max - min) / step) + 1);
  const valueToIndex = (v: number) => clampIndex(Math.round((v - min) / step), count);
  const indexToValue = (i: number) => Math.round((min + i * step) * 1000) / 1000;

  const trackRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(() => valueToIndex(value));
  const interacting = useRef(false);
  const settleTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (interacting.current) return;
    const i = valueToIndex(value);
    setIndex(i);
    trackRef.current?.scrollTo({ top: i * WHEEL_ITEM_H, behavior: 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, min, max, step]);

  function commitIndex(i: number) {
    const clamped = clampIndex(i, count);
    setIndex(clamped);
    const v = indexToValue(clamped);
    if (v !== value) onCommit(v);
  }

  function handleScroll() {
    interacting.current = true;
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      interacting.current = false;
      const top = trackRef.current?.scrollTop ?? 0;
      commitIndex(Math.round(top / WHEEL_ITEM_H));
    }, WHEEL_SETTLE_MS);
  }

  return (
    <div className="wheel" role="group" aria-label={label}>
      <div className="wheel-highlight" aria-hidden="true" />
      <div
        ref={trackRef}
        className="wheel-track"
        style={{ height: WHEEL_ITEM_H * WHEEL_VISIBLE }}
        onScroll={handleScroll}
      >
        <div className="wheel-pad" style={{ height: WHEEL_ITEM_H }} aria-hidden="true" />
        {Array.from({ length: count }, (_, i) => {
          const v = indexToValue(i);
          const on = i === index;
          return (
            <button
              key={i}
              type="button"
              className={on ? 'wheel-item on' : 'wheel-item'}
              style={{ height: WHEEL_ITEM_H }}
              tabIndex={-1}
              aria-hidden={!on}
              onClick={() => {
                commitIndex(i);
                trackRef.current?.scrollTo({ top: i * WHEEL_ITEM_H, behavior: 'smooth' });
              }}
            >
              {format ? format(v) : String(v)}
            </button>
          );
        })}
        <div className="wheel-pad" style={{ height: WHEEL_ITEM_H }} aria-hidden="true" />
      </div>
    </div>
  );
}

const EQUIPMENT_QUICK = [10, 15, 20];

/** Stangen-/Maschinengewicht: Eingabefeld plus Schnellwahl. Gleich im Plan und im Training. */
export function EquipmentField(props: {
  name: string;
  value: number | null;
  onChange: (kg: number | null) => void;
}) {
  return (
    <>
      <div className="equiprow">
        <span className="equip-label">
          Stange / Maschine
          <small>Eigengewicht, das zum Gewicht dazukommt</small>
        </span>
        <div className="equip-input">
          <NumberInput
            kind="kg"
            blankZero
            placeholder="0"
            label={`${props.name}: Stangen- oder Maschinengewicht in kg`}
            value={props.value ?? 0}
            onCommit={(kg) => props.onChange(kg > 0 ? kg : null)}
          />
          <span className="unit">kg</span>
        </div>
      </div>
      <div className="chips sm equipchips" role="group" aria-label="Häufige Stangen- und Maschinengewichte">
        {EQUIPMENT_QUICK.map((kg) => (
          <button
            key={kg}
            type="button"
            className={props.value === kg ? 'chip on' : 'chip'}
            aria-pressed={props.value === kg}
            onClick={() => props.onChange(props.value === kg ? null : kg)}
          >
            {kg} kg
          </button>
        ))}
      </div>
    </>
  );
}

/**
 * Einfaches Zahlenfeld mit Einheit, für optionale Health-Werte (Distanz, Kalorien,
 * Puls, HRV, Schlafdauer, …). Gemeinsam von Fußball- und Recovery-Formular genutzt.
 */
export function MetricField(props: {
  label: string;
  unit: string;
  value: number | null;
  step?: number;
  onChange: (n: number | null) => void;
}) {
  const [text, setText] = useState(props.value === null ? '' : String(props.value));
  return (
    <div className="field stack">
      <span>{props.label}</span>
      <div className="equip-input">
        <input
          className="cellinput"
          type="number"
          inputMode="decimal"
          step={props.step ?? 1}
          min={0}
          aria-label={props.label}
          placeholder="–"
          value={text}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            setText(e.target.value);
            const n = e.target.value.trim() === '' ? null : Number(e.target.value.replace(',', '.'));
            props.onChange(n !== null && Number.isFinite(n) ? n : null);
          }}
        />
        <span className="unit">{props.unit}</span>
      </div>
    </div>
  );
}

/** Kennzahlen-Kacheln: Beschriftung, großer Wert, optional eine Vergleichszeile. */
export function StatGrid(props: {
  items: { label: string; value: string; sub?: string }[];
  columns?: 2 | 3;
}) {
  return (
    <div className={`stats c${props.columns ?? 3}`}>
      {props.items.map((it) => (
        <div key={it.label} className="stat">
          <span className="stat-label">{it.label}</span>
          <span className="stat-value">{it.value}</span>
          {it.sub && <span className="stat-sub">{it.sub}</span>}
        </div>
      ))}
    </div>
  );
}
