-- Health-Archiv: Rohwerte der Apple Watch dauerhaft ablegen, statt sie nur auf Knopfdruck für einen Zeitraum zu holen.
--
-- Hintergrund: Der Kurzbefehl erreicht in Health nur die neuesten ~250 Herzfrequenz-Werte (Datumsfilter lieferten
-- auf dem iPhone 0 Treffer, siehe supabase/functions/football-import/README.md). Wer den Fußball-Eintrag am Abend
-- vergisst, kommt Tage später nicht mehr an die Werte. Ein automatischer Kurzbefehl legt die Rohwerte deshalb
-- laufend hier ab (Edge Function football-import?archive=1); die App rechnet Ø/Max-Puls, Schritte, Distanz und
-- aktive Energie für jeden frei gewählten Zeitraum aus diesem Archiv.
--
-- Die Tabelle fit_health_samples gibt es seit Migration 0014 (damals für den Rohwert-Weg, danach unbenutzt). Hier:
--  * Art 'energy' (aktive Energie, kcal) kommt dazu,
--  * die Quelle (z. B. "Apple Watch von Steffen") wird mitgespeichert, damit iPhone und Watch bei Schritten und
--    Distanz nicht doppelt zählen (gleiche Regel wie in football-import/parse.ts, sumInRange),
--  * die Eindeutigkeit gilt je Quelle, sonst würde ein iPhone-Sample mit gleichem Zeitstempel das Watch-Sample
--    beim Upsert überschreiben.
--
-- Geschrieben wird nur von der Edge Function (Service-Rolle, umgeht RLS); die App darf lesen und löschen.
alter table fit_health_samples drop constraint if exists fit_health_samples_kind_check;
alter table fit_health_samples
  add constraint fit_health_samples_kind_check check (kind in ('hr', 'steps', 'distance', 'energy'));

alter table fit_health_samples add column if not exists source text not null default '';

-- Alte Eindeutigkeit (ohne Quelle) durch eine mit Quelle ersetzen. Der automatisch vergebene Name wird nachgeschlagen,
-- statt ihn zu raten.
do $$
declare c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'fit_health_samples'::regclass and contype = 'u'
      and conname <> 'fit_health_samples_unique_sample'
  loop
    execute format('alter table fit_health_samples drop constraint %I', c);
  end loop;
end $$;

alter table fit_health_samples drop constraint if exists fit_health_samples_unique_sample;
alter table fit_health_samples
  add constraint fit_health_samples_unique_sample unique (user_id, kind, start_at, end_at, source);

-- Abfrage der App: Samples, die einen Zeitraum überlappen (nach Ende filtern, nach Art/Start sortieren).
create index if not exists fit_health_samples_end_idx on fit_health_samples (user_id, end_at);
