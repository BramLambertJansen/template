begin;
set search_path = tap, public;
-- select plan(1);
set local role app_authenticated;
select ok(true, 'plan-in-commentaar: eerste');
select * from finish();
rollback;
