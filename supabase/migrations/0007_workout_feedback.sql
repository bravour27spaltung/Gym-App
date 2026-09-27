-- Sehr kurzes, freiwilliges Feedback beim Speichern eines Trainings ("Wie lief's?").
-- Ein Tap auf einen von drei Chips, keine Pflicht; null = keine Angabe.
-- Wiederholbar: "if not exists" verhindert Fehler beim zweiten Ausführen.
alter table fit_workouts
  add column if not exists feedback text
  check (feedback is null or feedback in ('great', 'ok', 'hard'));
