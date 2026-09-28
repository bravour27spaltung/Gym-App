-- Recovery: eigener, einfacher Bereich (ein Eintrag pro Tag), analog zu Fußball
-- (Migration 0009). Kern ist eine validierte Ein-Item-Skala (Perceived Recovery
-- Status, Laurent et al. 2011, 0-10), dazu ein paar optionale kurze Zusatzwerte
-- (Muskelkater/Stress/Schlafqualität, je 1-5) sowie optionale, nachträglich per
-- Apple-Health-Import befüllbare Werte (HRV, Ruhepuls, Schlafdauer). Ein Eintrag pro
-- Kalendertag (unique auf user_id+date): eine Korrektur erfolgt wie bei Fußball durch
-- Löschen und Neuanlegen, nicht durch Bearbeiten.
create table fit_recovery_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  perceived_recovery int not null check (perceived_recovery between 0 and 10),
  soreness int check (soreness is null or soreness between 1 and 5),
  stress int check (stress is null or stress between 1 and 5),
  sleep_quality int check (sleep_quality is null or sleep_quality between 1 and 5),
  note text,
  hrv_ms numeric check (hrv_ms is null or hrv_ms >= 0),
  resting_hr int check (resting_hr is null or resting_hr between 30 and 120),
  sleep_hours numeric check (sleep_hours is null or sleep_hours between 0 and 16),
  source text not null default 'manual' check (source in ('manual', 'apple_health')),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index on fit_recovery_entries (date desc);

alter table fit_recovery_entries enable row level security;
grant select, insert, update, delete on fit_recovery_entries to authenticated;
create policy fit_recovery_entries_own on fit_recovery_entries for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
