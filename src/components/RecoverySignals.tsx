import type { CSSProperties } from 'react';
import { footballKindLabel } from '../lib/football';
import { fmtDay, fmtTime, num0, num1 } from '../lib/format';
import {
  ACUTE_DAYS,
  MIN_ACUTE_SAMPLES,
  MIN_BASELINE_SAMPLES,
  RECOVERY_EVIDENCE,
  SLEEP_TARGET_HOURS,
  type RecoveryAssessment,
  type RecoveryLevel,
  type SignalStatus,
  type TrainingContext,
  type TrendSignal,
} from '../lib/recoveryAnalysis';
import { prsAnchor } from '../lib/recovery';

const LEVEL_TEXT: Record<RecoveryLevel, { color: string; title: string; sub: string }> = {
  ok: { color: 'var(--accent)', title: 'Unauffällig', sub: 'Deine Signale liegen im Rahmen deines Normalbereichs.' },
  watch: {
    color: 'var(--warn)',
    title: 'Beobachten',
    sub: 'Ein Signal weicht deutlich ab oder mehrere leicht. Achte heute besonders auf dein Körpergefühl.',
  },
  reduced: {
    color: 'var(--danger)',
    title: 'Reduziert',
    sub: 'Mehrere Signale weichen deutlich von deinem Normalbereich ab. Steuere Belastung und Schlaf heute bewusst.',
  },
};

const STATUS_WORD: Record<SignalStatus, string> = { ok: 'unauffällig', watch: 'beobachten', low: 'auffällig' };

