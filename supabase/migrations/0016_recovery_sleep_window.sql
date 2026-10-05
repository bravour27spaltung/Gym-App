-- Recovery: Beginn und Ende der Nacht, zu der sleep_hours gehört.
--
-- Hintergrund: Schlaf wurde bisher für ein festes Zeitfenster um den Kalendertag summiert und
-- konnte dabei den Teil vor Mitternacht verlieren oder die Vornacht mitzählen. Jetzt wird die
-- Nacht, die am Eintragsdatum endet (Aufwachdatum), als Ganzes bestimmt. Die beiden Zeitpunkte
-- machen nachvollziehbar, welche Nacht gemeint ist, und erlauben die Regelmäßigkeit der
-- Schlafmitte auszuwerten. Ältere Werte haben keine Zeitpunkte (null) und werden bei einem
-- erneuten Apple-Health-Import durch den Nachtwert ersetzt, sofern sie aus Apple Health stammen.
alter table fit_recovery_entries
  add column if not exists sleep_start timestamptz,
  add column if not exists sleep_end timestamptz,
  add constraint fit_recovery_entries_sleep_window_check
    check (sleep_start is null or sleep_end is null or sleep_end > sleep_start);
