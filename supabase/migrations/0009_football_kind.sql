-- Dritter Einheitentyp fürs Fußball-Tracking: neben Mannschaftstraining ('training')
-- und Spiel ('match') jetzt auch lockeres, informelles Kicken ('casual').
alter table fit_football_sessions drop constraint fit_football_sessions_kind_check;
alter table fit_football_sessions
  add constraint fit_football_sessions_kind_check check (kind in ('training', 'casual', 'match'));
