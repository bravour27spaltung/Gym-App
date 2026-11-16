-- Einzelne Aufwärmsätze je Planübung (feste Kilo und Wiederholungen).
-- Bisher kannte der Plan nur Ja/Nein ("warmup"); die Sätze wurden bei jedem Start neu berechnet
-- und gingen nach der Session verloren. Jetzt liegen sie als Liste an der Planübung:
--   [{"weight_kg": 20, "reps": 8}, {"weight_kg": 40, "reps": 5}]
-- Leere Liste = die App schlägt wie bisher eine Rampe vor. Bestehende Pläne bleiben unverändert.
-- Aufwärmsätze fließen weiterhin nicht in Auswertungen ein (type = 'warmup' in fit_sets).
-- Wiederholbar: "if not exists" / "drop constraint if exists".

alter table fit_plan_exercises
  add column if not exists warmup_sets jsonb not null default '[]'::jsonb;

alter table fit_plan_exercises
  drop constraint if exists fit_plan_exercises_warmup_sets_check;

alter table fit_plan_exercises
  add constraint fit_plan_exercises_warmup_sets_check
  check (jsonb_typeof(warmup_sets) = 'array' and jsonb_array_length(warmup_sets) <= 10);
