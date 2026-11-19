begin;
set search_path = tap, public;
-- Binnen $x$ is een losse $$ gewone tekst: het blok sluit met $x$, dus de rol vóór de plan telt wel.
do $x$
begin
  raise notice '$$';
end
$x$;
set local role app_authenticated;
select plan(1);
select ok(true, 'rol-na-tagblok-met-losse-dollars: eerste');
select * from finish();
rollback;
