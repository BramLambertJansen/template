begin;
set search_path = tap, public;
set local role app_authenticated;
select ok(true, 'plan-ontbreekt: eerste');
select * from finish();
rollback;
