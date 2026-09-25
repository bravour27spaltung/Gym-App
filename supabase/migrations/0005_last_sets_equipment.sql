-- Die View fit_last_sets liefert zusätzlich das Stangen-/Maschinengewicht des letzten
-- Trainings je Übung (Spalte equipment_kg), damit die App es vorbelegen kann.
-- Neue Spalten stehen am Ende, deshalb reicht "create or replace". Wiederholbar.
create or replace view fit_last_sets with (security_invoker = true) as
with latest as (
  select distinct on (we.exercise_id)
         we.exercise_id,
         we.id as workout_exercise_id,
         we.equipment_kg
  from fit_workout_exercises we
  join fit_workouts w on w.id = we.workout_id
  where w.finished_at is not null
  order by we.exercise_id, w.started_at desc
)
select l.exercise_id, s.set_number, s.type, s.weight_kg, s.reps, s.rir, l.equipment_kg
from latest l
join fit_sets s on s.workout_exercise_id = l.workout_exercise_id;

grant select on fit_last_sets to authenticated;
