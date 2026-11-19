begin;
set search_path = tap, public;
-- set local role app_definer;
create function pg_temp.als(p_role text) returns void language plpgsql as $$
begin
  set local role app_definer;
  execute format('set local role %I', p_role);
end
$$;
select pg_temp.als('app_authenticated'), format('set local role %I', 'x');
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-rol-geen-regelbegin: eerste');
select * from finish();
rollback;
