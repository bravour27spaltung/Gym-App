import { BODY_BASE, BODY_REGIONS, bestView, type BodyView, type Region } from '../lib/bodymap';
import { muscleLabel } from '../lib/muscles';

interface Props {
  primary: readonly string[];
  secondary: readonly string[];
  /** 'both' = Vorder- und Rückansicht, 'auto' = nur die Ansicht mit den meisten getroffenen Muskeln. */
  view?: 'both' | 'auto';
  /** Höhe einer Ansicht in px. */
  height?: number;
}

function Shape({ region, className }: { region: Region; className: string }) {
  return (
    <>
      <path className={className} d={region.d} />
      {region.mirror && <path className={className} d={region.d} transform="translate(100 0) scale(-1 1)" />}
    </>
  );
}

function Body({ view, primary, secondary }: { view: BodyView; primary: readonly string[]; secondary: readonly string[] }) {
  return (
    <svg viewBox="0 0 100 200" aria-hidden="true" focusable="false">
      {BODY_BASE.map((r, i) => (
        <Shape key={i} region={r} className="bm-base" />
      ))}
      {BODY_REGIONS[view].map((r) => {
        const state = primary.includes(r.key) ? 'primary' : secondary.includes(r.key) ? 'secondary' : '';
        return <Shape key={r.key} region={r} className={`bm-part ${state}`} />;
      })}
    </svg>
  );
}

/** Beschreibung für Screenreader, z. B. "Hauptmuskeln: Brust. Hilfsmuskeln: Trizeps, Schultern." */
export function figureDescription(primary: readonly string[], secondary: readonly string[]): string {
  const parts: string[] = [];
  if (primary.length > 0) parts.push(`Hauptmuskeln: ${primary.map(muscleLabel).join(', ')}.`);
  if (secondary.length > 0) parts.push(`Hilfsmuskeln: ${secondary.map(muscleLabel).join(', ')}.`);
  return parts.join(' ');
}

/**
 * Schematische Körperfigur, auf der die Muskeln der Übung eingefärbt sind:
 * Hauptmuskeln kräftig, Hilfsmuskeln blasser. Die Bedeutung steht zusätzlich als Text
 * (Legende bzw. Beschreibung), die Farbe allein trägt also keine Information.
 */
export function MuscleFigure({ primary, secondary, view = 'both', height = 88 }: Props) {
  if (primary.length === 0 && secondary.length === 0) return null;
  const views: BodyView[] = view === 'both' ? ['front', 'back'] : [bestView([...primary, ...secondary])];
  return (
    <span
      className="bm"
      role="img"
      aria-label={figureDescription(primary, secondary)}
      style={{ ['--bm-h' as string]: `${height}px` }}
    >
      {views.map((v) => (
        <Body key={v} view={v} primary={primary} secondary={secondary} />
      ))}
    </span>
  );
}

/** Legende mit Farbpunkten und den Muskelnamen: Hauptmuskeln zuerst, dann Hilfsmuskeln. */
export function MuscleLegend({ primary, secondary }: { primary: readonly string[]; secondary: readonly string[] }) {
  if (primary.length === 0 && secondary.length === 0) return null;
  return (
    <p className="bm-legend">
      {primary.length > 0 && (
        <span>
          <i className="bm-dot primary" aria-hidden="true" />
          {primary.map(muscleLabel).join(', ')}
        </span>
      )}
      {secondary.length > 0 && (
        <span>
          <i className="bm-dot secondary" aria-hidden="true" />
          {secondary.map(muscleLabel).join(', ')}
        </span>
      )}
    </p>
  );
}
