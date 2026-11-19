begin;
set search_path = tap, public;
select no_plan();
set local role app_authenticated;
select ok(true, 'no-plan: eerste');
select * from finish();
rollback;
