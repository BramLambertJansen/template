begin;
set search_path = tap, public;
-- Een blok met tag ($x$): de rol staat in het blok en telt niet vóór de plan.
do $x$
begin
  null;
set local role app_authenticated;
end
$x$;
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-dollar-tag-rol-in-blok: eerste');
select * from finish();
rollback;
