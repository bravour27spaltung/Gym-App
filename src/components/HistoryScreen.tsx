import { useMemo, useState } from 'react';
import {
  fmtDay,
  fmtDayLong,
  fmtKg,
  fmtPercent,
  fmtShortYear,
  fmtTime,
  fmtVolume,
  fmtVolumeShort,
  num0,
} from '../lib/format';
import {
  ONE_RM_MAX_REPS,
  estimate1RM,
  exercisePoints,
  exerciseStats,
  lastDays,
  muscleSets,
  windowTotals,
  workoutTotals,
  type ExerciseMeta,
  type HistWorkout,
} from '../lib/stats';
import { totalLoad } from '../lib/weight';
import { LineChart, type ChartPoint } from './Chart';
import { MuscleVolume } from './MuscleVolume';
import { AppBar, Icon, StatGrid } from './ui';

interface Props {
  workouts: HistWorkout[];
  meta: Record<string, ExerciseMeta | undefined>;
}

type View = { kind: 'overview' } | { kind: 'workout'; id: string } | { kind: 'exercise'; id: string };

const DAY_MS = 24 * 60 * 60 * 1000;

export function HistoryScreen({ workouts, meta }: Props) {
  const [stack, setStack] = useState<View[]>([{ kind: 'overview' }]);
  const view = stack[stack.length - 1];
  const push = (v: View) => setStack((s) => [...s, v]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const nameOf = (id: string) => meta[id]?.name ?? 'Übung';

  if (view.kind === 'workout') {
    const w = workouts.find((x) => x.id === view.id);
    if (w) return <WorkoutDetail workout={w} nameOf={nameOf} onBack={pop} onExercise={(id) => push({ kind: 'exercise', id })} />;
  }
  if (view.kind === 'exercise') {
    return <ExerciseProgress workouts={workouts} exerciseId={view.id} name={nameOf(view.id)} onBack={pop} />;
  }
  return (
    <Overview
      workouts={workouts}
      meta={meta}
      nameOf={nameOf}
      onWorkout={(id) => push({ kind: 'workout', id })}
      onExercise={(id) => push({ kind: 'exercise', id })}
    />
  );
}

// ---------------------------------------------------------------------------

function Overview(props: {
  workouts: HistWorkout[];
  meta: Record<string, ExerciseMeta | undefined>;
  nameOf: (id: string) => string;
  onWorkout: (id: string) => void;
  onExercise: (id: string) => void;
}) {
  const { workouts, meta } = props;
  const [shown, setShown] = useState(15);
  const [allExercises, setAllExercises] = useState(false);

  const data = useMemo(() => {
    const now = new Date();
    const cur = lastDays(now, 7);
    const prev = { from: new Date(cur.from.getTime() - 7 * DAY_MS), to: cur.from };
    const muscleOf = (id: string) => ({ primary: meta[id]?.primary ?? [], secondary: meta[id]?.secondary ?? [] });
    const exercises = new Map<string, { sessions: number; lastAt: number }>();
    for (const w of workouts) {
      for (const ex of w.exercises) {
        if (exerciseStats(ex).workingSets === 0) continue;
        const e = exercises.get(ex.exerciseId) ?? { sessions: 0, lastAt: 0 };
        e.sessions += 1;
        e.lastAt = Math.max(e.lastAt, new Date(w.startedAt).getTime());
        exercises.set(ex.exerciseId, e);
      }
    }
    return {
      week: windowTotals(workouts, cur.from, cur.to),
      before: windowTotals(workouts, prev.from, prev.to),
      muscles: muscleSets(workouts, cur.from, cur.to, muscleOf),
      exercises: [...exercises.entries()].sort((a, b) => b[1].lastAt - a[1].lastAt),
    };
  }, [workouts, meta]);

  if (workouts.length === 0) {
    return (
      <div className="screen">
        <header className="pagehead">
          <h1>Verlauf</h1>
        </header>
        <div className="empty-state">
          <Icon name="chart" size={32} />
          <p>Noch kein abgeschlossenes Training.</p>
          <p className="muted">Nach dem ersten gespeicherten Training erscheinen hier deine Auswertungen.</p>
        </div>
      </div>
    );
  }

  const { week, before } = data;
  const exerciseRows = allExercises ? data.exercises : data.exercises.slice(0, 8);

  return (
    <div className="screen">
      <header className="pagehead">
        <h1>Verlauf</h1>
      </header>

      <h2 className="section-title">Letzte 7 Tage</h2>
      <StatGrid
        items={[
          { label: 'Einheiten', value: num0(week.sessions), sub: `davor ${num0(before.sessions)}` },
          { label: 'Sätze', value: num0(week.workingSets), sub: `davor ${num0(before.workingSets)}` },
          {
            label: 'Volumen',
            value: week.volumeKg > 0 ? fmtVolumeShort(week.volumeKg) : '–',
            sub: `davor ${before.volumeKg > 0 ? fmtVolumeShort(before.volumeKg) : '–'}`,
          },
        ]}
      />

      <h2 className="section-title">Sätze pro Muskel, letzte 7 Tage</h2>
      <div className="card">
        <MuscleVolume rows={data.muscles} />
      </div>

      <h2 className="section-title">Fortschritt je Übung</h2>
      <ul className="tiles">
        {exerciseRows.map(([id, info]) => (
          <li key={id}>
            <button type="button" className="tile" onClick={() => props.onExercise(id)}>
              <span className="tile-title">
                <strong>{props.nameOf(id)}</strong>
                <small>
                  {info.sessions} {info.sessions === 1 ? 'Einheit' : 'Einheiten'} · zuletzt {fmtDay(info.lastAt)}
                </small>
              </span>
              <Icon name="trend" size={20} />
            </button>
          </li>
        ))}
      </ul>
      {data.exercises.length > 8 && (
        <button type="button" className="link" onClick={() => setAllExercises((v) => !v)}>
          {allExercises ? 'Weniger anzeigen' : `Alle ${data.exercises.length} Übungen anzeigen`}
        </button>
      )}

      <h2 className="section-title">Einheiten</h2>
      <ul className="tiles">
        {workouts.slice(0, shown).map((w) => {
          const t = workoutTotals(w);
          return (
            <li key={w.id}>
              <button type="button" className="tile" onClick={() => props.onWorkout(w.id)}>
                <span className="tile-title">
                  <strong>{w.name}</strong>
                  <small>
                    {fmtDay(w.startedAt)}
                    {t.durationMin !== null && ` · ${t.durationMin} min`} · {t.workingSets} Sätze
                    {t.volumeKg > 0 && ` · ${fmtVolume(t.volumeKg)}`}
                  </small>
                </span>
                <Icon name="forward" size={20} />
              </button>
            </li>
          );
        })}
      </ul>
      {workouts.length > shown && (
        <button type="button" className="link" onClick={() => setShown((n) => n + 15)}>
          Ältere anzeigen
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function WorkoutDetail(props: {
  workout: HistWorkout;
  nameOf: (id: string) => string;
  onBack: () => void;
  onExercise: (id: string) => void;
}) {
  const { workout: w } = props;
  const t = workoutTotals(w);
  return (
    <div className="editor">
      <AppBar title={w.name} backLabel="Zurück zum Verlauf" onBack={props.onBack} />
      <div className="screen">
        <p className="eyebrow">
          {fmtDayLong(w.startedAt)}, {fmtTime(w.startedAt)} Uhr
        </p>
        <StatGrid
          items={[
            { label: 'Dauer', value: t.durationMin === null ? '–' : `${t.durationMin} min` },
            { label: 'Sätze', value: num0(t.workingSets) },
            { label: 'Volumen', value: t.volumeKg > 0 ? fmtVolume(t.volumeKg) : '–' },
          ]}
        />

        <ul className="sumlist">
          {w.exercises
            .filter((ex) => ex.sets.length > 0)
            .map((ex) => {
              const st = exerciseStats(ex);
              return (
                <li key={ex.exerciseId} className="sumex">
                  <div className="sumex-head">
                    <h3>{props.nameOf(ex.exerciseId)}</h3>
                    <button type="button" className="textbtn" onClick={() => props.onExercise(ex.exerciseId)}>
                      <Icon name="trend" size={16} /> Verlauf
                    </button>
                  </div>
                  {ex.equipmentKg ? <p className="sumex-line"><span>Stange / Maschine</span> {fmtKg(ex.equipmentKg)}</p> : null}
                  <table className="datatable sets">
                    <thead>
                      <tr>
                        <th scope="col">Satz</th>
                        <th scope="col">kg</th>
                        <th scope="col">Wdh.</th>
                        <th scope="col">1RM ≈</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        let wi = 0;
                        let wu = 0;
                        return ex.sets.map((s, i) => {
                          const label = s.type === 'warmup' ? `W${++wu}` : String(++wi);
                          const load = totalLoad(s.weightKg, ex.equipmentKg);
                          const rm = s.type === 'working' ? estimate1RM(load, s.reps) : null;
                          const isTop = st.topSet && s.type === 'working' && s.weightKg === st.topSet.weightKg && s.reps === st.topSet.reps;
                          return (
                            <tr key={i} className={s.type === 'warmup' ? 'warm' : ''}>
                              <th scope="row">{label}</th>
                              <td>{s.weightKg === 0 ? '–' : fmtKg(s.weightKg).replace(' kg', '')}</td>
                              <td>{s.reps}</td>
                              <td className={isTop ? 'best' : ''}>{rm === null || s.reps === 1 ? '–' : fmtKg(rm).replace(' kg', '')}</td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </li>
              );
            })}
        </ul>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type Metric = 'e1rm' | 'weight' | 'volume' | 'reps';

const METRICS: { key: Metric; label: string; title: string }[] = [
  { key: 'e1rm', label: '1RM (geschätzt)', title: 'Geschätztes 1RM' },
  { key: 'weight', label: 'Höchste Last', title: 'Höchste Last eines Arbeitssatzes' },
  { key: 'volume', label: 'Volumen', title: 'Volumen (Last × Wiederholungen)' },
  { key: 'reps', label: 'Wiederholungen', title: 'Wiederholungen in den Arbeitssätzen' },
];

function ExerciseProgress(props: {
  workouts: HistWorkout[];
  exerciseId: string;
  name: string;
  onBack: () => void;
}) {
  const all = useMemo(() => exercisePoints(props.workouts, props.exerciseId), [props.workouts, props.exerciseId]);
  const hasRm = all.some((p) => p.best1RM !== null);
  const hasLoad = all.some((p) => p.topLoadKg > 0);
  const [metric, setMetric] = useState<Metric>(hasRm ? 'e1rm' : hasLoad ? 'weight' : 'reps');
  const [range, setRange] = useState<'90' | 'all'>('all');
  const [table, setTable] = useState(false);

  const format = (v: number): string =>
    metric === 'volume' ? fmtVolume(v) : metric === 'reps' ? `${num0(v)} Wdh.` : fmtKg(v);

  const inRange = range === '90' ? all.filter((p) => p.at >= Date.now() - 90 * DAY_MS) : all;
  const series: (ChartPoint & { sets: number; top: string })[] = inRange.flatMap((p) => {
    const v =
      metric === 'e1rm' ? p.best1RM : metric === 'weight' ? p.topLoadKg : metric === 'volume' ? p.volumeKg : p.reps;
    if (v === null || v <= 0) return [];
    const top = p.topSet
      ? p.topSet.loadKg === 0
        ? `${p.topSet.reps} Wdh.`
        : `${fmtKg(p.topSet.weightKg)} × ${p.topSet.reps}`
      : '–';
    return [{ at: p.at, value: v, caption: `Bester Satz ${top}`, sets: p.workingSets, top }];
  });

  const first = series[0];
  const last = series[series.length - 1];
  const best = series.reduce<(typeof series)[number] | null>((b, s) => (b === null || s.value > b.value ? s : b), null);
  const change = first && last && series.length > 1 ? last.value - first.value : null;
  const changePct = change !== null && first.value > 0 ? Math.round((change / first.value) * 100) : null;
  const title = METRICS.find((m) => m.key === metric)!.title;

  return (
    <div className="editor">
      <AppBar title={props.name} backLabel="Zurück" onBack={props.onBack} />
      <div className="screen">
        <div className="filterrow" role="group" aria-label="Kennzahl">
          <div className="chips scroll">
            {METRICS.map((m) => (
              <button
                key={m.key}
                type="button"
                className={metric === m.key ? 'chip on' : 'chip'}
                aria-pressed={metric === m.key}
                onClick={() => setMetric(m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="chips sm rangechips" role="group" aria-label="Zeitraum">
            <button type="button" className={range === '90' ? 'chip on' : 'chip'} aria-pressed={range === '90'} onClick={() => setRange('90')}>
              3 Monate
            </button>
            <button type="button" className={range === 'all' ? 'chip on' : 'chip'} aria-pressed={range === 'all'} onClick={() => setRange('all')}>
              Alle
            </button>
          </div>
        </div>

        <section className="card chartcard">
          <h2>{title}</h2>
          {series.length === 0 ? (
            <p className="muted">
              {metric === 'e1rm'
                ? `Für die 1RM-Schätzung braucht es Sätze mit Gewicht und höchstens ${ONE_RM_MAX_REPS} Wiederholungen.`
                : 'Für diese Kennzahl gibt es im gewählten Zeitraum noch keine Werte.'}
            </p>
          ) : (
            <>
              <LineChart points={series} format={format} label={`${props.name}: ${title}`} />
              {series.length === 1 && <p className="muted">Mit einer weiteren Einheit entsteht ein Verlauf.</p>}
            </>
          )}
        </section>

        {series.length > 0 && best && last && (
          <StatGrid
            items={[
              { label: 'Bestwert', value: format(best.value), sub: fmtShortYear(best.at) },
              { label: 'Zuletzt', value: format(last.value), sub: fmtShortYear(last.at) },
              {
                label: 'Änderung',
                value: change === null ? '–' : `${change > 0 ? '+' : change < 0 ? '−' : '±'}${format(Math.abs(change))}`,
                sub: changePct === null ? `${series.length} Einheiten` : `${fmtPercent(changePct)} seit ${fmtShortYear(first.at)}`,
              },
            ]}
          />
        )}

        {metric === 'e1rm' && (
          <p className="evidence">
            Geschätzt nach Epley: Last × (1 + Wiederholungen ÷ 30), nur bis {ONE_RM_MAX_REPS} Wiederholungen. Schätzformeln
            sind bei wenigen Wiederholungen am genauesten; mit Stange oder Maschine zählt die Gesamtlast.
          </p>
        )}

        {series.length > 0 && (
          <>
            <button type="button" className="textbtn tablebtn" aria-expanded={table} onClick={() => setTable((v) => !v)}>
              <Icon name="table" size={18} /> {table ? 'Tabelle ausblenden' : 'Als Tabelle anzeigen'}
            </button>
            {table && (
              <table className="datatable">
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col">{METRICS.find((m) => m.key === metric)!.label}</th>
                    <th scope="col">Bester Satz</th>
                    <th scope="col">Sätze</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((s) => (
                    <tr key={s.at}>
                      <th scope="row">{fmtShortYear(s.at)}</th>
                      <td>{format(s.value)}</td>
                      <td>{s.top}</td>
                      <td>{s.sets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
