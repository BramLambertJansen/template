begin;
set search_path = tap, public;
-- Eén regel met `--` tussen $$: een tekstliteral, geen commentaar en geen open blok.
select $$ a -- b $$;
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-dollar-eenregelig-met-streepjes: eerste');
select * from finish();
rollback;
