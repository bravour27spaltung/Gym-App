import { useEffect, useState, type ReactNode } from 'react';
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
  folder: <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />,
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

/** Untere Navigation (Training / Pläne). */
export function TabBar(props: {
  active: 'home' | 'plans';
  onChange: (tab: 'home' | 'plans') => void;
}) {
  const tabs: { key: 'home' | 'plans'; label: string; icon: IconName }[] = [
    { key: 'home', label: 'Training', icon: 'dumbbell' },
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
