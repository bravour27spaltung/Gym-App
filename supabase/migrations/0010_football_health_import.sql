-- Optionale Zusatzwerte für Fußball-Einträge, die sich aus einem Apple-Health-Export
-- (export.xml) für ein Zeitfenster ableiten lassen, auch ohne aktiv gestartete
-- Trainings-Aufzeichnung auf der Uhr (Health sammelt Distanz/Kalorien/Herzfrequenz
-- auch im Hintergrund). Alles optional, damit die einfache manuelle Eingabe unverändert
-- funktioniert.
alter table fit_football_sessions
  add column started_at timestamptz,
  add column distance_km numeric check (distance_km is null or distance_km >= 0),
  add column calories int check (calories is null or calories >= 0),
  add column avg_heart_rate int check (avg_heart_rate is null or avg_heart_rate between 30 and 220),
  add column source text not null default 'manual' check (source in ('manual', 'apple_health'));
