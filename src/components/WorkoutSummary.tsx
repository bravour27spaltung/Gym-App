import { fmtDayLong, fmtKg, fmtPercent, fmtTime, fmtVolume, num0 } from '../lib/format';
import type { ExerciseSummary, WorkoutSummary } from '../lib/stats';
import { MuscleVolume } from './MuscleVolume';
import { Icon, StatGrid } from './ui';

interface Props {
  summary: WorkoutSummary;
  onDone: () => void;
}

function topSetText(ex: ExerciseSummary): string | null {
  const t = ex.topSet;
  if (!t) return null;
  if (t.loadKg === 0) return `${t.reps} Wdh.`;
  const base = `${fmtKg(t.weightKg)} × ${t.reps}`;
  const total = t.loadKg !== t.weightKg ? ` (Σ ${fmtKg(t.loadKg)})` : '';
  const rm = t.oneRm !== null && t.reps > 1 ? ` · 1RM ≈ ${fmtKg(t.oneRm)}` : '';
  return `${base}${total}${rm}`;
}

/** Auswertung direkt nach dem Speichern eines Trainings. */
export function WorkoutSummaryScreen({ summary, onDone }: Props) {
  const { workout, totals, exercises, records, muscles } = summary;
  const nameOf = (id: string) => exercises.find((e) => e.exerciseId === id)?.name ?? 'Übung';
  const recordExercises = [...new Set(records.map((r) => r.exerciseId))];

  return (
    <div className="screen wsum">
      <section className="hero">
        <p className="eyebrow">Training gespeichert</p>
        <h2>{workout.name}</h2>
        <p className="hero-sub">
          {fmtDayLong(workout.startedAt)}, {fmtTime(workout.startedAt)} Uhr
        </p>
        <StatGrid
          columns={2}
          items={[
            { label: 'Dauer', value: totals.durationMin === null ? '–' : `${num0(totals.durationMin)} min` },
            { label: 'Arbeitssätze', value: num0(totals.workingSets) },
            { label: 'Wiederholungen', value: num0(totals.reps) },
            { label: 'Volumen', value: totals.volumeKg > 0 ? fmtVolume(totals.volumeKg) : '–' },
          ]}
        />
      </section>

      {recordExercises.length > 0 && (
        <section className="card records" aria-label="Neue Bestwerte">
          <h2>
            <Icon name="trophy" size={20} /> Neue Bestwerte
          </h2>
          <ul>
            {recordExercises.map((id) => (
              <li key={id}>
                <strong>{nameOf(id)}</strong>
                {records
                  .filter((r) => r.exerciseId === id)
                  .map((r) => (
                    <span key={r.kind}>
                      {r.kind === 'load' ? 'Höchste Last' : 'Geschätztes 1RM'} {fmtKg(r.value)}
                      <em> (vorher {fmtKg(r.previous)})</em>
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      <h2 className="section-title">Übungen</h2>
      <ul className="sumlist">
        {exercises.map((ex) => (
          <li key={ex.exerciseId} className="sumex">
            <div className="sumex-head">
              <h3>{ex.name}</h3>
              {ex.records.length > 0 && (
                <span className="pill accent">
                  <Icon name="trophy" size={12} /> Bestwert
                </span>
              )}
            </div>
            {topSetText(ex) && (
              <p className="sumex-line">
                <span>Bester Satz</span> {topSetText(ex)}
              </p>
            )}
            <p className="sumex-line">
              <span>Volumen</span>{' '}
              {ex.volumeKg > 0 ? `${fmtVolume(ex.volumeKg)} · ` : ''}
              {ex.workingSets} {ex.workingSets === 1 ? 'Satz' : 'Sätze'}
              {ex.volumeDeltaPct !== null && ` · ${fmtPercent(ex.volumeDeltaPct)} zum letzten Mal`}
              {ex.previous === null && ' · erste Einheit mit dieser Übung'}
            </p>
            {ex.next && (
              <p className="sumex-next">
                <Icon name="trend" size={16} />
                {ex.next === 'increase'
                  ? 'Nächstes Mal: Gewicht steigern'
                  : 'Nächstes Mal: Gewicht halten, mehr Wiederholungen anstreben'}
              </p>
            )}
          </li>
        ))}
      </ul>

      {muscles.length > 0 && (
        <>
          <h2 className="section-title">Sätze pro Muskel, letzte 7 Tage</h2>
          <div className="card">
            <MuscleVolume
              rows={muscles.map((m) => ({ muscle: m.muscle, sets: m.week })).sort((a, b) => b.sets - a.sets)}
            />
          </div>
        </>
      )}

      <p className="evidence">
        Das 1RM ist eine Schätzung nach Epley (Last × (1 + Wiederholungen ÷ 30)), nur bis 12
        Wiederholungen und am genauesten bei wenigen. Der Richtwert für Wochensätze stammt aus
        einer Meta-Analyse (Schoenfeld, Ogborn &amp; Krieger 2017, J Sports Sci); Evidenz: mittel,
        die Studien dauerten meist nur wenige Wochen.
      </p>

      <button type="button" className="btn primary block" onClick={onDone}>
        Fertig
      </button>
    </div>
  );
}
