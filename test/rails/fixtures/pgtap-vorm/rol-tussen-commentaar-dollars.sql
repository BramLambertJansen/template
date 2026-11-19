begin;
set search_path = tap, public;
-- hulp in een $$-blok
set local role app_authenticated;
-- einde $$
select plan(1);
select ok(true, 'rol-tussen-commentaar-dollars: eerste');
select * from finish();
rollback;
