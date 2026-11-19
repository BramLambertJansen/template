begin;
set search_path = tap, public;
set local role app_definer;
select plan(1);
select ok(true, 'plan-na-definer: eerste');
select * from finish();
rollback;
