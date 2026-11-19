begin;
set search_path = tap, public;
-- `somE'x\'` is de identifier somE met een gewone tekst 'x\' (geen E-tekst: `\'` is geen escape); de tekst daarna bevat de rol.
select somE'x\';
select 'a
set local role app_authenticated;
b';
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-identifier-eindigt-op-e: eerste');
select * from finish();
rollback;
