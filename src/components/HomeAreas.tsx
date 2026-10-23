import { fmtDay } from '../lib/format';
import type { HistFootballSession, HistRecoveryEntry, HistStretchSession } from '../lib/storage';
import { Icon } from './ui';

type Area = 'stretch' | 'football' | 'recovery';

interface Props {
  recovery: HistRecoveryEntry[];
  stretches: HistStretchSession[];
  footballs: HistFootballSession[];
  onOpen: (area: Area) => void;
}

/** 7.33 h -> "7:20 h" */
export function fmtSleep(hours: number): string {
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')} h`;
}

function latest<T>(items: T[], key: (x: T) => string): T | null {
  let best: T | null = null;
  for (const it of items) if (best === null || key(it) > key(best)) best = it;
  return best;
}

/** Die drei Bereiche neben dem Krafttraining mit Kurzstatus, direkt auf der Startseite. */
export function HomeAreas({ recovery, stretches, footballs, onOpen }: Props) {
  const rec = latest(recovery, (r) => r.date);
  const str = latest(stretches, (s) => s.startedAt);
  const fb = latest(footballs, (f) => f.playedOn);
  const today = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD, lokale Zeit
  const recToday = rec !== null && rec.date === today;

  const recParts: string[] = [];
  if (rec?.sleepHours != null) recParts.push(`Schlaf ${fmtSleep(rec.sleepHours)}`);
  if (rec?.hrvMs != null) recParts.push(`HRV ${Math.round(rec.hrvMs)} ms`);
  const recText = rec
    ? recParts.length > 0
      ? recParts.join(' · ')
      : `Erholung ${rec.perceivedRecovery}/10`
    : 'Noch kein Eintrag';

  return (
    <div className="home-areas">
      <button type="button" className="area-tile wide" onClick={() => onOpen('recovery')}>
        <span className="tile-ico ico-recovery">
          <Icon name="heart" size={22} />
        </span>
        <span className="tile-title">
          <strong>Recovery</strong>
          <small>
            {recText}
            {rec && !recToday && ` · ${fmtDay(rec.date)}`}
          </small>
        </span>
        <Icon name="forward" size={18} />
      </button>
      <button type="button" className="area-tile" onClick={() => onOpen('stretch')}>
        <span className="tile-ico ico-stretch">
          <Icon name="flame" size={22} />
        </span>
        <span className="tile-title">
          <strong>Stretching</strong>
          <small>{str ? `Zuletzt ${fmtDay(str.startedAt)}` : 'Noch keine Session'}</small>
        </span>
      </button>
      <button type="button" className="area-tile" onClick={() => onOpen('football')}>
        <span className="tile-ico ico-football">
          <Icon name="football" size={22} />
        </span>
        <span className="tile-title">
          <strong>Fußball</strong>
          <small>{fb ? `${fmtDay(fb.playedOn)} · ${fb.minutes} Min.` : 'Noch kein Eintrag'}</small>
        </span>
      </button>
    </div>
  );
}
