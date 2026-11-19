begin;
set search_path = tap, public;
set local statement_timeout = '5s'; -- $$
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-dollar-in-staartcommentaar: eerste');
select * from finish();
rollback;
