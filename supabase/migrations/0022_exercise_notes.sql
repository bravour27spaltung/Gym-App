-- Sitzeinstellung / Notiz je Übung (z. B. "Sitz 4, Rückenlehne 3").
-- Bisher stand die Notiz nur an der Planübung und ging bei freiem Training, Vorlagen und im Training
-- hinzugefügten Übungen nach der Session verloren. Jetzt gehört sie zur Übung selbst.
-- Wiederholbar (if not exists / drop policy if exists).
create table if not exists fit_exercise_notes (
  exercise_id uuid primary key references fit_exercises(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  note text not null check (char_length(note) between 1 and 500),
  updated_at timestamptz not null default now()
);

alter table fit_exercise_notes enable row level security;
grant select, insert, update, delete on fit_exercise_notes to authenticated;

drop policy if exists fit_exercise_notes_own on fit_exercise_notes;
create policy fit_exercise_notes_own on fit_exercise_notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
