-- Stretching-Vorlagen: fertige Routinen (Reihenfolge von Dehnübungen mit Seite/Haltezeit),
-- analog zu fit_plans/fit_plan_exercises beim Krafttraining, aber ohne Tage-Hierarchie.

create table fit_stretch_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table fit_stretch_plan_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  plan_id uuid not null references fit_stretch_plans(id) on delete cascade,
  stretch_exercise_id uuid not null references fit_stretch_exercises(id),
  position int not null,
  side text not null default 'beidseitig' check (side in ('links', 'rechts', 'beidseitig')),
  hold_seconds int not null check (hold_seconds > 0),
  sets int not null default 1 check (sets > 0),
  archived_at timestamptz
);

create index on fit_stretch_plan_items (plan_id);

do $$
declare t text;
begin
  foreach t in array array[
    'fit_stretch_plans', 'fit_stretch_plan_items'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format(
      'create policy %I on %I for all to authenticated
         using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_own', t);
  end loop;
end $$;
