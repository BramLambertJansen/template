begin;
set search_path = tap, public;
-- Een naam met "" blijft een naam: `--` en `$$` erin zijn geen commentaar of dollar-quote, en de rol staat in de naam.
select 1 as "a"" -- $$ b
set local role app_authenticated;
c";
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-naam-met-dubbele-aanhalingstekens: eerste');
select * from finish();
rollback;
