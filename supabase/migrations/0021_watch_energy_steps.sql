-- Aktive Energie (kcal) im Apple-Watch-Ergebnis und Schritte im Fußball-Eintrag.
-- fit_watch_ranges.energy_kcal: Summe der aktiven Energie im Zeitraum (von der Edge Function football-import).
-- fit_football_sessions.steps: Schritte der Einheit (aus dem Watch-Ergebnis übernommen oder von Hand).
alter table fit_watch_ranges
  add column if not exists energy_kcal int check (energy_kcal is null or energy_kcal between 0 and 20000);
alter table fit_football_sessions
  add column if not exists steps int check (steps is null or steps >= 0);
