begin;
set search_path = tap, public;
do $$
begin
  select plan(1);
end
$$;
set local role app_authenticated;
select ok(true, 'plan-in-blok: eerste');
select * from finish();
rollback;
