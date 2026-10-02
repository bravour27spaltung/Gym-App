-- Rohwerte der Apple Watch (Herzfrequenz, Schritte, Distanz), die der Kurzbefehl an die
-- Edge Function football-import schickt. Damit kann die App für jeden beliebigen, selbst
-- gewählten Zeitraum (Startzeit + Dauer im Fußball-Formular) Ø/Max-Puls, Schritte und
-- Distanz berechnen, statt sich auf das automatisch erkannte Fenster zu verlassen.
--
-- Geschrieben wird nur von der Edge Function (Service-Rolle, umgeht RLS) per Upsert: ein
-- erneuter Aufruf mit überlappenden Daten erzeugt keine Dopplungen. Die App darf lesen.
create table fit_health_samples (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  kind text not null check (kind in ('hr', 'steps', 'distance')),
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at >= start_at),
  -- hr: bpm, steps: Anzahl, distance: Kilometer
  value numeric not null check (value >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, kind, start_at, end_at)
);

create index on fit_health_samples (user_id, kind, start_at);

alter table fit_health_samples enable row level security;
grant select, delete on fit_health_samples to authenticated;
create policy fit_health_samples_own on fit_health_samples for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
