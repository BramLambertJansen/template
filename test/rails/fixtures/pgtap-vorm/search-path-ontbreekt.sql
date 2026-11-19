begin;
select plan(1);
set local role app_authenticated;
select ok(true, 'search-path-ontbreekt: eerste');
select * from finish();
rollback;
