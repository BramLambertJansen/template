-- Rol app_jobs (spec achtergrondtaken, deel B: jobs/AC-11, jobs/AC-12, jobs/AC-14; ADR 0050 punt 5): rolattributen en timeouts,
-- connect en usage op app, geen enkel tabel- of kolomrecht in public, app en better_auth, en de weigeringen als app_jobs.
-- De invariant die een opzettelijke grant vangt staat in db/tests/invarianten.sql (jobs/AC-12). Alles in één transactie die
-- terugdraait; alles wat de rol of nieuwe objecten raakt staat als tekst in een assert of een hulpfunctie, zodat een ontbrekende
-- rol of migratie een falende assert geeft en geen afgebroken script. Vereist dat app_migrator SET ROLE app_jobs mag
-- (db/init/02-test-tools.sql, zoals voor app_authenticated); de eerste assert controleert dat.
begin;
set search_path = tap, public;
select plan(15);

-- Voert SQL uit als een rol en geeft '00000' (gelukt) of 'sqlstate|melding' terug; de fout draait alleen dit statement terug.
create function pg_temp.try_as(p_role text, p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v_result := '00000';
  exception when others then
    v_result := sqlstate || '|' || sqlerrm;
  end;
  reset role;
  return v_result;
end $$;

-- De instelling `p_name` van `p_role` zoals ALTER ROLE ... SET hem opslaat (zonder database erbij), of null.
create function pg_temp.role_setting(p_role text, p_name text) returns text language sql stable as $$
  select substr(c.s, length(p_name) + 2)
  from pg_catalog.pg_db_role_setting d
  join pg_catalog.pg_roles r on r.oid = d.setrole
  cross join lateral unnest(d.setconfig) as c (s)
  where d.setdatabase = 0 and r.rolname = p_role and left(c.s, length(p_name) + 1) = p_name || '='
$$;

-- Elk tabel-, kolom- of reeksrecht dat app_jobs heeft in public, app en better_auth, plus schemarechten die hij niet mag hebben.
create function pg_temp.jobs_rechten() returns setof text language plpgsql stable as $$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'app_jobs') then
    return next 'rol app_jobs ontbreekt';
    return;
  end if;
  return query
  select v.regel from (
    select format('%s op %I.%I', p.recht, n.nspname, c.relname) as regel
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p (recht)
    where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname in ('public', 'app', 'better_auth')
      and pg_catalog.has_table_privilege('app_jobs', c.oid, p.recht)
    union all
    select format('kolomrecht %s op %I.%I', p.recht, n.nspname, c.relname)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('REFERENCES')) p (recht)
    where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname in ('public', 'app', 'better_auth')
      and pg_catalog.has_any_column_privilege('app_jobs', c.oid, p.recht)
    union all
    select format('usage op reeks %I.%I', n.nspname, c.relname)
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'S' and n.nspname in ('public', 'app', 'better_auth')
      -- CASE: anders kan de planner de functie op een niet-reeks aanroepen vóór het filter op relkind.
      and case when c.relkind = 'S' then pg_catalog.has_sequence_privilege('app_jobs', c.oid, 'USAGE') else false end
  ) v order by v.regel collate "C";
end $$;

select ok(pg_catalog.pg_has_role('app_migrator', 'app_jobs', 'set'), 'testomgeving: app_migrator mag SET ROLE app_jobs (db/init/02-test-tools.sql)');

-- jobs/AC-11: rolattributen.
select is((select count(*)::integer from pg_catalog.pg_roles where rolname = 'app_jobs'), 1, 'app_jobs: de rol bestaat (jobs/AC-11)');
select results_eq(
  $$select rolcanlogin, rolinherit, rolsuper, rolcreaterole, rolcreatedb, rolbypassrls from pg_catalog.pg_roles where rolname = 'app_jobs'$$,
  $$values (true, false, false, false, false, false)$$,
  'app_jobs: login, noinherit, geen superuser, createrole, createdb of bypassrls (jobs/AC-11)'
);
select is(
  (select count(*)::integer from pg_catalog.pg_auth_members m join pg_catalog.pg_roles u on u.oid = m.member where u.rolname = 'app_jobs'),
  0,
  'app_jobs: lid van geen enkele rol (jobs/AC-11)'
);
select is(pg_temp.role_setting('app_jobs', 'statement_timeout'), '5s', 'app_jobs: statement_timeout 5s (jobs/AC-11)');
select is(pg_temp.role_setting('app_jobs', 'idle_in_transaction_session_timeout'), '10s', 'app_jobs: idle_in_transaction_session_timeout 10s (jobs/AC-11)');

-- jobs/AC-12: connect en usage op app, verder niets.
select is(
  (select case when exists (select 1 from pg_catalog.pg_roles where rolname = 'app_jobs')
          then pg_catalog.has_database_privilege('app_jobs', pg_catalog.current_database(), 'connect') else false end),
  true,
  'app_jobs: connect op de database (jobs/AC-12)'
);
select is(
  (select case when exists (select 1 from pg_catalog.pg_roles where rolname = 'app_jobs')
          then pg_catalog.has_schema_privilege('app_jobs', 'app', 'usage') else false end),
  true,
  'app_jobs: usage op schema app (jobs/AC-12)'
);
select is(
  (select case when exists (select 1 from pg_catalog.pg_roles where rolname = 'app_jobs')
          then pg_catalog.has_schema_privilege('app_jobs', 'better_auth', 'usage') else true end),
  false,
  'app_jobs: geen usage op schema better_auth (jobs/AC-12)'
);
select is(
  (select case when exists (select 1 from pg_catalog.pg_roles where rolname = 'app_jobs')
          then pg_catalog.has_schema_privilege('app_jobs', 'app', 'create') or pg_catalog.has_schema_privilege('app_jobs', 'public', 'create')
          else true end),
  false,
  'app_jobs: geen create op app of public (jobs/AC-12)'
);
select is(array(select pg_temp.jobs_rechten()), '{}'::text[], 'app_jobs: geen enkel tabel- of kolomrecht in public, app en better_auth (jobs/AC-12)');

-- jobs/AC-14: als app_jobs zijn client-functies en tabellen dicht (42501).
select is(left(pg_temp.try_as('app_jobs', $$select app.current_user_id()$$), 5), '42501', 'app_jobs: select app.current_user_id() faalt met 42501 (jobs/AC-14)');
select is(left(pg_temp.try_as('app_jobs', $$select app.assign_role('x', 'y')$$), 5), '42501', 'app_jobs: select app.assign_role(...) faalt met 42501 (jobs/AC-14)');
select is(left(pg_temp.try_as('app_jobs', $$select * from app.audit_log$$), 5), '42501', 'app_jobs: select * from app.audit_log faalt met 42501 (jobs/AC-14)');
select is(
  (select string_agg(left(pg_temp.try_as('app_jobs', t.stmt), 5), ',' order by t.nr)
   from (values (1, 'select * from app.retention'), (2, 'select * from public.user_roles'), (3, 'select * from better_auth.session')) t (nr, stmt)),
  '42501,42501,42501',
  'app_jobs: ook app.retention, public.user_roles en better_auth.session zijn dicht (42501, jobs/AC-14)'
);

select * from finish();
rollback;
