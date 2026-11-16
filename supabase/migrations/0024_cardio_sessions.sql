-- Cardio statt nur Fußball: Die Tabelle der Fußball-Einheiten wird zur allgemeinen Cardio-Tabelle.
--
-- * Neue Spalte activity: 'football' (Standard, damit alle bisherigen Zeilen Fußball bleiben), 'running', 'cycling'.
-- * Der Untertyp kind (Training/Kicken/Spiel) wird nur noch für Fußball-Altdaten gebraucht; neue Einträge lassen ihn
--   leer. Die Spalte bleibt erhalten, es geht nichts verloren.
-- * rpe darf leer sein: Beim Fußball bleibt die subjektive Belastung Pflicht (Check unten), beim Laufen und Radfahren
--   ist sie optional.
-- * max_heart_rate: Maximalpuls der Einheit. Daraus nimmt die App den höchsten je gemessenen Wert als Vorschlag für
--   den Maximalpuls der Pulszonen.
--
-- Die Pulszonen selbst werden NICHT gespeichert, sondern in der App aus den Pulswerten des Health-Archivs
-- (fit_health_samples) berechnet. So lassen sich Maximalpuls und Zonenmodell später ändern, ohne Daten umzuschreiben.
--
-- Umstellung ohne Ausfall: Unter dem alten Namen fit_football_sessions bleibt eine View bestehen, die nur die
-- Fußball-Zeilen zeigt und Schreibzugriffe durchreicht. Die bisher ausgelieferte App funktioniert damit weiter, bis die
-- neue Version auf Vercel liegt. Reihenfolge: erst dieses SQL ausführen, dann die neue App deployen. Danach kann die View
-- mit "drop view fit_football_sessions;" entfernt werden.

alter table fit_football_sessions rename to fit_cardio_sessions;
alter policy fit_football_sessions_own on fit_cardio_sessions rename to fit_cardio_sessions_own;

alter table fit_cardio_sessions
  add column activity text not null default 'football' check (activity in ('football', 'running', 'cycling')),
  add column max_heart_rate int check (max_heart_rate is null or max_heart_rate between 30 and 220);

alter table fit_cardio_sessions alter column kind drop not null;
alter table fit_cardio_sessions alter column kind drop default;
alter table fit_cardio_sessions alter column rpe drop not null;

-- Beim Fußball ist die subjektive Belastung weiterhin die Hauptgröße.
alter table fit_cardio_sessions
  add constraint fit_cardio_sessions_football_rpe check (activity <> 'football' or rpe is not null);

create view fit_football_sessions with (security_invoker = true) as
  select * from fit_cardio_sessions where activity = 'football';
grant select, insert, update, delete on fit_football_sessions to authenticated;
