import { fmtDay, num0, num1 } from '../lib/format';
import { footballKindLabel, footballLoad } from '../lib/football';
import type { HistFootballSession } from '../lib/storage';
import { LineChart, type ChartPoint } from './Chart';
import { Icon, StatGrid } from './ui';

interface Props {
  sessions: HistFootballSession[];
}

/** Verlauf der Fußball-Einträge: Kennzahlen, Belastungsdiagramm, chronologische Liste. */
export function FootballHistoryScreen({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="screen">
        <header className="pagehead">
          <h1>Fußball-Verlauf</h1>
        </header>
        <div className="empty-state">
          <Icon name="football" size={32} />
          <p>Noch kein Fußball-Eintrag gespeichert.</p>
        </div>
      </div>
    );
  }

  // Chronologisch (älteste zuerst) fürs Diagramm; die Liste darunter bleibt neueste zuerst.
  const chrono = [...sessions].sort((a, b) => new Date(a.playedOn).getTime() - new Date(b.playedOn).getTime());
  const points: ChartPoint[] = chrono.map((s) => ({
    at: new Date(s.playedOn).getTime(),
    value: footballLoad(s.minutes, s.rpe),
    caption: `${footballKindLabel(s.kind)} · ${s.minutes} min · RPE ${s.rpe}`,
  }));

  const totalMinutes = sessions.reduce((n, s) => n + s.minutes, 0);
  const avgRpe = sessions.reduce((n, s) => n + s.rpe, 0) / sessions.length;
  const withDistance = sessions.filter((s) => s.distanceKm !== null);
  const totalDistanceKm = withDistance.reduce((n, s) => n + (s.distanceKm ?? 0), 0);

  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Fußball-Verlauf</h1>
      </header>

      <StatGrid
        columns={3}
        items={[
          { label: 'Einheiten', value: String(sessions.length) },
          { label: 'Ø RPE', value: num1(avgRpe) },
          { label: 'Gesamtdauer', value: `${num0(totalMinutes)} min` },
        ]}
      />
      {withDistance.length > 0 && (
        <StatGrid
          columns={2}
          items={[
            { label: 'Gesamtdistanz', value: `${num1(totalDistanceKm)} km`, sub: `aus ${withDistance.length} Einheiten mit Health-Daten` },
            { label: 'Ø Distanz / Einheit', value: `${num1(totalDistanceKm / withDistance.length)} km` },
          ]}
        />
      )}

      <h2 className="section-title">Belastung (Dauer × RPE)</h2>
      <LineChart points={points} format={(v) => num0(v)} label="Belastung, Dauer mal subjektive Belastung" />

      <ul className="exlist">
        {sessions.map((s) => (
          <li key={s.id}>
            <div className="exrow static">
              <span className="exrow-text">
                <strong>
                  {fmtDay(s.playedOn)} · {footballKindLabel(s.kind)}
                </strong>
                <small>
                  {s.minutes} min · RPE {s.rpe} · Belastung {footballLoad(s.minutes, s.rpe)}
                  {s.distanceKm !== null ? ` · ${s.distanceKm.toFixed(1)} km` : ''}
                  {s.calories !== null ? ` · ${s.calories} kcal` : ''}
                  {s.avgHeartRate !== null ? ` · Ø ${s.avgHeartRate} bpm` : ''}
                  {s.note ? ` · ${s.note}` : ''}
                </small>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
