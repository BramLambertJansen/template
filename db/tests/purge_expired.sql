-- app.retention_targets en app.purge_expired (spec achtergrondtaken, deel D: jobs/AC-30, jobs/AC-31, jobs/AC-32, jobs/AC-33; ADR 0050
-- punt 1 en 2): welke tabellen app_jobs opruimt, de termijn en de batchgrootte, de weigeringen (22023) en wie ze mag uitvoeren.
-- Alles in één transactie die terugdraait. Alles wat de nieuwe objecten raakt staat als tekst in een assert, zodat een
-- ontbrekende migratie een falende assert geeft en geen afgebroken script. Regels met een eigen tijdstip zet de eigenaar
-- (app_migrator, lid van app_definer) erin; pgTAP zelf draait nooit als app_jobs of app_authenticated. Vereist dat app_migrator
-- SET ROLE app_jobs mag (db/init/02-test-tools.sql). api_user en auth_service zijn niet te wisselen; voor hen toetst
-- has_function_privilege dezelfde grens (execute ontbreekt, dus 42501).
begin;
set search_path = tap, public;
select plan(32);

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

create function pg_temp.query_as(p_role text, p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_result := 'ERROR ' || sqlstate;
  end;
  reset role;
  return v_result;
end $$;

select ok(pg_catalog.pg_has_role('app_migrator', 'app_jobs', 'set'), 'testomgeving: app_migrator mag SET ROLE app_jobs (db/init/02-test-tools.sql)');

-- Een tabel zonder rij in app.retention, voor de weigering.
create table app.purge_probe (id integer, t timestamptz);

-- ===== jobs/AC-30: app.retention_targets =====
select is(
  pg_temp.query_as('app_jobs', $q$select string_agg(t::text, ',') from app.retention_targets() t$q$),
  'app.audit_log,app.one_time_use,app.rate_limits',
  'app.retention_targets: als app_jobs precies de tabellen met purger app en een termijn, op naam gesorteerd (jobs/AC-30)'
);
select is(
  (select count(*)::integer from app.retention r
   where r.purger = 'app' and r.keep is not null and r.table_name <> all (array['app.audit_log', 'app.one_time_use', 'app.rate_limits']::regclass[])),
  0,
  'app.retention_targets: geen andere tabel met purger app en een termijn in de catalogus (jobs/AC-30)'
);
select is(
  left(pg_temp.try_as('app_authenticated', $q$select * from app.retention_targets()$q$), 5),
  '42501',
  'app.retention_targets: als app_authenticated faalt met 42501 (jobs/AC-30)'
);
select results_eq(
  $$select r.rolname, coalesce(pg_catalog.has_function_privilege(r.rolname, to_regprocedure('app.retention_targets()'), 'execute'), false)
    from (values ('app_authenticated'), ('api_user'), ('auth_service'), ('public'), ('app_jobs')) r (rolname)
    order by r.rolname collate "C"$$,
  $$values ('api_user', false), ('app_authenticated', false), ('app_jobs', true), ('auth_service', false), ('public', false)$$,
  'app.retention_targets: execute alleen voor app_jobs, niet voor api_user, auth_service, app_authenticated en PUBLIC (jobs/AC-30)'
);
select results_eq(
  $$select p.proowner::regrole::text collate "default", p.prosecdef, p.proconfig @> array['search_path=""'], p.provolatile::text collate "default",
           p.prorettype::regtype::text collate "default", p.proretset,
           (select count(*)::integer from pg_catalog.pg_proc o join pg_catalog.pg_namespace n on n.oid = o.pronamespace
            where n.nspname = 'app' and o.proname = 'retention_targets')
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('app.retention_targets()')$$,
  $$values ('app_definer', true, true, 's', 'regclass', true, 1)$$,
  'app.retention_targets: security definer van app_definer, search_path leeg, stable, setof regclass, geen overload (jobs/AC-30)'
);

-- ===== jobs/AC-33: app.purge_expired is niet uitvoerbaar voor de API-rollen =====
select results_eq(
  $$select r.rolname, coalesce(pg_catalog.has_function_privilege(r.rolname, to_regprocedure('app.purge_expired(regclass, integer)'), 'execute'), false)
    from (values ('app_authenticated'), ('api_user'), ('auth_service'), ('public'), ('app_jobs')) r (rolname)
    order by r.rolname collate "C"$$,
  $$values ('api_user', false), ('app_authenticated', false), ('app_jobs', true), ('auth_service', false), ('public', false)$$,
  'app.purge_expired: execute alleen voor app_jobs, niet voor api_user, auth_service, app_authenticated en PUBLIC (jobs/AC-33)'
);
select is(
  left(pg_temp.try_as('app_authenticated', $q$select app.purge_expired('app.audit_log', 10)$q$), 5),
  '42501',
  'app.purge_expired: als app_authenticated faalt met 42501 (jobs/AC-33)'
);
select results_eq(
  $$select p.proowner::regrole::text collate "default", p.prosecdef, p.proconfig @> array['search_path=""'], p.provolatile::text collate "default",
           p.prorettype::regtype::text collate "default",
           (select count(*)::integer from pg_catalog.pg_proc o join pg_catalog.pg_namespace n on n.oid = o.pronamespace
            where n.nspname = 'app' and o.proname = 'purge_expired')
    from pg_catalog.pg_proc p where p.oid = to_regprocedure('app.purge_expired(regclass, integer)')$$,
  $$values ('app_definer', true, true, 'v', 'integer', 1)$$,
  'app.purge_expired: security definer van app_definer, search_path leeg, volatile, geeft integer, geen overload (jobs/AC-33)'
);

-- ===== jobs/AC-31: termijn en batchgrootte op app.audit_log =====
select lives_ok(
  $$insert into app.audit_log (at, action, request_id) values
      (pg_catalog.now() - interval '2 years', 'pe.old', 'pe-old-1'),
      (pg_catalog.now() - interval '2 years', 'pe.old', 'pe-old-2'),
      (pg_catalog.now() - interval '2 years', 'pe.old', 'pe-old-3'),
      (pg_catalog.now() - interval '2 years', 'pe.old', 'pe-old-4'),
      (pg_catalog.now() - interval '2 years', 'pe.old', 'pe-old-5'),
      (pg_catalog.now() - interval '364 days', 'pe.nearly', 'pe-364-1'),
      (pg_catalog.now() - interval '364 days', 'pe.nearly', 'pe-364-2'),
      (pg_catalog.now(), 'pe.new', 'pe-new')$$,
  'voorbereiding: vijf regels van 2 jaar, twee van 364 dagen en een van vandaag'
);
select is(
  pg_temp.query_as('app_jobs', $q$select app.purge_expired('app.audit_log', 3)::text$q$),
  '3',
  'app.purge_expired: met p_batch 3 verwijdert hij hooguit 3 verlopen regels en geeft 3 (jobs/AC-31)'
);
select is(
  (select count(*)::integer from app.audit_log where request_id like 'pe-old-%'),
  2,
  'app.purge_expired: na een batch van 3 staan er nog 2 van de 5 verlopen regels (jobs/AC-31)'
);
select is(
  pg_temp.query_as('app_jobs', $q$select app.purge_expired('app.audit_log', 1000)::text$q$),
  '2',
  'app.purge_expired: de volgende aanroep verwijdert de resterende 2 en geeft 2 (jobs/AC-31)'
);
select is(
  (select string_agg(request_id, ',' order by request_id) from app.audit_log where request_id like 'pe-%'),
  'pe-364-1,pe-364-2,pe-new',
  'app.purge_expired: regels van 364 dagen en van vandaag blijven staan (jobs/AC-31)'
);

-- Tweede tabel: app.rate_limits (termijn 60 seconden).
select lives_ok(
  $$insert into app.rate_limits (key, window_start, hits) values
      ('pe:oud', pg_catalog.now() - interval '61 seconds', 1), ('pe:vers', pg_catalog.now() - interval '30 seconds', 1)$$,
  'voorbereiding: een rate-limitrij van 61 en een van 30 seconden oud'
);
select is(
  pg_temp.query_as('app_jobs', $q$select app.purge_expired('app.rate_limits', 1000)::text$q$),
  '1',
  'app.purge_expired: app.rate_limits verwijdert de rij van 61 seconden en geeft 1 (jobs/AC-31)'
);
select is(
  (select string_agg(key, ',' order by key) from app.rate_limits where key like 'pe:%'),
  'pe:vers',
  'app.purge_expired: de rij van 30 seconden blijft staan (jobs/AC-31)'
);

-- ===== jobs/AC-32: weigeringen =====
select is(
  left(pg_temp.try_as('app_jobs', $q$select app.purge_expired('app.purge_probe', 10)$q$), 5),
  '22023',
  'app.purge_expired: een tabel zonder rij in app.retention geeft 22023 (jobs/AC-32)'
);
select is(
  left(pg_temp.try_as('app_jobs', format($q$select app.purge_expired(%s::oid::regclass, 10)$q$, 'better_auth.session'::regclass::oid)), 5),
  '22023',
  'app.purge_expired: better_auth.session (purger auth) geeft 22023 (jobs/AC-32)'
);
select is(
  left(pg_temp.try_as('app_jobs', $q$select app.purge_expired('app.audit_log', 0)$q$), 5),
  '22023',
  'app.purge_expired: p_batch 0 geeft 22023 (jobs/AC-32)'
);
select is(
  left(pg_temp.try_as('app_jobs', $q$select app.purge_expired('app.audit_log', 1001)$q$), 5),
  '22023',
  'app.purge_expired: p_batch 1001 geeft 22023 (jobs/AC-32)'
);
select is(
  left(pg_temp.try_as('app_jobs', $q$select app.purge_expired('app.audit_log', -1)$q$), 5),
  '22023',
  'app.purge_expired: een negatieve p_batch geeft 22023 (jobs/AC-32)'
);
select is(
  pg_temp.try_as('app_jobs', $q$select app.purge_expired('app.audit_log', 1000)$q$),
  '00000',
  'app.purge_expired: p_batch 1000 (de grens) is toegestaan (jobs/AC-32)'
);
-- De volgorde: een onbekende tabel gaat vóór een ongeldige batch, een auth-tabel ook.
select is(
  left(pg_temp.try_as('app_jobs', $q$select app.purge_expired('app.purge_probe', 0)$q$), 5),
  '22023',
  'app.purge_expired: een tabel zonder rij met een ongeldige batch geeft ook 22023 (jobs/AC-32)'
);

-- public.user_roles heeft keep null: 0 en er verdwijnt niets.
select lives_ok($$insert into better_auth."user" (id, name, email, "emailVerified") values ('pe-user', 'Pe', 'pe-user@example.test', true)$$, 'voorbereiding: een account voor de rol');
select lives_ok($$insert into public.user_roles (user_id, role) values ('pe-user', 'user')$$, 'voorbereiding: een rij in public.user_roles (keep null)');
select is(
  pg_temp.query_as('app_jobs', format($q$select app.purge_expired(%s::oid::regclass, 1000)::text$q$, 'public.user_roles'::regclass::oid)),
  '0',
  'app.purge_expired: voor public.user_roles (keep null) is het resultaat 0 (jobs/AC-32)'
);
select is(
  (select count(*)::integer from public.user_roles where user_id = 'pe-user'),
  1,
  'app.purge_expired: public.user_roles verliest geen rij (jobs/AC-32)'
);

-- Een gepartitioneerde tabel (relkind p) wordt geweigerd, ook met een rij in app.retention (ctid is er niet uniek).
create table app.purge_part (id integer, t timestamptz) partition by range (t);
select lives_ok($$alter table app.retention no force row level security$$, 'voorbereiding: FORCE RLS op app.retention uit, alleen in deze transactie');
select lives_ok($$insert into app.retention values ('app.purge_part', 't', interval '1 year', 'app', 'probe')$$, 'voorbereiding: een rij voor de gepartitioneerde tabel');
select is(
  left(pg_temp.try_as('app_jobs', format($q$select app.purge_expired(%s::oid::regclass, 10)$q$, 'app.purge_part'::regclass::oid)), 5),
  '22023',
  'app.purge_expired: een gepartitioneerde tabel (relkind p) geeft 22023 (jobs/AC-32)'
);

-- De grens in de functie is app.retention_cutoff (de policy van de tabel is de tweede grens).
select is(
  (select count(*)::integer from pg_catalog.pg_proc p where p.oid = to_regprocedure('app.purge_expired(regclass, integer)') and p.prosrc ~ 'retention_cutoff'),
  1,
  'app.purge_expired: de grens is app.retention_cutoff, niet een eigen berekening (jobs/AC-31)'
);

select * from finish();
rollback;
