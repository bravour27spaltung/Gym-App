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
  musclePoints,
  windowTotals,
  workoutTotals,
  type ExerciseMeta,
  type HistWorkout,
} from '../lib/stats';
import { muscleLabel } from '../lib/muscles';
import { formatClock } from '../lib/timer';
import { totalLoad } from '../lib/weight';
import {
  exerciseRows,
  filterExerciseRows,
  groupExercisesByMuscle,
  groupWorkoutsByMonth,
  type ExerciseRow,
} from '../lib/historyView';
import { LineChart, type ChartPoint } from './Chart';
import { MuscleVolume } from './MuscleVolume';
import { AppBar, Icon, StatGrid } from './ui';

interface Props {
  workouts: HistWorkout[];
  meta: Record<string, ExerciseMeta | undefined>;
  /** Öffnet direkt das Detail dieser Einheit (z. B. aus dem Reiter „Alle"). */
  openWorkoutId?: string | null;
}

type Section = 'overview' | 'sessions' | 'exercises';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'overview', label: 'Übersicht' },
  { key: 'sessions', label: 'Einheiten' },
  { key: 'exercises', label: 'Übungen' },
];

/** Zeitraum der Übersicht in Tagen. */
const RANGES = [
  { days: 7, label: '7 Tage', title: 'Letzte 7 Tage' },
  { days: 28, label: '4 Wochen', title: 'Letzte 4 Wochen' },
  { days: 90, label: '3 Monate', title: 'Letzte 3 Monate' },
] as const;

type View =
  | { kind: 'overview' }
  | { kind: 'workout'; id: string }
  | { kind: 'exercise'; id: string }
  | { kind: 'muscle'; muscle: string };

const DAY_MS = 24 * 60 * 60 * 1000;

const FEEDBACK_LABEL: Record<string, string> = { great: '💪 Stark', ok: '🙂 Okay', hard: '😓 Schwer' };

export function HistoryScreen({ workouts, meta, openWorkoutId }: Props) {
  const [stack, setStack] = useState<View[]>(
    openWorkoutId ? [{ kind: 'overview' }, { kind: 'workout', id: openWorkoutId }] : [{ kind: 'overview' }],
  );
  // Reiter, Zeitraum und Suche liegen hier, damit sie nach „Zurück" aus einem Detail erhalten bleiben.
  const [section, setSection] = useState<Section>(openWorkoutId ? 'sessions' : 'overview');
  const [rangeDays, setRangeDays] = useState<number>(7);
  const [query, setQuery] = useState('');
  const view = stack[stack.length - 1];
  const push = (v: View) => setStack((s) => [...s, v]);
  const pop = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const nameOf = (id: string) => meta[id]?.name ?? 'Übung';

  if (view.kind === 'workout') {
    const w = workouts.find((x) => x.id === view.id);
    if (w) return <WorkoutDetail workout={w} nameOf={nameOf} onBack={pop} onExercise={(id) => push({ kind: 'exercise', id })} />;
  }
  if (view.kind === 'exercise') {
    return (
      <ExerciseProgress
        workouts={workouts}
        exerciseId={view.id}
        name={nameOf(view.id)}
        onBack={pop}
        onWorkout={(id) => push({ kind: 'workout', id })}
      />
    );
  }
  if (view.kind === 'muscle') {
    return (
      <MuscleProgress workouts={workouts} meta={meta} muscle={view.muscle} onBack={pop} onExercise={(id) => push({ kind: 'exercise', id })} />
    );
  }
  return (
    <Overview
      workouts={workouts}
      meta={meta}
      section={section}
      onSection={setSection}
      rangeDays={rangeDays}
      onRange={setRangeDays}
      query={query}
      onQuery={setQuery}
      onWorkout={(id) => push({ kind: 'workout', id })}
      onExercise={(id) => push({ kind: 'exercise', id })}
      onMuscle={(muscle) => push({ kind: 'muscle', muscle })}
    />
  );
}

// ---------------------------------------------------------------------------

