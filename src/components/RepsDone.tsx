interface Props {
  /** Ziel-Wiederholungen dieses Durchgangs. */
  reps: number;
  onFinish: (reps: number) => void;
  onCancel: () => void;
}

/**
 * Abschluss für Dehn- und Mobility-Übungen mit Wiederholungen statt Haltezeit:
 * kein Timer, nur die Zielzahl und ein Knopf "Abgeschlossen".
 */
export function RepsDone({ reps, onFinish, onCancel }: Props) {
  return (
    <div className="timer hold reps" role="group" aria-label="Wiederholungen">
      <span className="clock">{reps} Wdh.</span>
      <div className="row wrap">
        <button type="button" className="btn small" onClick={onCancel}>
          Abbrechen
        </button>
        <button type="button" className="btn primary small" onClick={() => onFinish(reps)}>
          Abgeschlossen
        </button>
      </div>
    </div>
  );
}
