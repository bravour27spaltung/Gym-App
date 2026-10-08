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
 * Abstand zwischen Unterkante des Layout-Viewports und Unterkante des
 * sichtbaren Viewports. iOS Safari/PWA verschiebt den Layout-Viewport z. B.
 * nach der Tastatur (Wdh.-/Gewichtseingabe) und lässt `position: fixed` dann
 * mitten im Bildschirm hängen. Mit diesem Versatz sitzt der Timer wieder an
 * der sichtbaren Unterkante.
 */
function useViewportBottomOffset(active: boolean): number {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!active || !vv) {
      setOffset(0);
      return;
    }
    const sync = () => {
      const diff = Math.round(window.innerHeight - (vv.offsetTop + vv.height));
      // Unplausible Werte (mehr als der halbe Bildschirm) ignorieren.
      setOffset(Math.abs(diff) > window.innerHeight / 2 ? 0 : diff);
    };
    // iOS meldet das Schließen der Tastatur nicht immer per Event.
    const syncLater = () => {
      sync();
      window.setTimeout(sync, 350);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    window.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('orientationchange', syncLater);
    document.addEventListener('focusout', syncLater);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
      window.removeEventListener('scroll', sync);
      window.removeEventListener('orientationchange', syncLater);
      document.removeEventListener('focusout', syncLater);
    };
  }, [active]);

  return offset;
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

  const bottomOffset = useViewportBottomOffset(endsAt !== null);
  const left = endsAt === null ? 0 : remainingSeconds(endsAt, now);

  useEffect(() => {
    if (endsAt !== null && left === 0 && beeped.current !== endsAt) {
      beeped.current = endsAt;
      beep();
    }
  }, [endsAt, left]);

  if (endsAt === null) return null;

  return (
    <div
      className={left === 0 ? 'timer over' : 'timer'}
      style={bottomOffset !== 0 ? { bottom: bottomOffset } : undefined}
      role="timer"
      aria-live="off"
    >
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