const dec = (n: number, digits = 1): string => n.toFixed(digits).replace('.', ',');
const signed = (n: number, digits = 1): string => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${dec(Math.abs(n), digits)}`;

function Row({
  title,
  value,
  status,
  lines,
}: {
  title: string;
  value: string;
  status: SignalStatus | null;
  lines: string[];
}) {
  return (
    <li className="sigrow">
      <span className={`sigdot ${status ?? 'none'}`} aria-hidden="true" />
      <span className="sigbody">
        <strong>
          {title} · {value}
          {status && <span className="sigstate"> ({STATUS_WORD[status]})</span>}
        </strong>
        {lines.map((l) => (
          <small key={l}>{l}</small>
        ))}
      </span>
    </li>
  );
}

function trendLines(t: TrendSignal, unit: 'ms' | 'bpm'): string[] {
  if (t.acute === null) return [`Zu wenige Werte: ${t.acuteN} von mindestens ${MIN_ACUTE_SAMPLES} in den letzten ${ACUTE_DAYS} Tagen`];
  const lines = [`${ACUTE_DAYS}-Tage-Ø ${dec(t.acute, unit === 'ms' ? 0 : 1)} ${unit}`];
  if (t.baseline === null || t.change === null || t.swc === null) {
    lines.push(`Baseline im Aufbau: ${t.baselineN} von ${MIN_BASELINE_SAMPLES} Werten der 4 Wochen davor`);
  } else if (unit === 'ms') {
    lines.push(
      `${signed(t.change, 0)} % gegenüber deiner Baseline (${dec(t.baseline, 0)} ms), relevant ab ±${dec(t.swc, 0)} %`,
    );
  } else {
    lines.push(
      `${signed(t.change)} bpm gegenüber deiner Baseline (${dec(t.baseline)} bpm), relevant ab ±${dec(t.swc)} bpm`,
    );
  }
  return lines;
}

/** Ampel-Karte: Gesamturteil, Begründung und Hinweis auf die Heuristik. */
export function RecoveryHero({ a, loggedToday }: { a: RecoveryAssessment; loggedToday: boolean }) {
  const level = a.level ? LEVEL_TEXT[a.level] : null;
  return (
    <section className="hero" style={{ '--accent': level?.color ?? 'var(--muted)' } as CSSProperties}>
      <p className="eyebrow">
        Erholungsstatus · {fmtDay(a.asOf)}
        {!loggedToday ? ' · heute noch kein Eintrag' : ''}
      </p>
      <h2>{level ? level.title : 'Noch kein Urteil'}</h2>
      <p className="hero-sub">
        {level
          ? level.sub
          : 'Trage deine gefühlte Erholung ein; mit Health-Werten (HRV, Ruhepuls, Schlaf) wird die Einordnung genauer.'}
      </p>
      {a.reasons.length > 0 && (
        <ul className="reasons">
          {a.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="muted newex-hint">
        Grundlage: {a.signals} von 5 Signalen{a.lows + a.watches > 0 ? `, davon ${a.lows} auffällig und ${a.watches} zu beobachten` : ''}. Regel: gelb bei einem
        deutlich oder zwei leicht abweichenden Signalen, rot bei mindestens zwei deutlich abweichenden. Das ist eine
        einfache Heuristik, keine Diagnose und keine Vorhersage von Leistung oder Verletzungen.
      </p>
    </section>
  );
}

/** Die einzelnen Signale mit Wert, Einordnung und Vergleich zur eigenen Baseline. */
export function SignalList({ a }: { a: RecoveryAssessment }) {
  const { prs, wellness, sleep, hrv, restingHr } = a;
  const sleepLines: string[] = [];
  if (sleep.lastNight) {
    if (sleep.lastNight.start && sleep.lastNight.end) {
      sleepLines.push(`Nacht ${fmtTime(sleep.lastNight.start)} bis ${fmtTime(sleep.lastNight.end)}`);
    }
  } else {
    sleepLines.push('Keine Schlafdaten für diese Nacht');
  }
  if (sleep.avg7 !== null) {
    sleepLines.push(
      `${ACUTE_DAYS}-Nächte-Ø ${dec(sleep.avg7)} h (${sleep.nights7} Nächte)${
        sleep.debt7 !== null ? `, Schlafschuld gegenüber ${SLEEP_TARGET_HOURS} h: ${dec(sleep.debt7)} h` : ''
      }`,
    );
  }
  if (sleep.stages) {
    const part = (label: string, min: number | null, base: number | null): string | null => {
      if (min === null) return null;
      const diff = base !== null ? ` (${signed(min - base, 0)} min zu deinem Schnitt von ${num0(base)} min)` : '';
      return `${label} ${num0(min)} min${diff}`;
    };
    const parts = [part('Tiefschlaf', sleep.stages.deepMin, sleep.stages.deepBaseline), part('REM', sleep.stages.remMin, sleep.stages.remBaseline)].filter(
      (p): p is string => p !== null,
    );
    if (parts.length > 0) {
      sleepLines.push(parts.join(' · '));
      sleepLines.push(
        'Schlafphasen sind bei Uhren nur grob erfasst und haben keinen Sollwert; nur der Vergleich mit deinem eigenen Schnitt über mehrere Nächte sagt etwas.',
      );
    }
  }
  if (sleep.regularityMin !== null) {
    sleepLines.push(`Regelmäßigkeit: Schlafmitte schwankt um ±${num0(sleep.regularityMin)} min`);
  }

  return (
    <ul className="siglist">
      <Row
        title="Gefühlte Erholung"
        value={prs.value !== null ? `${prs.value}/10` : '–'}
        status={prs.status}
        lines={
          prs.value !== null
            ? [prsAnchor(prs.value), ...(prs.baseline !== null ? [`Dein Schnitt der letzten 4 Wochen: ${dec(prs.baseline)}/10`] : [])]
            : ['Für den Tag noch nicht eingetragen']
        }
      />
      <Row
        title="Wellness"
        value={wellness.value !== null ? `${dec(wellness.value)}/5` : '–'}
        status={wellness.status}
        lines={
          wellness.value !== null
            ? [
                'Aus Muskelkater, Stress und Schlafqualität (5 = beste)',
                ...(wellness.baseline !== null ? [`Dein Schnitt der letzten 4 Wochen: ${dec(wellness.baseline)}/5`] : []),
              ]
            : ['Muskelkater, Stress und Schlafqualität nicht eingetragen']
        }
      />
      <Row
        title="Schlaf"
        value={sleep.lastNight ? `${dec(sleep.lastNight.hours)} h` : '–'}
        status={sleep.status}
        lines={sleepLines}
      />
      <Row title="HRV (SDNN)" value={hrv.acute !== null ? `${dec(hrv.acute, 0)} ms` : '–'} status={hrv.status} lines={trendLines(hrv, 'ms')} />
      <Row
        title="Ruhepuls"
        value={restingHr.acute !== null ? `${dec(restingHr.acute)} bpm` : '–'}
        status={restingHr.status}
        lines={trendLines(restingHr, 'bpm')}
      />
    </ul>
  );
}

function hoursText(h: number): string {
  return h < 48 ? `vor ${num0(h)} h` : `vor ${num1(h / 24)} Tagen`;
}

/** Belastung der letzten Tage als Einordnung für die Erholungswerte. */
export function TrainingContextCard({ ctx }: { ctx: TrainingContext }) {
  const { gym, football } = ctx;
  const lines: string[] = [];
  if (gym.hoursSinceLast !== null) {
    lines.push(`Letztes Krafttraining ${hoursText(gym.hoursSinceLast)}${gym.lastName ? ` (${gym.lastName})` : ''}`);
  }
  if (football.hoursSinceLast !== null && football.lastKind) {
    lines.push(
      `Letzte Fußball-Einheit ${hoursText(football.hoursSinceLast)} (${footballKindLabel(football.lastKind)}, Last ${num0(football.lastLoad ?? 0)} AU)`,
    );
  }
  if (lines.length === 0) return null;
  return (
    <div className="card">
      <h3 className="section-title" style={{ marginTop: 0 }}>
        Belastung im Kontext
      </h3>
      <ul className="exlist">
        {lines.map((l) => (
          <li key={l}>
            <div className="exrow static">
              <span className="exrow-text">
                <strong>{l}</strong>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted newex-hint">
        Letzte 7 Tage: {gym.sessions7d} Krafttraining{gym.sessions7d === 1 ? '' : 's'}, {football.sessions7d} Fußball-Einheit
        {football.sessions7d === 1 ? '' : 'en'} mit {num0(football.load7d)} AU (Dauer × RPE).
        {football.within72h
          ? ' Nach Spielen kann die neuromuskuläre Erholung bis etwa 72 Stunden dauern (Silva et al. 2018); niedrige Werte heute sind dann nicht ungewöhnlich.'
          : ''}
      </p>
    </div>
  );
}

/** Einordnung der Quellen: Evidenzgrad, Grundlage und Grenzen je Marker. */
export function EvidenceDetails() {
  return (
    <details className="equipment">
      <summary>Wissenschaftliche Grundlage und Grenzen</summary>
      <p className="muted newex-hint">
        Die Quellen sind nach Art eingestuft: <strong>hoch</strong> = systematisches Review oder Meta-Analyse mit vielen
        Studien, <strong>mittel</strong> = Konsensus-Statement oder Übertragung aus verwandten Gruppen, <strong>gering</strong> =
        Einzelstudie, kleine Stichprobe oder Praxisheuristik. Eine Einstufung sagt etwas über die Stärke der Belege, nicht
        darüber, wie viel Gewicht der Marker in deinem Fall verdient.
      </p>
      <ul className="evidence">
        {RECOVERY_EVIDENCE.map((e) => (
          <li key={e.topic}>
            <strong>
              {e.topic} <span className={`grade ${e.grade}`}>Evidenz: {e.grade}</span>
            </strong>
            <small>
              <b>In der App:</b> {e.use}
            </small>
            <small>
              <b>Grundlage:</b> {e.basis}
            </small>
            <small>
              <b>Quelle:</b> {e.source}
            </small>
            <small>
              <b>Grenzen:</b> {e.caveat}
            </small>
          </li>
        ))}
      </ul>
    </details>
  );
}
