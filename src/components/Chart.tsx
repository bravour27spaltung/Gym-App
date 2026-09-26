import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { fmtDay, fmtShort, niceTicks } from '../lib/format';

export interface ChartPoint {
  /** Zeitpunkt in ms. */
  at: number;
  value: number;
  /** Zusatzzeile im Tooltip, z. B. "82,5 kg × 7". */
  caption?: string;
}

interface Props {
  points: ChartPoint[];
  /** Formatiert einen Wert für Achse und Tooltip. */
  format: (v: number) => string;
  /** Kurze Beschreibung für Screenreader, z. B. "Geschätztes 1RM". */
  label: string;
}

const W = 340;
const H = 210;
const M = { left: 46, right: 14, top: 14, bottom: 28 };

/**
 * Liniendiagramm für eine einzelne Reihe (eine Achse, kein Doppel-Diagramm).
 * Dünne Linie (2 px), Marker mit 2 px Ring in Flächenfarbe, Fläche mit 10 % Deckkraft,
 * Haarlinien als Raster. Tippen, Ziehen oder Pfeiltasten wählen einen Punkt; Werte stehen
 * zusätzlich in der Tabellenansicht der Seite.
 */
export function LineChart({ points, format, label }: Props) {
  const uid = useId();
  const [sel, setSel] = useState<number | null>(null);

  const geo = useMemo(() => {
    const xs = points.map((p) => p.at);
    const ys = points.map((p) => p.value);
    const ticks = niceTicks(Math.min(...ys), Math.max(...ys), 4);
    const y0 = ticks[0];
    const y1 = ticks[ticks.length - 1];
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const innerW = W - M.left - M.right;
    const innerH = H - M.top - M.bottom;
    const sx = (t: number) => (x1 === x0 ? M.left + innerW / 2 : M.left + ((t - x0) / (x1 - x0)) * innerW);
    const sy = (v: number) => M.top + innerH - ((v - y0) / (y1 - y0 || 1)) * innerH;
    return { ticks, sx, sy, x0, x1, base: M.top + innerH };
  }, [points]);

  if (points.length === 0) return null;

  const active = sel ?? points.length - 1;
  const p = points[active];
  const px = geo.sx(p.at);
  const path = points.map((pt, i) => `${i === 0 ? 'M' : 'L'}${geo.sx(pt.at).toFixed(1)},${geo.sy(pt.value).toFixed(1)}`).join(' ');
  const area = `${path} L${geo.sx(points[points.length - 1].at).toFixed(1)},${geo.base} L${geo.sx(points[0].at).toFixed(1)},${geo.base} Z`;
  const showAllMarkers = points.length <= 24;
  const bestIdx = points.reduce((b, pt, i) => (pt.value > points[b].value ? i : b), 0);

  const nearest = (clientX: number, rect: DOMRect): number => {
    const x = ((clientX - rect.left) / rect.width) * W;
    let best = 0;
    let dist = Infinity;
    points.forEach((pt, i) => {
      const d = Math.abs(geo.sx(pt.at) - x);
      if (d < dist) {
        dist = d;
        best = i;
      }
    });
    return best;
  };

  const onPointer = (e: PointerEvent<SVGRectElement>) => {
    setSel(nearest(e.clientX, e.currentTarget.getBoundingClientRect()));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowLeft') setSel(Math.max(0, active - 1));
    else if (e.key === 'ArrowRight') setSel(Math.min(points.length - 1, active + 1));
    else if (e.key === 'Home') setSel(0);
    else if (e.key === 'End') setSel(points.length - 1);
    else return;
    e.preventDefault();
  };

  // Vier Beschriftungen an der Zeitachse: erster, letzter und dazwischen.
  const xLabels = points.length === 1 ? [geo.x0] : [geo.x0, geo.x0 + (geo.x1 - geo.x0) / 2, geo.x1];

  return (
    <div
      className="chart"
      role="group"
      tabIndex={0}
      aria-label={`${label}, Diagramm. Pfeiltasten wählen einen Punkt.`}
      onKeyDown={onKey}
    >
      <div className="chart-tip" role="status">
        <span className="chart-tip-value">{format(p.value)}</span>
        <span className="chart-tip-date">{fmtDay(p.at)}</span>
        {p.caption && <span className="chart-tip-cap">{p.caption}</span>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="chart-svg" role="img" aria-label={label}>
        <g className="chart-grid">
          {geo.ticks.map((t) => (
            <g key={t}>
              <line x1={M.left} x2={W - M.right} y1={geo.sy(t)} y2={geo.sy(t)} />
              <text x={M.left - 8} y={geo.sy(t)} textAnchor="end" dominantBaseline="middle">
                {format(t).replace(' kg', '')}
              </text>
            </g>
          ))}
        </g>
        <g className="chart-axis">
          {xLabels.map((t, i) => (
            <text
              key={t}
              x={geo.sx(t)}
              y={H - 8}
              textAnchor={xLabels.length === 1 ? 'middle' : i === 0 ? 'start' : i === xLabels.length - 1 ? 'end' : 'middle'}
            >
              {fmtShort(t)}
            </text>
          ))}
        </g>

        {points.length > 1 && <path d={area} className="chart-area" />}
        {points.length > 1 && <path d={path} className="chart-line" />}

        <line x1={px} x2={px} y1={M.top} y2={geo.base} className="chart-cross" />

        {points.map((pt, i) => {
          const isKey = i === active || i === points.length - 1 || i === bestIdx;
          if (!showAllMarkers && !isKey) return null;
          return (
            <circle
              key={`${uid}-${pt.at}`}
              cx={geo.sx(pt.at)}
              cy={geo.sy(pt.value)}
              r={i === active ? 6 : 4}
              className={i === active ? 'chart-dot on' : 'chart-dot'}
            />
          );
        })}

        {/* Große, unsichtbare Trefferfläche: der Zeiger muss nur in der Nähe sein */}
        <rect
          x={M.left - 6}
          y={M.top}
          width={W - M.left - M.right + 12}
          height={H - M.top - M.bottom}
          fill="transparent"
          onPointerDown={onPointer}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || e.buttons > 0) onPointer(e);
          }}
        />
      </svg>
    </div>
  );
}
