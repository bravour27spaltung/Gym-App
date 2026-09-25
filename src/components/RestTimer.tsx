import { useEffect, useRef, useState } from 'react';
import { beep } from '../lib/sound';
import { formatClock, remainingSeconds } from '../lib/timer';

interface Props {
  /** Endzeitpunkt der Pause in ms (Date.now()-Zeit); null = keine Pause aktiv. */
  endsAt: number | null;
  onAdd: (seconds: number) => void;
  onStop: () => void;
}

/**
 * Pausentimer. Er rechnet immer aus dem Endzeitpunkt, nicht aus einem
 * mitlaufenden Zähler. Nach dem Sperren des iPhones stimmt die Anzeige deshalb
 * sofort wieder.
 */
export function RestTimer({ endsAt, onAdd, onStop }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const beeped = useRef<number | null>(null);

  useEffect(() => {
    if (endsAt === null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [endsAt]);

  const left = endsAt === null ? 0 : remainingSeconds(endsAt, now);

  useEffect(() => {
    if (endsAt !== null && left === 0 && beeped.current !== endsAt) {
      beeped.current = endsAt;
      beep();
    }
  }, [endsAt, left]);

  if (endsAt === null) return null;

  return (
    <div className={left === 0 ? 'timer over' : 'timer'} role="timer" aria-live="off">
      <span className="clock">{left === 0 ? 'Pause vorbei' : formatClock(left)}</span>
      <button type="button" className="btn small" onClick={() => onAdd(15)}>
        +15 s
      </button>
      <button type="button" className="btn small" onClick={onStop}>
        Beenden
      </button>
    </div>
  );
}
