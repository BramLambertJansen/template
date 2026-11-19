begin;
insert into public.t (a) values (1);
set search_path = tap, public;
select plan(1);
set local role app_authenticated;
select ok(true, 'search-path-later: eerste');
select * from finish();
rollback;
