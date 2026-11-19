begin;
set search_path = public, tap;
select plan(1);
set local role app_authenticated;
select ok(true, 'search-path-anders: eerste');
select * from finish();
rollback;
