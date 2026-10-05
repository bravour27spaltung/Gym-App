import { useMemo } from 'react';
import { fmtDay, fmtTime, num1 } from '../lib/format';
import { prsAnchor } from '../lib/recovery';
import { assessRecovery, rollingSeries, type TrendPoint } from '../lib/recoveryAnalysis';
import type { HistRecoveryEntry } from '../lib/storage';
import { LineChart, type ChartPoint } from './Chart';
import { EvidenceDetails, RecoveryHero, SignalList } from './RecoverySignals';
import { Icon } from './ui';

interface Props {
  entries: HistRecoveryEntry[];
}

function toPoints(series: TrendPoint[], unit: string): ChartPoint[] {
  return series.map((p) => ({ at: p.at, value: p.value, caption: `${p.n} Werte im 7-Tage-Fenster${unit ? ` · ${unit}` : ''}` }));
}

/**
 * Verlauf der Recovery-Einträge: Gesamturteil und Signale für den letzten Eintrag, danach
 * Diagramme der gefühlten Erholung und der 7-Tage-Mittel von Schlaf, HRV und Ruhepuls (die
 * Tageswerte von Wearables rauschen stark, der gleitende Mittelwert zeigt den Trend), dazu die Liste.
 */
export function RecoveryHistoryScreen({ entries }: Props) {
  const chrono = useMemo(
    () => [...entries].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
    [entries],
  );
  const latest = chrono[chrono.length - 1] ?? null;
  const assessment = useMemo(() => (latest ? assessRecovery(entries, latest.date) : null), [entries, latest]);
  const sleepPoints = useMemo(() => toPoints(rollingSeries(entries, 'sleep'), 'h'), [entries]);
  const hrvPoints = useMemo(() => toPoints(rollingSeries(entries, 'hrv'), 'ms'), [entries]);
  const rhrPoints = useMemo(() => toPoints(rollingSeries(entries, 'restingHr'), 'bpm'), [entries]);

  if (entries.length === 0 || !latest || !assessment) {
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

  const prsPoints: ChartPoint[] = chrono.map((h) => ({
    at: Date.parse(`${h.date}T12:00:00Z`),
    value: h.perceivedRecovery,
    caption: prsAnchor(h.perceivedRecovery),
  }));

  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Recovery-Verlauf</h1>
      </header>

      <RecoveryHero a={assessment} loggedToday />
      <SignalList a={assessment} />

      <h2 className="section-title">Wie erholt (0–10)</h2>
      <LineChart points={prsPoints} format={(v) => num1(v)} label="Perceived Recovery Status, 0 bis 10" />

      {sleepPoints.length >= 2 && (
        <>
          <h2 className="section-title">Schlaf, Ø 7 Tage (h)</h2>
          <LineChart points={sleepPoints} format={(v) => num1(v)} label="Schlafdauer, gleitender 7-Tage-Mittelwert in Stunden" />
        </>
      )}
      {hrvPoints.length >= 2 && (
        <>
          <h2 className="section-title">HRV, Ø 7 Tage (ms, SDNN)</h2>
          <LineChart points={hrvPoints} format={(v) => num1(v)} label="HRV, gleitender 7-Tage-Mittelwert in Millisekunden" />
        </>
      )}
      {rhrPoints.length >= 2 && (
        <>
          <h2 className="section-title">Ruhepuls, Ø 7 Tage (bpm)</h2>
          <LineChart points={rhrPoints} format={(v) => num1(v)} label="Ruhepuls, gleitender 7-Tage-Mittelwert in Schlägen pro Minute" />
        </>
      )}

      <EvidenceDetails />

      <h2 className="section-title">Verlauf</h2>
      <ul className="exlist">
        {entries.map((h) => (
          <li key={h.id}>
            <div className="exrow static">
              <span className="exrow-text">
                <strong>
                  {fmtDay(h.date)} · Erholung {h.perceivedRecovery}/10
                </strong>
                <small>
                  {prsAnchor(h.perceivedRecovery)}
                  {h.soreness !== null ? ` · Muskelkater ${h.soreness}/5` : ''}
                  {h.stress !== null ? ` · Stress ${h.stress}/5` : ''}
                  {h.sleepQuality !== null ? ` · Schlafqualität ${h.sleepQuality}/5` : ''}
                  {h.hrvMs !== null ? ` · HRV ${h.hrvMs.toFixed(1)} ms` : ''}
                  {h.restingHr !== null ? ` · Ruhepuls ${h.restingHr} bpm` : ''}
                  {h.sleepHours !== null ? ` · ${h.sleepHours.toFixed(1)} h Schlaf` : ''}
                  {h.sleepStart && h.sleepEnd ? ` (${fmtTime(h.sleepStart)}–${fmtTime(h.sleepEnd)})` : ''}
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
