import { muscleLabel } from '../lib/muscles';
import { num1 } from '../lib/format';
import { WEEKLY_SETS_REFERENCE } from '../lib/stats';

interface Props {
  rows: { muscle: string; sets: number }[];
}

/**
 * Sätze pro Muskel als waagerechte Balken. Eine Reihe, eine Farbe. Der Richtwertbereich
 * (10 bis 20 Sätze pro Woche) liegt als dezentes Band hinter den Balken; alle Werte stehen
 * am Balkenende, es braucht also keine zusätzliche Tabelle.
 */
export function MuscleVolume({ rows }: Props) {
  if (rows.length === 0) return <p className="muted">Noch keine Sätze in diesem Zeitraum.</p>;
  const { min, max } = WEEKLY_SETS_REFERENCE;
  const top = Math.max(max, ...rows.map((r) => r.sets)) * 1.2;
  const pct = (v: number) => `${(v / top) * 100}%`;

  return (
    <div className="musclevol">
      <ul>
        {rows.map((r) => (
          <li key={r.muscle}>
            <span className="mv-label">{muscleLabel(r.muscle)}</span>
            <span className="mv-track" role="img" aria-label={`${muscleLabel(r.muscle)}: ${num1(r.sets)} Sätze`}>
              <span className="mv-band" style={{ left: pct(min), width: pct(max - min) }} />
              <span className="mv-bar" style={{ width: pct(r.sets) }} />
              <span className="mv-value" style={{ left: `calc(${pct(r.sets)} + 6px)` }}>
                {num1(r.sets)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mv-note">
        Grau hinterlegt: Richtwert {min}–{max} Sätze pro Muskel und Woche. Hauptmuskeln zählen
        voll, Hilfsmuskeln halb.
      </p>
    </div>
  );
}
