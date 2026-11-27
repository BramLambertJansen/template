-- Rolattributen en timeouts uit db/init/01-roles.sql (R-DB-01, R-DB-02): wie mag inloggen, wie erft niets, wie is geen
-- superuser of BYPASSRLS, hoe api_user bij app_authenticated komt en welke timeouts per rol gelden. Alleen wat db/init zet:
-- een wijziging daar moet dus ook deze test wijzigen. Alles in één transactie die terugdraait; alleen lezen uit de catalogus.
begin;
set search_path = tap, public;
select plan(15);

-- De instelling `p_name` van `p_role` zoals ALTER ROLE ... SET hem opslaat (zonder database erbij), of null.
create function pg_temp.role_setting(p_role text, p_name text) returns text language sql stable as $$
  select substr(c.s, length(p_name) + 2)
  from pg_catalog.pg_db_role_setting d
  join pg_catalog.pg_roles r on r.oid = d.setrole
  cross join lateral unnest(d.setconfig) as c (s)
  where d.setdatabase = 0 and r.rolname = p_role and left(c.s, length(p_name) + 1) = p_name || '='
$$;

-- ===== De rollen en hun attributen (R-DB-01) =====
select is(
  (select count(*)::integer from pg_catalog.pg_roles
    where rolname in ('app_migrator', 'app_authenticated', 'api_user', 'auth_service', 'app_definer', 'app_jobs')),
  6,
  'rolattributen: de zes rollen uit db/init bestaan'
);
select results_eq(
  $$select rolname::text collate "default", rolcanlogin from pg_catalog.pg_roles
    where rolname in ('app_migrator', 'app_authenticated', 'api_user', 'auth_service', 'app_definer', 'app_jobs')
    order by rolname::text collate "C"$$,
  $$values ('api_user', true), ('app_authenticated', false), ('app_definer', false), ('app_jobs', true), ('app_migrator', true), ('auth_service', true)$$,
  'rolattributen: alleen app_migrator, api_user, auth_service en app_jobs mogen inloggen; app_authenticated en app_definer zijn NOLOGIN'
);
select results_eq(
  $$select rolname::text collate "default", rolinherit from pg_catalog.pg_roles
    where rolname in ('app_authenticated', 'api_user', 'app_jobs') order by rolname::text collate "C"$$,
  $$values ('api_user', false), ('app_authenticated', false), ('app_jobs', false)$$,
  'rolattributen: api_user, app_authenticated en app_jobs zijn NOINHERIT'
);
select is(
  (select count(*)::integer from pg_catalog.pg_roles
    where rolname in ('app_migrator', 'app_authenticated', 'api_user', 'auth_service', 'app_definer', 'app_jobs') and (rolsuper or rolbypassrls)),
  0,
  'rolattributen: geen van de zes rollen is superuser of heeft BYPASSRLS (FORCE RLS geldt voor allemaal)'
);
select results_eq(
  $$select rolsuper, rolbypassrls from pg_catalog.pg_roles where rolname = 'app_migrator'$$,
  $$values (false, false)$$,
  'rolattributen: app_migrator is geen superuser en heeft geen BYPASSRLS'
);

-- ===== Lidmaatschappen (R-DB-01) =====
select results_eq(
  $$select m.inherit_option, m.set_option
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles g on g.oid = m.roleid
    join pg_catalog.pg_roles u on u.oid = m.member
    where g.rolname = 'app_authenticated' and u.rolname = 'api_user'$$,
  $$values (false, true)$$,
  'rolattributen: api_user is lid van app_authenticated zonder inherit, alleen met SET (SET LOCAL ROLE in withUser)'
);
select is(
  (select count(*)::integer
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles u on u.oid = m.member
    where u.rolname = 'api_user'),
  1,
  'rolattributen: api_user is van geen enkele andere rol lid dan app_authenticated'
);
select is(
  (select count(*)::integer
    from pg_catalog.pg_auth_members m
    join pg_catalog.pg_roles g on g.oid = m.roleid
    join pg_catalog.pg_roles u on u.oid = m.member
    where g.rolname = 'app_definer' and u.rolname = 'app_migrator'),
  1,
  'rolattributen: app_migrator is lid van app_definer (migraties maken functies die app_definer toebehoren)'
);

-- ===== Timeouts per rol (R-DB-02) =====
select is(pg_temp.role_setting('api_user', 'statement_timeout'), '5s', 'rolattributen: api_user heeft statement_timeout 5s');
select is(pg_temp.role_setting('api_user', 'idle_in_transaction_session_timeout'), '10s', 'rolattributen: api_user heeft idle_in_transaction_session_timeout 10s');
select is(pg_temp.role_setting('auth_service', 'statement_timeout'), '5s', 'rolattributen: auth_service heeft statement_timeout 5s');
select is(pg_temp.role_setting('auth_service', 'idle_in_transaction_session_timeout'), '10s', 'rolattributen: auth_service heeft idle_in_transaction_session_timeout 10s');
select is(pg_temp.role_setting('app_migrator', 'lock_timeout'), '5s', 'rolattributen: app_migrator heeft lock_timeout 5s');
select is(pg_temp.role_setting('auth_service', 'search_path'), 'better_auth', 'rolattributen: auth_service heeft search_path better_auth');
select is(
  (select count(*)::integer from pg_catalog.pg_db_role_setting d
    join pg_catalog.pg_roles r on r.oid = d.setrole
    where r.rolname in ('app_migrator', 'app_authenticated', 'api_user', 'auth_service', 'app_definer', 'app_jobs') and d.setdatabase <> 0),
  0,
  'rolattributen: geen rolinstelling per database die de rolinstellingen zou overschrijven'
);

select * from finish();
rollback;
