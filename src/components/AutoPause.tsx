import { useEffect, useRef, useState } from 'react';
import { beep } from '../lib/sound';
import { formatClock, remainingSeconds, startRest } from '../lib/timer';

interface Props {
  /** Dauer der automatischen Pause in Sekunden. */
  seconds: number;
  /** Wird nach Ablauf oder bei "Überspringen" genau einmal aufgerufen. */
  onDone: () => void;
}

/**
 * Automatische Kurzpause zwischen zwei Dehn-Durchgängen (Seitenwechsel, nächster
 * Satz, nächste Übung aus der Vorlage). Wie RestTimer rechnet sie aus dem
 * Endzeitpunkt, damit ein gesperrtes iPhone die Anzeige nicht verfälscht.
 */
export function AutoPause({ seconds, onDone }: Props) {
  const [endsAt] = useState(() => startRest(Date.now(), seconds));
  const [now, setNow] = useState(() => Date.now());
  const finished = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const left = remainingSeconds(endsAt, now);

  function done(withBeep: boolean) {
    if (finished.current) return;
    finished.current = true;
    if (withBeep) beep();
    onDone();
  }

  useEffect(() => {
    if (left === 0) done(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  return (
    <div className="timer hold" role="timer" aria-live="off">
      <span className="clock">Pause {formatClock(left)}</span>
      <button type="button" className="btn small" onClick={() => done(false)}>
        Überspringen
      </button>
    </div>
  );
}
