begin;
set search_path = tap, public;
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-niet-gesloten-tekst-aan-het-eind: eerste');
select * from finish();
rollback;
-- Een niet-gesloten ' aan het eind van het bestand: geen crash en geen melding, de vorm hierboven is geldig.
select 'niet gesloten
set local role app_authenticated;
