import { useState } from 'react';
import { fmtDay, fmtTime } from '../lib/format';
import type { HistStretchSession } from '../lib/storage';
import { itemSummary } from '../lib/stretch';
import { Icon, StatGrid } from './ui';

interface Props {
  sessions: HistStretchSession[];
  nameOf: (stretchExerciseId: string) => string;
}

function minutesOf(s: HistStretchSession): number {
  if (!s.finishedAt) return 0;
  return Math.max(0, Math.round((new Date(s.finishedAt).getTime() - new Date(s.startedAt).getTime()) / 60_000));
}

/** Verlauf der Stretching-Sessions: einfache Liste, zum Aufklappen der Details. */
export function StretchHistoryScreen({ sessions, nameOf }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (sessions.length === 0) {
    return (
      <div className="screen">
        <div className="empty-state">
          <Icon name="flame" size={32} />
          <p>Noch keine Stretching-Session gespeichert.</p>
        </div>
      </div>
    );
  }

  const withFeeling = sessions.filter((s) => s.feelingBefore !== null || s.feelingAfter !== null);
  const avgBefore = avg(withFeeling.map((s) => s.feelingBefore));
  const avgAfter = avg(withFeeling.map((s) => s.feelingAfter));

  return (
    <div className="screen">

      <StatGrid
        columns={3}
        items={[
          { label: 'Sessions', value: String(sessions.length) },
          { label: 'Ø vorher', value: avgBefore !== null ? avgBefore.toFixed(1) : '–' },
          { label: 'Ø nachher', value: avgAfter !== null ? avgAfter.toFixed(1) : '–' },
        ]}
      />

      <ul className="exlist">
        {sessions.map((s) => {
          const open = openId === s.id;
          const minutes = minutesOf(s);
          return (
            <li key={s.id}>
              <button
                type="button"
                className="exrow"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : s.id)}
              >
                <span className="exrow-text">
                  <strong>
                    {fmtDay(s.startedAt)} · {fmtTime(s.startedAt)}
                  </strong>
                  <small>
                    {minutes} min · {s.items.length} {s.items.length === 1 ? 'Übung' : 'Übungen'}
                    {s.feelingBefore !== null || s.feelingAfter !== null
                      ? ` · Verspannung ${s.feelingBefore ?? '–'} → ${s.feelingAfter ?? '–'}`
                      : ''}
                  </small>
                </span>
                <Icon name={open ? 'up' : 'down'} size={18} />
              </button>
              {open && (
                <div className="card">
                  <ul className="exlist">
                    {s.items.map((it, i) => (
                      <li key={i}>
                        <div className="exrow static">
                          <span className="exrow-text">
                            <strong>{nameOf(it.stretchExerciseId)}</strong>
                            <small>{itemSummary(it.side, it.holdSeconds, it.reps, it.sets)}</small>
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {s.note && <p className="muted">{s.note}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}
