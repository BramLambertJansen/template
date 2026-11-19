begin;
set search_path = tap, public;
-- Postgres: binnen $$ is `--` gewone tekst, dus de $$ achter `-- klaar` sluit het blok. Daarna volgt de rol vóór de plan.
do $$
begin
  null;
end; -- klaar $$;
set local role app_authenticated;
select plan(1);
select ok(true, 'dollar-sluit-na-streepjes: eerste');
select * from finish();
rollback;
