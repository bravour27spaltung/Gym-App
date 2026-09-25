-- Übungskatalog enthält nur noch Details zur Übung (Muskelgruppen, Gerät, Anleitung).
-- Feste Gewichtsschritte und Gewichte pro Übung entfallen: Das Gewicht wählst du im Satz.
-- Für Datenbanken, die 0001 noch in der alten Fassung ausgeführt haben. Auf frischen
-- Datenbanken (neue 0001) ändert dieses Skript nichts.

alter table fit_exercises drop column if exists increment_kg;
alter table fit_exercises drop column if exists equipment_kg;
alter table fit_workout_exercises drop column if exists increment_kg;
