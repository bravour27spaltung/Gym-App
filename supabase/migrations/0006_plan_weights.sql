-- Geplantes Arbeitsgewicht und Stangen-/Maschinengewicht je Übung im Plan.
-- Beides ist optional (null = nicht festgelegt). Im Training gilt: Plan-Gewicht vor dem
-- Wert vom letzten Training. Wiederholbar.
alter table fit_plan_exercises add column if not exists weight_kg fit_kg;
alter table fit_plan_exercises add column if not exists equipment_kg fit_kg;
