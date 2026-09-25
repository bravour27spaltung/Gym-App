-- Sätze des jeweils letzten abgeschlossenen Trainings je Übung.
-- Dient der Vorbelegung und dem Progressionsvorschlag in der App.
-- security_invoker: die Row-Level-Security der Basistabellen gilt weiter.
create view fit_last_sets with (security_invoker = true) as
with latest as (
  select distinct on (we.exercise_id)
         we.exercise_id,
         we.id as workout_exercise_id
  from fit_workout_exercises we
  join fit_workouts w on w.id = we.workout_id
  where w.finished_at is not null
  order by we.exercise_id, w.started_at desc
)
select l.exercise_id, s.set_number, s.type, s.weight_kg, s.reps, s.rir
from latest l
join fit_sets s on s.workout_exercise_id = l.workout_exercise_id;

grant select on fit_last_sets to authenticated;
