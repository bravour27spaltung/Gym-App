import { fmtDay, num0, num1 } from '../lib/format';
import { cardioActivityLabel, cardioIconName, cardioLoad } from '../lib/cardio';
import type { HistCardioSession } from '../lib/storage';
import { LineChart, type ChartPoint } from './Chart';
import { Icon, StatGrid } from './ui';

interface Props {
  sessions: HistCardioSession[];
}

/** Verlauf der Cardio-Einträge: Kennzahlen, Belastungsdiagramm, chronologische Liste. */
export function CardioHistoryScreen({ sessions }: Props) {
  if (sessions.length === 0) {
    return (
      <div className="screen">
        <div className="empty-state">
          <Icon name="pulse" size={32} />
          <p>Noch kein Cardio-Eintrag gespeichert.</p>
        </div>
      </div>
    );
  }

  // Chronologisch (älteste zuerst) fürs Diagramm; die Liste darunter bleibt neueste zuerst.
  const chrono = [...sessions].sort((a, b) => new Date(a.playedOn).getTime() - new Date(b.playedOn).getTime());
  // Belastung (Dauer × RPE) gibt es nur für Einheiten mit RPE.
  const points: ChartPoint[] = chrono.flatMap((s) => {
    const load = cardioLoad(s.minutes, s.rpe);
    return load === null
      ? []
      : [{ at: new Date(s.playedOn).getTime(), value: load, caption: `${cardioActivityLabel(s.activity)} · ${s.minutes} min · RPE ${s.rpe}` }];
  });

  const totalMinutes = sessions.reduce((n, s) => n + s.minutes, 0);
  const withRpe = sessions.filter((s) => s.rpe !== null);
  const avgRpe = withRpe.length > 0 ? withRpe.reduce((n, s) => n + (s.rpe ?? 0), 0) / withRpe.length : null;
  const withDistance = sessions.filter((s) => s.distanceKm !== null);
  const totalDistanceKm = withDistance.reduce((n, s) => n + (s.distanceKm ?? 0), 0);

  return (
    <div className="screen">

      <StatGrid
        columns={3}
        items={[
          { label: 'Einheiten', value: String(sessions.length) },
          { label: 'Ø RPE', value: avgRpe !== null ? num1(avgRpe) : '–' },
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

      {points.length > 0 && (
        <>
          <h2 className="section-title">Belastung (Dauer × RPE)</h2>
          <LineChart points={points} format={(v) => num0(v)} label="Belastung, Dauer mal subjektive Belastung" />
        </>
      )}

      <ul className="exlist">
        {sessions.map((s) => (
          <li key={s.id}>
            <div className="exrow static">
              <Icon name={cardioIconName(s.activity)} size={18} />
              <span className="exrow-text">
                <strong>
                  {fmtDay(s.playedOn)} · {cardioActivityLabel(s.activity)}
                </strong>
                <small>
                  {s.minutes} min
                  {s.rpe !== null ? ` · RPE ${s.rpe} · Belastung ${cardioLoad(s.minutes, s.rpe)}` : ''}
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
