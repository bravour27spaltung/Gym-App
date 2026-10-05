import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { HistRecoveryEntry } from '../lib/storage';
import { RecoveryHistoryScreen } from './RecoveryHistoryScreen';
import { RecoveryScreen } from './RecoveryScreen';

function iso(n: number): string {
  return new Date(Date.UTC(2026, 8, 1 + n)).toISOString().slice(0, 10);
}

/** 35 Tage Verlauf, in der letzten Woche schlechtere Werte. */
function history(): HistRecoveryEntry[] {
  const out: HistRecoveryEntry[] = [];
  for (let i = 34; i >= 0; i--) {
    const bad = i >= 28;
    const wake = Date.parse(`${iso(i)}T05:30:00Z`);
    out.push({
      id: iso(i),
      date: iso(i),
      perceivedRecovery: bad ? 3 : 8,
      soreness: 2,
      stress: 2,
      sleepQuality: bad ? 2 : 4,
      note: null,
      hrvMs: (bad ? 42 : 60) + (i % 2 === 0 ? 3 : -3),
      restingHr: (bad ? 58 : 52) + (i % 2 === 0 ? 1 : -1),
      sleepHours: bad ? 5.5 : 7.5,
      sleepStart: new Date(wake - (bad ? 5.5 : 7.5) * 3_600_000).toISOString(),
      sleepEnd: new Date(wake).toISOString(),
      source: 'apple_health',
    });
  }
  return out;
}

const noop = () => {};

describe('Recovery-Bildschirme (Smoke-Test)', () => {
  it('Recovery-Tab rendert Urteil, Signale und Evidenz', () => {
    const html = renderToString(
      <RecoveryScreen
        history={history()}
        workouts={[]}
        footballs={[]}
        pending={0}
        busy={false}
        notice={null}
        onSave={noop}
        onSync={noop}
        onDelete={noop}
      />,
    );
    expect(html).toContain('Erholungsstatus');
    expect(html).toContain('Reduziert'); // PRS, Schlaf, HRV und Ruhepuls weichen ab
    expect(html).toContain('HRV (SDNN)');
    expect(html).toContain('Wissenschaftliche Grundlage');
    expect(html).toContain('Saw, Main');
  });

  it('Recovery-Tab ohne Einträge zeigt die Erfassung und kein Urteil', () => {
    const html = renderToString(
      <RecoveryScreen history={[]} workouts={[]} footballs={[]} pending={0} busy={false} notice={null} onSave={noop} onSync={noop} onDelete={noop} />,
    );
    expect(html).toContain('Noch kein Urteil');
    expect(html).toContain('Eintrag speichern');
  });

  it('Verlauf rendert Signale und Diagramme', () => {
    const html = renderToString(<RecoveryHistoryScreen entries={history()} />);
    expect(html).toContain('Schlaf, Ø 7 Tage');
    expect(html).toContain('HRV, Ø 7 Tage');
    expect(html).toContain('Ruhepuls, Ø 7 Tage');
  });

  it('Verlauf ohne Einträge zeigt den Leerzustand', () => {
    expect(renderToString(<RecoveryHistoryScreen entries={[]} />)).toContain('Noch kein Recovery-Eintrag');
  });
});
