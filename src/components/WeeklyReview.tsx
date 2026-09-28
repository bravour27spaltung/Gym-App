import { fmtDay, fmtKg, fmtVolume, num0 } from '../lib/format';
import type { ExerciseProgressLine, WeeklyReview } from '../lib/weeklyReview';
import { MuscleVolume } from './MuscleVolume';
import { Icon, StatGrid } from './ui';

interface Props {
  review: WeeklyReview;
  onDone: () => void;
}

function actionText(a: ExerciseProgressLine['action']): string | null {
  if (a === 'increase') return 'Steigern';
  if (a === 'hold') return 'Halten';
  return null;
}

/** Wochenrückblick, erscheint nach dem letzten Trainingstag der Plan-Rotation. */
export function WeeklyReviewScreen({ review, onDone }: Props) {
  const { totals, adherence, muscles, exercises, records } = review;
  const nameOf = (id: string) => exercises.find((e) => e.exerciseId === id)?.name ?? 'Übung';
  const recordExercises = [...new Set(records.map((r) => r.exerciseId))];

  return (
    <div className="screen wsum">
      <section className="hero">
        <p className="eyebrow">Wochenrückblick</p>
        <h2>{adherence.planName}</h2>
        <p className="hero-sub">
          {fmtDay(review.from)} – {fmtDay(review.to)} · {adherence.doneSessions} von {adherence.plannedDays}{' '}
          {adherence.plannedDays === 1 ? 'geplanten Trainingstag' : 'geplanten Trainingstagen'}
        </p>
        <StatGrid
          columns={2}
          items={[
            { label: 'Trainings', value: num0(totals.sessions) },
            { label: 'Arbeitssätze', value: num0(totals.workingSets) },
            { label: 'Wiederholungen', value: num0(totals.reps) },
            { label: 'Volumen', value: totals.volumeKg > 0 ? fmtVolume(totals.volumeKg) : '–' },
          ]}
        />
      </section>

      {recordExercises.length > 0 && (
        <section className="card records" aria-label="Neue Bestwerte diese Woche">
          <h2>
            <Icon name="trophy" size={20} /> Neue Bestwerte
          </h2>
          <ul>
            {recordExercises.map((id) => (
              <li key={id}>
                <strong>{nameOf(id)}</strong>
                {records
                  .filter((r) => r.exerciseId === id)
                  .map((r, i) => (
                    <span key={`${r.kind}-${i}`}>
                      {r.kind === 'load' ? 'Höchste Last' : 'Geschätztes 1RM'} {fmtKg(r.value)}
                      <em> (vorher {fmtKg(r.previous)})</em>
                    </span>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {muscles.length > 0 && (
        <>
          <h2 className="section-title">Sätze pro Muskel</h2>
          <div className="card">
            <MuscleVolume rows={muscles.map((m) => ({ muscle: m.muscle, sets: m.sets }))} />
          </div>
        </>
      )}

      {exercises.length > 0 && (
        <>
          <h2 className="section-title">Übungen</h2>
          <ul className="sumlist">
            {exercises.map((ex) => (
              <li key={ex.exerciseId} className="sumex">
                <div className="sumex-head">
                  <h3>{ex.name}</h3>
                </div>
                <p className="sumex-line">
                  <span>Diese Woche</span> {ex.workingSets} {ex.workingSets === 1 ? 'Satz' : 'Sätze'} ·{' '}
                  {ex.sessions} {ex.sessions === 1 ? 'Training' : 'Trainings'}
                </p>
                {actionText(ex.action) && (
                  <p className="sumex-next">
                    <Icon name="trend" size={16} /> Nächstes Mal: {actionText(ex.action)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="evidence">
        Zeitraum: die letzten 7 Tage bis zu diesem Training, nicht die Kalenderwoche. Der
        Richtwert 10–20 Sätze pro Muskel und Woche stammt aus einer Meta-Analyse (Schoenfeld,
        Ogborn &amp; Krieger 2017, J Sports Sci); Evidenz: mittel, die Studien dauerten meist nur
        wenige Wochen, der Zusatznutzen nimmt bei höherem Volumen ab. Die Häufigkeit je Muskel
        ist zur Information angegeben, nicht bewertet: Bei gleichem Wochenvolumen ist ihr Effekt
        auf den Muskelaufbau laut Meta-Analysen klein bis unklar (Schoenfeld, Ogborn &amp; Krieger
        2016, Sports Med). „Steigern"/„Halten" folgt derselben Double-Progression-Regel wie nach
        jedem Training, aus der jüngsten Einheit dieser Woche.
      </p>

      <button type="button" className="btn primary block" onClick={onDone}>
        Fertig
      </button>
    </div>
  );
}
