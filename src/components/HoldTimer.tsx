import { useEffect, useRef, useState } from 'react';
import { beep } from '../lib/sound';
import { formatClock, remainingSeconds, startRest } from '../lib/timer';

interface Props {
  /** Ziel-Haltezeit in Sekunden, mit der der Countdown startet. */
  targetSeconds: number;
  onFinish: (actualSeconds: number) => void;
  onCancel: () => void;
}

/**
 * Haltezeit-Timer für eine einzelne Dehnübung. Läuft als Countdown zur Zielzeit
 * (Signalton bei 0), zählt danach als Überzeit weiter, falls länger gehalten wird.
 * "Fertig" beendet und meldet die tatsächlich gehaltene Zeit — wie RestTimer über
 * Zeitstempel statt laufenden Zähler, damit ein gesperrtes iPhone nichts verfälscht.
 */
export function HoldTimer({ targetSeconds, onFinish, onCancel }: Props) {
  const startedAtMs = useRef(Date.now());
  const [endsAt, setEndsAt] = useState(() => startRest(startedAtMs.current, targetSeconds));
  const [now, setNow] = useState(() => Date.now());
  const beeped = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const remaining = remainingSeconds(endsAt, now);
  const elapsed = Math.max(0, Math.round((now - startedAtMs.current) / 1000));
  const over = Math.max(0, elapsed - targetSeconds);

  useEffect(() => {
    if (remaining === 0 && !beeped.current) {
      beeped.current = true;
      beep();
    }
  }, [remaining]);

  function finish() {
    onFinish(Math.max(1, Math.round((Date.now() - startedAtMs.current) / 1000)));
  }

  return (
    <div className={remaining === 0 ? 'timer over hold' : 'timer hold'} role="timer" aria-live="off">
      <span className="clock">{remaining === 0 ? `+${formatClock(over)}` : formatClock(remaining)}</span>
      <div className="row wrap">
        <button type="button" className="btn small" onClick={() => setEndsAt((e) => e + 15000)}>
          +15 s
        </button>
        <button type="button" className="btn small" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="button" className="btn primary small" onClick={finish}>
          Fertig
        </button>
      </div>
    </div>
  );
}
