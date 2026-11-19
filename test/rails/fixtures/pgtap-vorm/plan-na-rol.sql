begin;
set search_path = tap, public;
set local role app_authenticated;
select plan(1);
select ok(true, 'plan-na-rol: eerste');
select * from finish();
rollback;
