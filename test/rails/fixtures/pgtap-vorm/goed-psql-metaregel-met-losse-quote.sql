begin;
set search_path = tap, public;
-- Een psql-metaregel loopt tot het regeleinde; de losse ' erin opent geen tekst, de tekst daarna bevat de rol.
\echo it's
select 'a
set local role app_authenticated;
b';
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-psql-metaregel-met-losse-quote: eerste');
select * from finish();
rollback;
