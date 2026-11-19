\set ON_ERROR_STOP on
\set QUIET 1
-- Goede vorm (R-TEST-05): psql-metaregels en commentaar mogen voor en na begin;
begin;
-- commentaar tussen begin en de search_path mag

set search_path = tap, public;
select plan(3);
set local role app_authenticated;
select ok(true, 'goed: eerste');
select ok(true, 'goed: tweede');
select ok(true, 'goed: derde');
select * from finish();
rollback;
