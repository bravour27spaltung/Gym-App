-- Gym-App: Schema mit Präfix fit_ (teilt sich das Supabase-Projekt mit anderen Apps).
-- Alle Tabellen sind per Row-Level-Security auf den eingeloggten Nutzer beschränkt.
-- Nach dem Anlegen deines Nutzers: in Supabase unter Authentication die
-- Registrierung neuer Nutzer abschalten ("Allow new users to sign up" = aus).

create extension if not exists pgcrypto;

-- Gewichte sind kg im 0,25er-Raster (Ganze Kilo + 0 / 0,25 / 0,5 / 0,75).
create domain fit_kg as numeric(6,2)
  check (value >= 0 and (value * 4) = round(value * 4));

-- Übungen: aus offener Datenbank importiert (source = 'free-exercise-db') oder eigene.
-- Der Katalog enthält nur Details zur Übung (Muskelgruppen, Gerät, Anleitung), keine Gewichte.
-- Welches Gewicht du nimmst, steht ausschließlich bei den Sätzen (fit_sets).
create table fit_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  source text not null default 'custom',
  source_id text,
  name_en text,
  name_de text not null,
  variant_of uuid references fit_exercises(id) on delete set null,
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  equipment text,                 -- Geräteart, z. B. 'barbell' (keine Gewichte)
  instructions_en text[],
  instructions_de text[],
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, source, source_id)
);

-- Pläne -> Tage -> Übungen
create table fit_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  -- 'plan' = Plan mit mehreren Tagen, 'template' = einzelne Vorlage (ein Plan mit einem Tag)
  kind text not null default 'plan' check (kind in ('plan', 'template')),
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table fit_plan_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references fit_plans(id) on delete cascade,
  name text not null,
  position int not null,
  archived_at timestamptz
);

create table fit_plan_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_day_id uuid not null references fit_plan_days(id) on delete cascade,
  exercise_id uuid not null references fit_exercises(id),
  position int not null,
  sets int not null check (sets > 0),
  rep_min int not null check (rep_min > 0),
  rep_max int not null check (rep_max >= rep_min),
  target_rir int check (target_rir between 0 and 5),
  rest_seconds int check (rest_seconds > 0),
  warmup boolean not null default false,   -- Aufwärmsätze im Training vorschlagen
  note text,                               -- z. B. Sitzeinstellung
  weight_kg fit_kg,                        -- geplantes Arbeitsgewicht (optional)
  equipment_kg fit_kg,                     -- Stangen-/Maschinengewicht (optional)
  archived_at timestamptz
);

-- Ausführung: Planwerte werden beim Start kopiert, damit die Historie
-- stimmt, auch wenn du den Plan später änderst.
create table fit_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_day_id uuid references fit_plan_days(id) on delete set null,
  name text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  note text
);

create table fit_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workout_id uuid not null references fit_workouts(id) on delete cascade,
  exercise_id uuid not null references fit_exercises(id),
  position int not null,
  planned_sets int,
  rep_min int,
  rep_max int,
  target_rir int,
  equipment_kg fit_kg             -- Stangen-/Maschinengewicht zum Zeitpunkt des Trainings
);

create table fit_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  workout_exercise_id uuid not null references fit_workout_exercises(id) on delete cascade,
  set_number int not null,
  type text not null default 'working' check (type in ('warmup', 'working')),
  weight_kg fit_kg not null,
  reps int not null check (reps >= 0),
  rir int check (rir between 0 and 10),   -- 0 = Muskelversagen; RPE = 10 - RIR
  done_at timestamptz not null default now()
);

-- Fußball: Dauer und subjektive Belastung (Session-RPE = Minuten x Belastung)
create table fit_football_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  played_on date not null default current_date,
  kind text not null default 'training' check (kind in ('training', 'match')),
  minutes int not null check (minutes > 0),
  rpe int not null check (rpe between 0 and 10),
  note text
);

create index on fit_sets (workout_exercise_id);
create index on fit_workout_exercises (workout_id);
create index on fit_workout_exercises (exercise_id);
create index on fit_workouts (started_at desc);

-- Row-Level-Security: jede Zeile gehört genau einem Nutzer.
do $$
declare t text;
begin
  foreach t in array array[
    'fit_exercises','fit_plans','fit_plan_days','fit_plan_exercises',
    'fit_workouts','fit_workout_exercises','fit_sets','fit_football_sessions'
  ] loop
    execute format('alter table %I enable row level security', t);
    -- Rechte ausdrücklich nur für diese Tabellen (das Projekt kann weitere Apps enthalten).
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_own', t);
  end loop;
end $$;
