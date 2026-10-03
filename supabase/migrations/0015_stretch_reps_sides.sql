-- Stretching: Wiederholungs-Übungen (ohne Timer) und symmetrische Übungen (ohne Seite).
--
-- * reps / default_reps: Übungen, die nach Wiederholungen statt nach Haltezeit laufen
--   (z. B. Cat-Cow). Bei ihnen ist hold_seconds leer; es läuft kein Timer.
-- * side 'mittig': symmetrische Übung ohne Seitenbezug (z. B. Schmetterling).
--   'beidseitig' bedeutet in der App jetzt "beide Seiten nacheinander"; je Seite wird ein
--   eigener Eintrag (links, rechts) mit eigenem Timer bzw. eigenen Wiederholungen gespeichert.
-- Bestehende Zeilen bleiben unverändert gültig.

alter table fit_stretch_exercises
  add column if not exists default_reps int check (default_reps > 0);

alter table fit_stretch_items
  add column if not exists reps int check (reps > 0);
alter table fit_stretch_items alter column hold_seconds drop not null;
alter table fit_stretch_items drop constraint if exists fit_stretch_items_side_check;
alter table fit_stretch_items
  add constraint fit_stretch_items_side_check
  check (side in ('links', 'rechts', 'beidseitig', 'mittig'));
alter table fit_stretch_items drop constraint if exists fit_stretch_items_amount_check;
alter table fit_stretch_items
  add constraint fit_stretch_items_amount_check
  check (hold_seconds is not null or reps is not null);

alter table fit_stretch_plan_items
  add column if not exists reps int check (reps > 0);
alter table fit_stretch_plan_items alter column hold_seconds drop not null;
alter table fit_stretch_plan_items drop constraint if exists fit_stretch_plan_items_side_check;
alter table fit_stretch_plan_items
  add constraint fit_stretch_plan_items_side_check
  check (side in ('links', 'rechts', 'beidseitig', 'mittig'));
alter table fit_stretch_plan_items drop constraint if exists fit_stretch_plan_items_amount_check;
alter table fit_stretch_plan_items
  add constraint fit_stretch_plan_items_amount_check
  check (hold_seconds is not null or reps is not null);
