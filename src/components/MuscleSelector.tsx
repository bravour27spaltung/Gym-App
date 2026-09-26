import { BODY_BASE, BODY_REGIONS, type BodyView, type Region } from '../lib/bodymap';
import { cycleMuscle, muscleLabel } from '../lib/muscles';

interface Props {
  primary: readonly string[];
  secondary: readonly string[];
  onChange: (primary: string[], secondary: string[]) => void;
  /** Höhe einer Ansicht in px. */
  height?: number;
}

const VIEW_LABEL: Record<BodyView, string> = { front: 'Vorne', back: 'Hinten' };

function Base({ region }: { region: Region }) {
  return (
    <>
      <path className="bm-base" d={region.d} />
      {region.mirror && <path className="bm-base" d={region.d} transform="translate(100 0) scale(-1 1)" />}
    </>
  );
}

/**
 * Muskeln direkt am Körper wählen: Tippen schaltet einen Muskel der Reihe nach auf
 * Hauptmuskel, Hilfsmuskel und wieder aus. Jeder Muskel ist auch per Tastatur bedienbar
 * (Tab, Enter) und hat einen Namen für Screenreader.
 */
export function MuscleSelector({ primary, secondary, onChange, height = 250 }: Props) {
  function tap(key: string) {
    const next = cycleMuscle(primary, secondary, key);
    onChange(next.primary, next.secondary);
  }

  return (
    <div className="bm bm-sel" role="group" aria-label="Muskeln am Körper wählen" style={{ ['--bm-h' as string]: `${height}px` }}>
      {(['front', 'back'] as const).map((view) => (
        <figure key={view}>
          <svg viewBox="0 0 100 200">
            {BODY_BASE.map((r, i) => (
              <Base key={i} region={r} />
            ))}
            {BODY_REGIONS[view].map((r) => {
              const state = primary.includes(r.key) ? 'primary' : secondary.includes(r.key) ? 'secondary' : '';
              const stateText = state === 'primary' ? 'Hauptmuskel' : state === 'secondary' ? 'Hilfsmuskel' : 'nicht gewählt';
              const cls = `bm-part ${state}`;
              return (
                <g key={r.key}>
                  <path
                    className={cls}
                    d={r.d}
                    role="button"
                    tabIndex={0}
                    aria-label={`${muscleLabel(r.key)} (${VIEW_LABEL[view]}): ${stateText}`}
                    onClick={() => tap(r.key)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        tap(r.key);
                      }
                    }}
                  />
                  {r.mirror && (
                    <path
                      className={cls}
                      d={r.d}
                      transform="translate(100 0) scale(-1 1)"
                      aria-hidden="true"
                      onClick={() => tap(r.key)}
                    />
                  )}
                </g>
              );
            })}
          </svg>
          <figcaption>{VIEW_LABEL[view]}</figcaption>
        </figure>
      ))}
    </div>
  );
}
