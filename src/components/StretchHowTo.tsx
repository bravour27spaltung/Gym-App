import { MuscleFigure, MuscleLegend } from './MuscleFigure';

interface Props {
  muscles: readonly string[];
  /** Ausführung in Schritten; ohne Anleitung (eigene Übung, Katalog noch nicht importiert) entfällt der Block. */
  instructions?: readonly string[] | null;
}

/**
 * Einklappbare Anleitung zu einer Dehnübung: Muskelfigur, Schritte und ein Hinweis zur
 * Intensität. Eingeklappt, damit der Timer im Vordergrund bleibt; der Zustand bleibt beim
 * Wechsel zur nächsten Übung erhalten.
 */
export function StretchHowTo({ muscles, instructions }: Props) {
  if (!instructions || instructions.length === 0) return null;
  return (
    <details className="howto">
      <summary>Anleitung</summary>
      <div className="howto-body">
        <MuscleFigure primary={muscles} secondary={[]} view="auto" height={72} />
        <div>
          <MuscleLegend primary={muscles} secondary={[]} />
          <ol>
            {instructions.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      </div>
      <p className="muted howto-note">
        Bis ein deutlicher Zug entsteht, nicht bis Schmerz: Stärkeres Dehnen brachte in der Meta-Analyse von Ingram et
        al. (2024) keinen Mehrwert für die Beweglichkeit.
      </p>
    </details>
  );
}
