-- Optionale Health-Werte (Kalorien, Ø Herzfrequenz) für Training und Stretching, analog
-- zu Fußball (Migration 0010): über den zentralen Apple-Health-Import nachträglich
-- befüllbar, ohne die bestehende Speicherung von Training/Stretching zu verändern.
alter table fit_workouts
  add column if not exists calories int check (calories is null or calories >= 0),
  add column if not exists avg_heart_rate int check (avg_heart_rate is null or avg_heart_rate between 30 and 220);

alter table fit_stretch_sessions
  add column if not exists calories int check (calories is null or calories >= 0),
  add column if not exists avg_heart_rate int check (avg_heart_rate is null or avg_heart_rate between 30 and 220);
