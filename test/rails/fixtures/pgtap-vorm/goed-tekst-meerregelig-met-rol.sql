begin;
set search_path = tap, public;
-- Tekst met '' over meerdere regels: de regel die met `set local role` begint staat in de tekst en telt niet.
select 'it''s een tekst
set local role app_authenticated;
en nog ''een'' regel';
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-tekst-meerregelig-met-rol: eerste');
select * from finish();
rollback;