function Overview(props: {
  workouts: HistWorkout[];
  meta: Record<string, ExerciseMeta | undefined>;
  section: Section;
  onSection: (s: Section) => void;
  rangeDays: number;
  onRange: (days: number) => void;
  query: string;
  onQuery: (q: string) => void;
  onWorkout: (id: string) => void;
  onExercise: (id: string) => void;
  onMuscle: (muscle: string) => void;
}) {
  const { workouts, meta, section, rangeDays, query } = props;
  const range = RANGES.find((r) => r.days === rangeDays) ?? RANGES[0];

  const summary = useMemo(() => {
    const now = new Date();
    const cur = lastDays(now, rangeDays);
    const prev = { from: new Date(cur.from.getTime() - rangeDays * DAY_MS), to: cur.from };
    const muscleOf = (id: string) => ({ primary: meta[id]?.primary ?? [], secondary: meta[id]?.secondary ?? [] });
    // Der Richtwert (10–20 Sätze) gilt pro Woche: bei längeren Zeiträumen Durchschnitt je Woche.
    const weeks = rangeDays / 7;
    return {
      week: windowTotals(workouts, cur.from, cur.to),
      before: windowTotals(workouts, prev.from, prev.to),
      muscles: muscleSets(workouts, cur.from, cur.to, muscleOf).map((m) => ({ ...m, sets: m.sets / weeks })),
    };
  }, [workouts, meta, rangeDays]);
  const months = useMemo(() => groupWorkoutsByMonth(workouts), [workouts]);
  const rows = useMemo(() => exerciseRows(workouts, meta), [workouts, meta]);

  if (workouts.length === 0) {
    return (
      <div className="screen">
        <div className="empty-state">
          <Icon name="chart" size={32} />
          <p>Noch kein abgeschlossenes Training.</p>
          <p className="muted">Nach dem ersten gespeicherten Training erscheinen hier deine Auswertungen.</p>
        </div>
      </div>
    );
  }

  const { week, before } = summary;

  return (
    <div className="screen">
      <nav className="chips sm subtabs" role="tablist" aria-label="Gym-Verlauf">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={section === s.key}
            className={section === s.key ? 'chip on' : 'chip'}
            onClick={() => props.onSection(s.key)}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {section === 'overview' && (
        <>
          <div className="chips sm rangechips" role="group" aria-label="Zeitraum">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                className={rangeDays === r.days ? 'chip on' : 'chip'}
                aria-pressed={rangeDays === r.days}
                onClick={() => props.onRange(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <h2 className="section-title">{range.title}</h2>
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

          <h2 className="section-title">{rangeDays === 7 ? 'Sätze pro Muskel, letzte 7 Tage' : 'Sätze pro Muskel, Ø pro Woche'}</h2>
          <div className="card">
            <MuscleVolume rows={summary.muscles} />
          </div>
        </>
      )}

      {section === 'sessions' &&
        months.map((m) => (
          <section key={m.key} aria-label={m.label}>
            <h2 className="section-title monthhead">
              <span>{m.label}</span>
              <span className="monthsum">
                {m.sessions} {m.sessions === 1 ? 'Einheit' : 'Einheiten'} · {num0(m.workingSets)} Sätze
                {m.volumeKg > 0 && ` · ${fmtVolumeShort(m.volumeKg)}`}
              </span>
            </h2>
            <ul className="tiles">
              {m.workouts.map((w) => {
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
                          {w.feedback && ` · ${FEEDBACK_LABEL[w.feedback]}`}
                        </small>
                      </span>
                      <Icon name="forward" size={20} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}

      {section === 'exercises' && (
        <ExerciseList rows={rows} query={query} onQuery={props.onQuery} onExercise={props.onExercise} onMuscle={props.onMuscle} />
      )}
    </div>
  );
}

function ExerciseList(props: {
  rows: ExerciseRow[];
  query: string;
  onQuery: (q: string) => void;
  onExercise: (id: string) => void;
  onMuscle: (muscle: string) => void;
}) {
  const shown = filterExerciseRows(props.rows, props.query);
  const groups = groupExercisesByMuscle(shown, muscleLabel);
  return (
    <>
      <div className="searchrow histsearch">
        <label className="searchbar">
          <Icon name="search" size={20} />
          <input
            type="search"
            placeholder="Übung suchen"
            value={props.query}
            onChange={(e) => props.onQuery(e.target.value)}
            aria-label="Übung suchen"
          />
        </label>
      </div>
      {groups.length === 0 && <p className="muted">Keine Übung gefunden.</p>}
      {groups.map((g) => (
        <section key={g.muscle || 'none'} aria-label={g.muscle ? muscleLabel(g.muscle) : 'Ohne Muskelangabe'}>
          <div className="grouphead">
            <h2 className="section-title">{g.muscle ? muscleLabel(g.muscle) : 'Ohne Muskelangabe'}</h2>
            {g.muscle && (
              <button type="button" className="link" onClick={() => props.onMuscle(g.muscle)}>
                Kraftverlauf
              </button>
            )}
          </div>
          <ul className="tiles">
            {g.rows.map((r) => (
              <li key={r.id}>
                <button type="button" className="tile" onClick={() => props.onExercise(r.id)}>
                  <span className="tile-title">
                    <strong>{r.name}</strong>
                    <small>
                      {r.sessions} {r.sessions === 1 ? 'Einheit' : 'Einheiten'} · zuletzt {fmtDay(r.lastAt)}
                    </small>
                  </span>
                  <TrendCell row={r} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

const fmtTrendValue = (r: ExerciseRow, v: number): string => (r.unit === 'kg' ? fmtKg(v) : `${num0(v)} Wdh.`);

/** Mini-Verlauf der letzten Einheiten plus letzter Wert und Änderung zur Einheit davor. */
function TrendCell({ row }: { row: ExerciseRow }) {
  if (row.last === null) return <Icon name="trend" size={20} />;
  const d = row.delta;
  const dir = d === null || d === 0 ? 'flat' : d > 0 ? 'up' : 'down';
  const deltaText = d === null ? '' : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${fmtTrendValue(row, Math.abs(d))}`;
  return (
    <span className="tile-trend">
      <Sparkline values={row.trend} />
      <span className="tile-value">
        <strong>{fmtTrendValue(row, row.last)}</strong>
        {deltaText && <small className={`delta ${dir}`}>{deltaText}</small>}
      </span>
    </span>
  );
}

/** Winzige Linie ohne Achsen; nur Richtung und Verlauf, Werte stehen daneben. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <span className="spark" aria-hidden="true" />;
  const W = 56;
  const H = 22;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => (max === min ? H / 2 : H - 2 - ((v - min) / (max - min)) * (H - 4));
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
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
          {w.feedback && ` · ${FEEDBACK_LABEL[w.feedback]}`}
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
                              <td>{s.durationSeconds != null ? formatClock(s.durationSeconds) : s.reps}</td>
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
  onWorkout: (id: string) => void;
}) {
  const all = useMemo(() => exercisePoints(props.workouts, props.exerciseId), [props.workouts, props.exerciseId]);
  const hasRm = all.some((p) => p.best1RM !== null);
  const hasLoad = all.some((p) => p.topLoadKg > 0);
  const [metric, setMetric] = useState<Metric>(hasRm ? 'e1rm' : hasLoad ? 'weight' : 'reps');
  const [range, setRange] = useState<'90' | 'all'>('all');
  
  const format = (v: number): string =>
    metric === 'volume' ? fmtVolume(v) : metric === 'reps' ? `${num0(v)} Wdh.` : fmtKg(v);

  const inRange = range === '90' ? all.filter((p) => p.at >= Date.now() - 90 * DAY_MS) : all;
  const series: (ChartPoint & { sets: number; top: string; workoutId: string })[] = inRange.flatMap((p) => {
    const v =
      metric === 'e1rm' ? p.best1RM : metric === 'weight' ? p.topLoadKg : metric === 'volume' ? p.volumeKg : p.reps;
    if (v === null || v <= 0) return [];
    const top = p.topSet
      ? p.topSet.loadKg === 0
        ? `${p.topSet.reps} Wdh.`
        : `${p.topSet.reps} × ${fmtKg(p.topSet.weightKg)}`
      : '–';
    return [{ at: p.at, value: v, caption: `Bester Satz ${top}`, sets: p.workingSets, top, workoutId: p.workoutId }];
  });

  const first = series[0];
  const last = series[series.length - 1];
  const best = series.reduce<(typeof series)[number] | null>((b, s) => (b === null || s.value > b.value ? s : b), null);
  const change = first && last && series.length > 1 ? last.value - first.value : null;
  const changePct = change !== null && first.value > 0 ? Math.round((change / first.value) * 100) : null;
  const title = METRICS.find((m) => m.key === metric)!.title;

  // Rekorde über alle Einheiten, unabhängig von Kennzahl und Zeitraum.
  const records = [
    { label: 'Schwerste Last', value: Math.max(0, ...all.map((p) => p.topLoadKg)), fmt: fmtKg },
    { label: 'Bestes 1RM ≈', value: Math.max(0, ...all.map((p) => p.best1RM ?? 0)), fmt: fmtKg },
    { label: 'Bestes Volumen', value: Math.max(0, ...all.map((p) => p.volumeKg)), fmt: fmtVolume },
    { label: 'Meiste Wdh.', value: Math.max(0, ...all.map((p) => p.reps)), fmt: (v: number) => `${num0(v)} Wdh.` },
  ].filter((r) => r.value > 0);

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


        {metric === 'e1rm' && (
          <p className="evidence">
            Geschätzt nach Epley: Last × (1 + Wiederholungen ÷ 30), nur bis {ONE_RM_MAX_REPS} Wiederholungen. Schätzformeln
            sind bei wenigen Wiederholungen am genauesten; mit Stange oder Maschine zählt die Gesamtlast.
          </p>
        )}

        {records.length > 0 && (
          <>
            <h2 className="section-title">Rekorde</h2>
            <StatGrid columns={2} items={records.map((r) => ({ label: r.label, value: r.fmt(r.value) }))} />
          </>
        )}

        {series.length > 0 && (
          <>
            <h2 className="section-title">Einheiten</h2>
            <ul className="tiles">
              {[...series].reverse().map((s) => (
                <li key={s.workoutId}>
                  <button type="button" className="tile" onClick={() => props.onWorkout(s.workoutId)}>
                    <span className="tile-title">
                      <strong>{format(s.value)}</strong>
                      <small>
                        {fmtShortYear(s.at)} · Bester Satz {s.top} · {s.sets} {s.sets === 1 ? 'Satz' : 'Sätze'}
                      </small>
                    </span>
                    <Icon name="forward" size={20} />
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

type MuscleMetric = 'e1rm' | 'weight';

function MuscleProgress(props: {
  workouts: HistWorkout[];
  meta: Record<string, ExerciseMeta | undefined>;
  muscle: string;
  onBack: () => void;
  onExercise: (id: string) => void;
}) {
  const { meta } = props;
  const muscleOf = (id: string) => ({ primary: meta[id]?.primary ?? [], secondary: meta[id]?.secondary ?? [] });
  const nameOf = (id: string) => meta[id]?.name ?? 'Übung';
  const all = useMemo(
    () => musclePoints(props.workouts, props.muscle, muscleOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.workouts, meta, props.muscle],
  );
  const hasRm = all.some((p) => p.best1RM !== null);
  const [metric, setMetric] = useState<MuscleMetric>(hasRm ? 'e1rm' : 'weight');
  const [range, setRange] = useState<'90' | 'all'>('all');
  const [table, setTable] = useState(false);

  const format = (v: number): string => fmtKg(v);
  const title = metric === 'e1rm' ? 'Geschätztes 1RM' : 'Höchste Last';

  const inRange = range === '90' ? all.filter((p) => p.at >= Date.now() - 90 * DAY_MS) : all;
  const series: (ChartPoint & { exerciseId: string; top: string })[] = inRange.flatMap((p) => {
    const v = metric === 'e1rm' ? p.best1RM : p.topLoadKg;
    if (v === null || v <= 0) return [];
    const top = p.topSet
      ? p.topSet.loadKg === 0
        ? `${p.topSet.reps} Wdh.`
        : `${p.topSet.reps} × ${fmtKg(p.topSet.weightKg)}`
      : '–';
    return [{ at: p.at, value: v, caption: `${nameOf(p.exerciseId)} · ${top}`, exerciseId: p.exerciseId, top }];
  });

  const first = series[0];
  const last = series[series.length - 1];
  const best = series.reduce<(typeof series)[number] | null>((b, s) => (b === null || s.value > b.value ? s : b), null);
  const change = first && last && series.length > 1 ? last.value - first.value : null;
  const changePct = change !== null && first.value > 0 ? Math.round((change / first.value) * 100) : null;

  return (
    <div className="editor">
      <AppBar title={muscleLabel(props.muscle)} backLabel="Zurück" onBack={props.onBack} />
      <div className="screen">
        <p className="muted">
          Je Training die Übung mit der höchsten Last für diesen Hauptmuskel – ein Näherungswert, kein
          direkt gemessener „Muskelkraft"-Wert: verschiedene Übungen sind nicht 1:1 vergleichbar.
        </p>

        <div className="filterrow" role="group" aria-label="Kennzahl">
          <div className="chips scroll">
            <button
              type="button"
              className={metric === 'e1rm' ? 'chip on' : 'chip'}
              aria-pressed={metric === 'e1rm'}
              onClick={() => setMetric('e1rm')}
            >
              1RM (geschätzt)
            </button>
            <button
              type="button"
              className={metric === 'weight' ? 'chip on' : 'chip'}
              aria-pressed={metric === 'weight'}
              onClick={() => setMetric('weight')}
            >
              Höchste Last
            </button>
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
              <LineChart points={series} format={format} label={`${muscleLabel(props.muscle)}: ${title}`} />
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
                    <th scope="col">{title}</th>
                    <th scope="col">Übung</th>
                    <th scope="col">Bester Satz</th>
                  </tr>
                </thead>
                <tbody>
                  {[...series].reverse().map((s) => (
                    <tr key={s.at}>
                      <th scope="row">{fmtShortYear(s.at)}</th>
                      <td>{format(s.value)}</td>
                      <td>
                        <button type="button" className="link" onClick={() => props.onExercise(s.exerciseId)}>
                          {nameOf(s.exerciseId)}
                        </button>
                      </td>
                      <td>{s.top}</td>
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
