-- Von der Apple Watch erkannte Trainingsfenster (Staging für den automatischen
-- Fußball-Import). Ein Kurzbefehl auf dem iPhone schickt Herzfrequenz-, Schritt- und
-- Distanz-Rohwerte an die Edge Function football-import; diese erkennt daraus
-- zusammenhängende Zeitfenster (Uhr wird nur im Training getragen, es gibt keine
-- gestartete Aufzeichnung/kein HKWorkout) und legt sie hier ab. Die App zeigt sie im
-- Fußball-Tab als Vorschlag: ein Tipp übernimmt Startzeit, Dauer, Ø Puls und Distanz ins
-- Formular, Art der Einheit und RPE trägst du weiterhin selbst ein.
--
-- Bewusst eine eigene Tabelle statt direkt in fit_football_sessions: die Daten kommen
-- meist vor dem Eintrag an (die App wird erst nach dem Training geöffnet), und die
-- subjektive Belastung (RPE) bleibt die Hauptgröße, die Uhrwerte sind nur Ergänzung.
--
-- Geschrieben wird ausschließlich von der Edge Function (Service-Rolle, umgeht RLS); die
-- App darf lesen, als verwendet markieren (session_id) und ausblenden (dismissed).
create table fit_football_watch_windows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at > started_at),
  -- Anzahl der Herzfrequenz-Messwerte im Fenster (ohne aktive Aufzeichnung nur alle paar
  -- Minuten, der Mittelwert beruht also auf wenigen Stichproben).
  hr_samples int not null check (hr_samples >= 1),
  avg_heart_rate int check (avg_heart_rate is null or avg_heart_rate between 30 and 220),
  max_heart_rate int check (max_heart_rate is null or max_heart_rate between 30 and 220),
  steps int check (steps is null or steps >= 0),
  distance_km numeric check (distance_km is null or distance_km >= 0),
  -- Verknüpfter Fußball-Eintrag, sobald der Vorschlag übernommen wurde. Bewusst ohne
  -- Fremdschlüssel: der Eintrag kann noch im Offline-Ausgangskorb liegen.
  session_id uuid,
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, started_at)
);

create index on fit_football_watch_windows (started_at desc);

alter table fit_football_watch_windows enable row level security;
grant select, update, delete on fit_football_watch_windows to authenticated;
create policy fit_football_watch_windows_own on fit_football_watch_windows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
