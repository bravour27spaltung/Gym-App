import { fmtDay, num1 } from '../lib/format';
import { prsAnchor } from '../lib/recovery';
import type { HistRecoveryEntry } from '../lib/storage';
import { LineChart, type ChartPoint } from './Chart';
import { Icon, StatGrid } from './ui';

interface Props {
  entries: HistRecoveryEntry[];
}

/** Verlauf der Recovery-Einträge: Kennzahlen, PRS-Diagramm, chronologische Liste. */
export function RecoveryHistoryScreen({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="screen">
        <header className="pagehead">
          <h1>Recovery-Verlauf</h1>
        </header>
        <div className="empty-state">
          <Icon name="heart" size={32} />
          <p>Noch kein Recovery-Eintrag gespeichert.</p>
        </div>
      </div>
    );
  }

  // Chronologisch (älteste zuerst) fürs Diagramm; die Liste darunter bleibt neueste zuerst.
  const chrono = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const points: ChartPoint[] = chrono.map((h) => ({
    at: new Date(h.date).getTime(),
    value: h.perceivedRecovery,
    caption: prsAnchor(h.perceivedRecovery),
  }));

  const avgPrs = entries.reduce((n, h) => n + h.perceivedRecovery, 0) / entries.length;
  const withHrv = entries.filter((h) => h.hrvMs !== null);
  const withSleep = entries.filter((h) => h.sleepHours !== null);
  const avgHrv = withHrv.length > 0 ? withHrv.reduce((n, h) => n + (h.hrvMs ?? 0), 0) / withHrv.length : null;
  const avgSleep =
    withSleep.length > 0 ? withSleep.reduce((n, h) => n + (h.sleepHours ?? 0), 0) / withSleep.length : null;

  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Recovery-Verlauf</h1>
      </header>

      <StatGrid
        columns={3}
        items={[
          { label: 'Einträge', value: String(entries.length) },
          { label: 'Ø Recovery', value: `${num1(avgPrs)}/10` },
          { label: 'Ø Schlaf', value: avgSleep !== null ? `${num1(avgSleep)} h` : '–' },
        ]}
      />
      {avgHrv !== null && (
        <p className="muted">
          Ø HRV (SDNN) über {withHrv.length} {withHrv.length === 1 ? 'Tag' : 'Tage'} mit Health-Daten:{' '}
          {num1(avgHrv)} ms. Aussagekräftig ist die Entwicklung über mehrere Wochen (Rolling-Baseline), nicht
          der einzelne Tageswert.
        </p>
      )}

      <h2 className="section-title">Wie erholt (0–10)</h2>
      <LineChart points={points} format={(v) => num1(v)} label="Perceived Recovery Status, 0 bis 10" />

      <ul className="exlist">
        {entries.map((h) => (
          <li key={h.id}>
            <div className="exrow static">
              <span className="exrow-text">
                <strong>
                  {fmtDay(h.date)} · Recovery {h.perceivedRecovery}/10
                </strong>
                <small>
                  {prsAnchor(h.perceivedRecovery)}
                  {h.soreness !== null ? ` · Muskelkater ${h.soreness}/5` : ''}
                  {h.stress !== null ? ` · Stress ${h.stress}/5` : ''}
                  {h.sleepQuality !== null ? ` · Schlafqualität ${h.sleepQuality}/5` : ''}
                  {h.hrvMs !== null ? ` · HRV ${h.hrvMs.toFixed(1)} ms` : ''}
                  {h.restingHr !== null ? ` · Ruhepuls ${h.restingHr} bpm` : ''}
                  {h.sleepHours !== null ? ` · ${h.sleepHours.toFixed(1)} h Schlaf` : ''}
                  {h.note ? ` · ${h.note}` : ''}
                </small>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
