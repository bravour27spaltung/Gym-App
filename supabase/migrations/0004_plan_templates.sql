-- Vorlagen, Aufwärmen und Notiz für Trainingspläne.
--  * fit_plans.kind: 'plan' = Plan mit mehreren Tagen, 'template' = einzelne Vorlage
--    (ein Plan mit genau einem Tag).
--  * fit_plan_exercises.warmup: Aufwärmsätze vor den Arbeitssätzen einplanen.
--  * fit_plan_exercises.note: Freitext, z. B. Sitzeinstellung.
-- Bestehende Pläne bleiben unverändert (kind = 'plan', kein Aufwärmen, keine Notiz).
-- Wiederholbar: "if not exists" verhindert Fehler beim zweiten Ausführen.

alter table fit_plans
  add column if not exists kind text not null default 'plan'
  check (kind in ('plan', 'template'));

alter table fit_plan_exercises
  add column if not exists warmup boolean not null default false;

alter table fit_plan_exercises
  add column if not exists note text;
