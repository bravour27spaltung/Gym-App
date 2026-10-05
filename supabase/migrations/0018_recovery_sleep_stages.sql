-- Recovery: Tief- und REM-Schlaf der Nacht, in Minuten.
--
-- Nur diese beiden Phasen: Tief und REM erkennen Consumer-Wearables im Vergleich zur
-- Polysomnographie besser als Wach und Leichtschlaf (Sleep Advances 2025, zpaf021). Wachzeit,
-- Aufwachphasen und Schlafeffizienz werden bewusst nicht gespeichert, weil die Wacherkennung
-- schwach ist (Spezifität 29 bis 52 %). Es gibt keinen anerkannten Sollwert für die
-- Schlafarchitektur (Ohayon et al. 2017); die App zeigt die Werte nur gegen die eigene Baseline.
-- Null = unbekannt (z. B. Nacht nur vom iPhone ohne Phasen oder vor dieser Migration).
alter table fit_recovery_entries
  add column if not exists deep_sleep_min int check (deep_sleep_min is null or deep_sleep_min between 0 and 960),
  add column if not exists rem_sleep_min int check (rem_sleep_min is null or rem_sleep_min between 0 and 960);

alter table fit_recovery_health_inbox
  add column if not exists deep_sleep_min int check (deep_sleep_min is null or deep_sleep_min between 0 and 960),
  add column if not exists rem_sleep_min int check (rem_sleep_min is null or rem_sleep_min between 0 and 960);
