-- Recovery: Eingang für Apple-Health-Werte, die vor dem Tageseintrag ankommen.
--
-- Hintergrund: Der iOS-Kurzbefehl läuft als Automation (z. B. morgens), die PRS wird aber erst
-- beim Öffnen der App eingetragen. Gibt es zum Zeitpunkt des Imports noch keinen Eintrag, legt
-- recovery-import die Werte hier ab. Die App überträgt sie in den Eintrag, sobald er existiert,
-- und löscht die Zeile danach. Ein Eintrag pro Kalendertag (Aufwachdatum), neuere Werte ersetzen ältere.
create table if not exists fit_recovery_health_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  date date not null,
  hrv_ms numeric check (hrv_ms is null or hrv_ms >= 0),
  resting_hr int check (resting_hr is null or resting_hr between 30 and 120),
  sleep_hours numeric check (sleep_hours is null or sleep_hours between 0 and 16),
  sleep_start timestamptz,
  sleep_end timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, date),
  check (sleep_start is null or sleep_end is null or sleep_end > sleep_start)
);

alter table fit_recovery_health_inbox enable row level security;
grant select, insert, update, delete on fit_recovery_health_inbox to authenticated;
create policy fit_recovery_health_inbox_own on fit_recovery_health_inbox for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
