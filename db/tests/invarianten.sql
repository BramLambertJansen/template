-- RLS- en grant-invarianten (framework §6, ADR 0004): gelden voor elke tabel, ook toekomstige. Elke invariant is een
-- query die de overtredingen teruggeeft; de test eist dat die leeg is en bewijst daarna met een opzettelijke fout dat
-- de query hem vangt. Alles in één transactie die terugdraait.
begin;
set search_path = tap, public;
select plan(12);

-- Elke tabel in public en app: RLS aan én geforceerd (uitzondering: public.schema_migrations van dbmate).
create function pg_temp.zonder_rls() returns setof text language sql stable as $$
  select format('%I.%I', n.nspname, c.relname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where c.relkind in ('r', 'p') and n.nspname in ('public', 'app')
    and not (n.nspname = 'public' and c.relname = 'schema_migrations')
    and not (c.relrowsecurity and c.relforcerowsecurity)
  order by 1
$$;

-- Geen rol buiten de eigenaar heeft TRUNCATE, REFERENCES of TRIGGER, op tabellen in public, app of better_auth.
create function pg_temp.verboden_rechten() returns setof text language sql stable as $$
  select format('%s: %s op %I.%I', r.rolname, p.recht, n.nspname, c.relname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join (values ('app_authenticated'), ('api_user'), ('auth_service'), ('app_definer')) r (rolname)
  cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) p (recht)
  where c.relkind in ('r', 'p', 'v', 'm', 'f') and n.nspname in ('public', 'app', 'better_auth')
    and pg_catalog.has_table_privilege(r.rolname, c.oid, p.recht)
  order by 1
$$;

-- Schema better_auth is dicht: rechten op het schema, de tabellen en de kolommen alleen voor auth_service (en de eigenaar).
-- Uitzondering (besluit eigenaar, view app.accounts): app_definer mag het schema gebruiken en exact de kolommen hieronder
-- lezen. Elke andere grant, ook een extra kolom of een ander recht, is een overtreding.
create temp table better_auth_allowlist (rol text, recht text, object text);
insert into better_auth_allowlist values
  ('app_definer', 'USAGE', 'schema better_auth'),
  ('app_definer', 'SELECT', 'better_auth.user.id'),
  ('app_definer', 'SELECT', 'better_auth.user.name'),
  ('app_definer', 'SELECT', 'better_auth.user.email'),
  ('app_definer', 'SELECT', 'better_auth.user.createdAt'),
  ('app_definer', 'SELECT', 'better_auth.account.userId'),
  ('app_definer', 'SELECT', 'better_auth.account.providerId');

create function pg_temp.better_auth_open() returns setof text language sql stable as $$
  with grants as (
    select coalesce(g.rolname, 'PUBLIC') as rol, a.privilege_type as recht, 'schema better_auth' as object
    from pg_catalog.pg_namespace n
    cross join lateral pg_catalog.aclexplode(coalesce(n.nspacl, pg_catalog.acldefault('n', n.nspowner))) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where n.nspname = 'better_auth' and a.grantee <> n.nspowner
    union all
    select coalesce(g.rolname, 'PUBLIC'), a.privilege_type, n.nspname || '.' || c.relname
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where n.nspname = 'better_auth' and a.grantee <> c.relowner
    union all
    select coalesce(g.rolname, 'PUBLIC'), a.privilege_type, n.nspname || '.' || c.relname || '.' || att.attname
    from pg_catalog.pg_attribute att
    join pg_catalog.pg_class c on c.oid = att.attrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    cross join lateral pg_catalog.aclexplode(att.attacl) a
    left join pg_catalog.pg_roles g on g.oid = a.grantee
    where n.nspname = 'better_auth' and att.attacl is not null and a.grantee <> c.relowner
  )
  select format('%s: %s op %s', rol, recht, object) from grants
  where rol <> 'auth_service'
    and (rol, recht, object) not in (select rol, recht, object from better_auth_allowlist)
  order by 1
$$;

-- PUBLIC krijgt niets: geen tabelrechten in public, app en better_auth, geen EXECUTE op functies in public en app.
create function pg_temp.rechten_voor_public() returns setof text language sql stable as $$
  select format('PUBLIC: %s op %I.%I', a.privilege_type, n.nspname, c.relname)
  from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))) a
  where n.nspname in ('public', 'app', 'better_auth') and a.grantee = 0
  union all
  select format('PUBLIC: EXECUTE op %I.%I(%s)', n.nspname, p.proname, pg_catalog.oidvectortypes(p.proargtypes))
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  cross join lateral pg_catalog.aclexplode(coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))) a
  where n.nspname in ('public', 'app') and a.grantee = 0
  order by 1
$$;

select is(array(select pg_temp.zonder_rls()), '{}'::text[], 'elke tabel in public en app heeft RLS aan en geforceerd');
select is(array(select pg_temp.verboden_rechten()), '{}'::text[], 'geen API-rol heeft TRUNCATE, REFERENCES of TRIGGER');
select is(array(select pg_temp.better_auth_open()), '{}'::text[], 'better_auth: alleen auth_service heeft rechten, plus de kolom-allowlist van app_definer');
select is(array(select pg_temp.rechten_voor_public()), '{}'::text[], 'PUBLIC heeft geen tabelrechten en geen EXECUTE');
select is(has_schema_privilege('app_authenticated', 'better_auth', 'usage'), false, 'app_authenticated kan schema better_auth niet gebruiken');
select is(has_schema_privilege('api_user', 'better_auth', 'usage'), false, 'api_user kan schema better_auth niet gebruiken');

-- Controle: elke invariant vangt een opzettelijke fout.
create table app.invariant_probe (id integer primary key);
alter table app.invariant_probe enable row level security;
select is(array(select pg_temp.zonder_rls()), array['app.invariant_probe'], 'controle: RLS aan maar niet geforceerd wordt gevangen');

grant select, truncate on app.invariant_probe to app_authenticated;
select is(array(select pg_temp.verboden_rechten()), array['app_authenticated: TRUNCATE op app.invariant_probe'], 'controle: TRUNCATE voor app_authenticated wordt gevangen');

create table better_auth.invariant_probe (id integer primary key);
grant select on better_auth.invariant_probe to app_authenticated;
select is(
  array(select pg_temp.better_auth_open()),
  array['app_authenticated: SELECT op better_auth.invariant_probe'],
  'controle: een grant op better_auth aan een andere rol wordt gevangen'
);

grant select (password) on better_auth.account to app_definer;
select is(
  array(select pg_temp.better_auth_open()),
  array['app_authenticated: SELECT op better_auth.invariant_probe', 'app_definer: SELECT op better_auth.account.password'],
  'controle: een kolom buiten de allowlist (wachtwoord) wordt gevangen'
);
select is(
  (select count(*)::integer from better_auth_allowlist a
   where not exists (
     select 1 from pg_catalog.pg_attribute att join pg_catalog.pg_class c on c.oid = att.attrelid
     where a.object = 'better_auth.' || c.relname || '.' || att.attname
       and pg_catalog.has_column_privilege(a.rol, c.oid, att.attnum, a.recht)
   ) and a.object <> 'schema better_auth'),
  0,
  'de allowlist beschrijft precies wat app_definer nu mag lezen (geen verouderde regels)'
);

create function app.invariant_probe_fn() returns integer language sql return 1;
grant execute on function app.invariant_probe_fn() to public;
select is(
  array(select pg_temp.rechten_voor_public()),
  array['PUBLIC: EXECUTE op app.invariant_probe_fn()'],
  'controle: EXECUTE voor PUBLIC wordt gevangen'
);

select * from finish();
rollback;
