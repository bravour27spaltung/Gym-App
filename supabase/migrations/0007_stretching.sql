-- Stretching: eigener Bereich, getrennt von Krafttraining und Fußball, greift aber auf
-- dieselben Muskelgruppen-Schlüssel zu wie fit_exercises (primary_muscles).

-- Dehnübungen: eigene Datenbank, nur Details (Muskeln, Anleitung, übliche Haltezeit),
-- keine Sätze/Gewichte. Analog zu fit_exercises.
create table fit_stretch_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name_de text not null,
  muscles text[] not null default '{}',
  instructions_de text[],
  default_hold_seconds int check (default_hold_seconds > 0),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- Eine Stretching-Einheit: Dauer ergibt sich aus started_at/finished_at, dazu subjektives
-- Empfinden (Verspannung 1-10) vor und nach der Einheit.
create table fit_stretch_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  feeling_before int check (feeling_before between 1 and 10),
  feeling_after int check (feeling_after between 1 and 10),
  note text
);

-- Einzelne Dehnübungen innerhalb einer Session, mit tatsächlich gehaltener Zeit (per
-- Live-Timer erfasst) und Seite.
create table fit_stretch_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  session_id uuid not null references fit_stretch_sessions(id) on delete cascade,
  stretch_exercise_id uuid not null references fit_stretch_exercises(id),
  position int not null,
  side text not null default 'beidseitig' check (side in ('links', 'rechts', 'beidseitig')),
  hold_seconds int not null check (hold_seconds > 0),
  sets int not null default 1 check (sets > 0),
  done_at timestamptz not null default now()
);

create index on fit_stretch_items (session_id);
create index on fit_stretch_sessions (started_at desc);

-- Row-Level-Security wie beim bestehenden Schema: jede Zeile gehört genau einem Nutzer.
do $$
declare t text;
begin
  foreach t in array array[
    'fit_stretch_exercises', 'fit_stretch_sessions', 'fit_stretch_items'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_own', t);
  end loop;
end $$;
