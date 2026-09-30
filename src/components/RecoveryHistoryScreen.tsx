import type { CSSProperties } from 'react';
import { fmtDay, num1 } from '../lib/format';
import { computeRecoveryBaseline, computeRecoveryScore, prsAnchor } from '../lib/recovery';
import type { HistRecoveryEntry } from '../lib/storage';
import { LineChart, type ChartPoint } from './Chart';
import { Icon, StatGrid } from './ui';

interface Props {
  entries: HistRecoveryEntry[];
}

/**
 * Grobe Orientierung, keine klinische Schwelle: der Score ist eine heuristische
 * Gewichtung (siehe lib/recovery.ts), keine validierte Diagnose. Nutzt die schon
 * vorhandenen semantischen Farben (--accent/--warn/--danger, styles.css) statt
 * neuer Klassen – lokal über die CSS-Var im .hero-Block umgeschaltet.
 */
function scoreTone(score: number): { color: string; label: string } {
  if (score >= 70) return { color: 'var(--accent)', label: 'Gut erholt' };
  if (score >= 45) return { color: 'var(--warn)', label: 'Mäßig erholt' };
  return { color: 'var(--danger)', label: 'Niedrig – heute vorsichtig angehen' };
}

/** Verlauf der Recovery-Einträge: Recovery Score prominent oben, Kennzahlen, PRS-Diagramm, Liste. */
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

  // Score je Tag gegen die Baseline aus den 7 Tagen davor (siehe computeRecoveryBaseline);
  // ohne genug Baseline-Werte stützt er sich zunächst allein auf PRS/Schlaf.
  const scoreById = new Map<string, ReturnType<typeof computeRecoveryScore>>();
  for (const h of entries) {
    const baseline = computeRecoveryBaseline(entries, h.date);
    scoreById.set(
      h.id,
      computeRecoveryScore(
        { perceivedRecovery: h.perceivedRecovery, hrvMs: h.hrvMs, restingHr: h.restingHr, sleepHours: h.sleepHours },
        baseline,
      ),
    );
  }
  const latest = chrono[chrono.length - 1];
  const latestScore = scoreById.get(latest.id)!;
  const tone = scoreTone(latestScore.score);
  const missingBaseline = latestScore.parts.hrv === null && latestScore.parts.restingHr === null;

  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Recovery-Verlauf</h1>
      </header>

      <section className="hero" style={{ '--accent': tone.color } as CSSProperties}>
        <p className="eyebrow">Recovery Score · {fmtDay(latest.date)}</p>
        <h2>
          {latestScore.score}
          <span style={{ fontSize: '1rem', fontWeight: 600, marginLeft: 8 }}>/100 · {tone.label}</span>
        </h2>
        <p className="hero-sub">
          Gewichtete Mischung aus PRS
          {latestScore.parts.hrv !== null ? ', HRV-Abweichung von deiner Baseline' : ''}
          {latestScore.parts.restingHr !== null ? ', Ruhepuls-Abweichung' : ''}
          {latestScore.parts.sleep !== null ? ', Schlafdauer' : ''}.
          {missingBaseline
            ? ' Noch keine 4 Baseline-Tage für HRV/Ruhepuls – der Score stützt sich vorerst auf PRS und Schlaf.'
            : ''}
        </p>
        <StatGrid
          columns={3}
          items={[
            { label: 'Ø Recovery', value: `${num1(avgPrs)}/10` },
            { label: 'Ø Schlaf', value: avgSleep !== null ? `${num1(avgSleep)} h` : '–' },
            { label: 'Ø HRV', value: avgHrv !== null ? `${num1(avgHrv)} ms` : '–' },
          ]}
        />
      </section>

      <h2 className="section-title">Wie erholt (0–10)</h2>
      <LineChart points={points} format={(v) => num1(v)} label="Perceived Recovery Status, 0 bis 10" />

      <h2 className="section-title">Verlauf</h2>
      <ul className="exlist">
        {entries.map((h) => {
          const s = scoreById.get(h.id)!;
          const t = scoreTone(s.score);
          return (
            <li key={h.id}>
              <div className="exrow static">
                <span className="exrow-text">
                  <strong>
                    {fmtDay(h.date)} · <span style={{ color: t.color, fontWeight: 800 }}>{s.score}/100</span> ·
                    Recovery {h.perceivedRecovery}/10
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
          );
        })}
      </ul>
    </div>
  );
}
