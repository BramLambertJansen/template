-- Zonder begin; maar verder goed: de search_path staat vooraan.
set search_path = tap, public;
select plan(2);
set local role app_authenticated;
select ok(true, 'zonder-begin: eerste');
select ok(true, 'zonder-begin: tweede');
select * from finish();
