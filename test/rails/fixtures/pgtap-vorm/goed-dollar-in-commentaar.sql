begin;
set search_path = tap, public;
-- een $$ in een commentaarregel opent geen blok
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-dollar-in-commentaar: eerste');
select * from finish();
rollback;
