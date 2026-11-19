begin;
set search_path = tap, public;
-- Binnen $x$ is een losse $$ gewone tekst: alleen $x$ sluit het blok, daarna volgt de plan.
do $x$
begin
  raise notice '$$';
end
$x$;
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-dollar-tag-met-losse-dollars: eerste');
select * from finish();
rollback;
