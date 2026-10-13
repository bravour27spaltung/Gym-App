-- Apple-Watch-Werte pro Zeitraum (Neustart des Fußball-Imports).
--
-- Ablauf: Im Fußball-Tab wählst du Datum und Zeitraum und tippst auf „Apple-Watch-Daten holen“.
-- Der iOS-Kurzbefehl liest für genau diesen Zeitraum Ø/Max-Puls, Schritte und Distanz aus Health
-- und schickt sie an die Edge Function football-import. Diese legt hier GENAU EIN Ergebnis pro
-- Zeitraum ab (Upsert über Nutzer/Von/Bis, ein erneuter Lauf erzeugt keine Dopplung). Die App liest
-- das Ergebnis und trägt die Werte ins Formular ein.
--
-- Ersetzt den bisherigen Weg über Rohwerte (fit_health_samples) und erkannte Fenster
-- (fit_football_watch_windows). Beide Tabellen bleiben unverändert bestehen, werden aber nicht mehr
-- befüllt; vorhandene Daten gehen nicht verloren.
--
-- Ein Eintrag mit lauter leeren Werten ist Absicht: Er zeigt, dass der Kurzbefehl durchlief und die
-- Funktion erreicht hat, Health für den Zeitraum aber nichts lieferte (Berechtigung, gesperrtes
-- iPhone, falsche Quelle). Das ist eine andere Fehlerursache als „es ist nichts angekommen“.
--
-- Geschrieben wird nur von der Edge Function (Service-Rolle, umgeht RLS); die App darf lesen und löschen.
create table if not exists fit_watch_ranges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  from_at timestamptz not null,
  to_at timestamptz not null check (to_at > from_at),
  -- Anzahl der Herzfrequenz-Messwerte, auf denen Ø/Max beruhen (ohne gestartete Aufzeichnung nur wenige).
  hr_samples int not null default 0 check (hr_samples >= 0),
  avg_heart_rate int check (avg_heart_rate is null or avg_heart_rate between 30 and 220),
  max_heart_rate int check (max_heart_rate is null or max_heart_rate between 30 and 220),
  steps int check (steps is null or steps >= 0),
  distance_km numeric check (distance_km is null or distance_km >= 0),
  -- 'values': fertige Zahlen vom Kurzbefehl, 'raw': Rohzeilen, die die Funktion selbst ausgewertet hat,
  -- 'mixed': beides, 'none': der Kurzbefehl lieferte keine Werte
  source text not null default 'values' check (source in ('values', 'raw', 'mixed', 'none')),
  received_at timestamptz not null default now(),
  unique (user_id, from_at, to_at)
);

create index if not exists fit_watch_ranges_received_idx on fit_watch_ranges (user_id, received_at desc);

alter table fit_watch_ranges enable row level security;
grant select, delete on fit_watch_ranges to authenticated;
create policy fit_watch_ranges_own on fit_watch_ranges for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
