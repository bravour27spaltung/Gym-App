import { useEffect, useRef, useState } from 'react';
import { beep, unlockAudio } from '../lib/sound';
import { formatClock } from '../lib/timer';

interface Props {
  /** Aktuell eingetragene Zeit des Satzes in Sekunden. */
  seconds: number;
  /** Zeit vom letzten Mal; löst beim Erreichen einen Signalton aus. null = kein Ziel. */
  targetSeconds: number | null;
  label: string;
  onChange: (seconds: number) => void;
}

const STEP = 5;
const MAX_SECONDS = 3600;

/**
 * Stoppuhr für einen Zeit-Satz (z. B. Plank). Läuft aufwärts ab "Start", rechnet über den
 * Startzeitpunkt statt über einen Zähler (ein gesperrtes iPhone verfälscht nichts) und
 * schreibt die laufende Zeit jede Sekunde in den Satz. So steht auch beim direkten
 * "Satz abschließen" während der Uhr die richtige Zeit im Satz. Mit −/+ lässt sich die Zeit
 * von Hand korrigieren, falls die Uhr vergessen wurde.
 */
export function SetTimer({ seconds, targetSeconds, label, onChange }: Props) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const beeped = useRef(false);
  const running = startedAt !== null;

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 250);
    const onVisible = () => setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running]);

  const elapsed = running ? Math.min(MAX_SECONDS, Math.max(0, Math.floor((now - startedAt) / 1000))) : seconds;

  useEffect(() => {
    if (running && elapsed > 0 && elapsed !== seconds) onChange(elapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, elapsed]);

  useEffect(() => {
    if (running && targetSeconds !== null && elapsed >= targetSeconds && !beeped.current) {
      beeped.current = true;
      beep();
    }
  }, [running, elapsed, targetSeconds]);

  function start() {
    unlockAudio();
    beeped.current = false;
    setNow(Date.now());
    setStartedAt(Date.now());
  }

  return (
    <div className={running ? 'fx-timer running' : 'fx-timer'} role="timer" aria-live="off" aria-label={label}>
      <div className="fx-timer-row">
        <button
          type="button"
          aria-label={`${label}: ${STEP} Sekunden weniger`}
          disabled={running || seconds <= STEP}
          onClick={() => onChange(Math.max(1, seconds - STEP))}
        >
          −
        </button>
        <span className="fx-timer-clock">{formatClock(elapsed)}</span>
        <button
          type="button"
          aria-label={`${label}: ${STEP} Sekunden mehr`}
          disabled={running}
          onClick={() => onChange(Math.min(MAX_SECONDS, seconds + STEP))}
        >
          +
        </button>
      </div>
      {running ? (
        <button type="button" className="btn block" onClick={() => setStartedAt(null)}>
          Stopp
        </button>
      ) : (
        <button type="button" className="btn primary block" onClick={start}>
          {seconds > 0 ? 'Neu starten' : 'Start'}
        </button>
      )}
    </div>
  );
}
