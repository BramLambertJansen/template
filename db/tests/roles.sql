-- app.roles en het rollenregister (spec rollenregister, ST-16: rollenregister/AC-3 t/m AC-12 en AC-17): tabel, CHECK, RLS, elke
-- policy op naam, grants, de functies (register_role, unregister_role, assert_roles_registered, has_counted_beheer), de twee
-- triggers van de laatste-beheerder-regel, de FK van user_roles en beheer als bron van is_mfa_admin. Alles in één transactie
-- die terugdraait. De races (AC-10) staan in test/auth/roles-races.int.test.ts.
-- Alles wat de nieuwe objecten raakt gaat via tekst (pg_temp.attempt, pg_temp.scalar, results_eq of lives_ok), zodat een
-- ontbrekende migratie als falende assert verschijnt en niet als afgebroken script. Testregister: planner (geen beheer),
-- eigenaar (beheer) en toezicht (beheer). pgTAP draait op een verse database zonder accounts (zoals db/tests/user_roles.sql).
begin;
set search_path = tap, public;
select plan(117);

-- Voert SQL uit en geeft '00000' (gelukt) of 'sqlstate|melding' terug; de fout draait alleen dit statement terug.
create function pg_temp.attempt(p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  begin
    execute p_sql;
    v_result := '00000';
  exception when others then
    v_result := sqlstate || '|' || sqlerrm;
  end;
  return v_result;
end $$;

-- Idem voor een query met één waarde; een fout geeft 'ERROR sqlstate|melding'.
create function pg_temp.scalar(p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  begin
    execute p_sql into v_result;
  exception when others then
    v_result := 'ERROR ' || sqlstate || '|' || sqlerrm;
  end;
  return v_result;
end $$;

-- Als een rol met een actor zoals withUser hem zet (set_config met is_local = true), zoals de testkit; leeg = geen actor.
create function pg_temp.attempt_as(p_role text, p_user text, p_strength text, p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  perform set_config('app.user_id', p_user, true);
  perform set_config('app.session_strength', p_strength, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql;
    v_result := '00000';
  exception when others then
    v_result := sqlstate || '|' || sqlerrm;
  end;
  reset role;
  perform set_config('app.user_id', '', true);
  perform set_config('app.session_strength', '', true);
  return v_result;
end $$;

create function pg_temp.scalar_as(p_role text, p_user text, p_strength text, p_sql text) returns text language plpgsql as $$
declare v_result text;
begin
  perform set_config('app.user_id', p_user, true);
  perform set_config('app.session_strength', p_strength, true);
  execute format('set local role %I', p_role);
  begin
    execute p_sql into v_result;
  exception when others then
    v_result := 'ERROR ' || sqlstate || '|' || sqlerrm;
  end;
  reset role;
  perform set_config('app.user_id', '', true);
  perform set_config('app.session_strength', '', true);
  return v_result;
end $$;

-- AC-17: de FK weghalen, een rij met een onbekende rol toevoegen en de controle aanroepen. Alles wat de functie wijzigt
-- wordt teruggedraaid (de uitzondering aan het eind); de uitkomst blijft in de variabele.
create function pg_temp.assert_with_unregistered_row() returns text language plpgsql as $$
declare v_result text;
begin
  begin
    alter table public.user_roles drop constraint user_roles_role_fkey;
    insert into public.user_roles (user_id, role) values ('r-baas', 'baas');
    begin
      perform app.assert_roles_registered();
      v_result := '00000';
    exception when others then
      v_result := sqlstate || '|' || sqlerrm;
    end;
    raise exception 'terugdraaien' using errcode = 'ZZ001';
  exception when others then
    if sqlstate <> 'ZZ001' then v_result := 'SETUP|' || sqlerrm; end if;
  end;
  return v_result;
end $$;

-- ===== Fase A: lege database (rollenregister/AC-9) =====
select is(
  pg_temp.scalar($$select count(*) from public.user_roles$$),
  '0',
  'voorwaarde: de database heeft nog geen rol toegekend (lege database, zoals AC-9 vraagt)'
);
select is(pg_temp.scalar($$select app.has_counted_beheer()$$), 'false', 'rollenregister/AC-9: zonder accounts is er geen telbare beheerder');
select lives_ok($$select app.register_role('planner', false)$$, 'rollenregister/AC-9: zonder accounts slaagt register_role(planner, false)');
select lives_ok($$select app.register_role('eigenaar', true)$$, 'rollenregister/AC-9: zonder accounts slaagt register_role(eigenaar, true)');
select lives_ok($$select app.register_role('eigenaar', false)$$, 'rollenregister/AC-9: daarna slaagt register_role(eigenaar, false), zonder dragers');
select results_eq(
  $$select beheer from app.roles where name = 'eigenaar'$$,
  $$values (false)$$,
  'rollenregister/AC-9: register_role is een upsert: eigenaar heeft nu beheer false'
);
select lives_ok($$select app.unregister_role('eigenaar')$$, 'rollenregister/AC-9: zonder dragers slaagt unregister_role(eigenaar)');
select is(
  pg_temp.scalar($$select count(*) from app.roles where name = 'eigenaar'$$),
  '0',
  'rollenregister/AC-9: eigenaar staat daarna niet meer in app.roles'
);
select lives_ok($$select app.register_role('eigenaar', true)$$, 'voorbereiding: eigenaar opnieuw met beheer');
select lives_ok($$select app.register_role('toezicht', true)$$, 'voorbereiding: toezicht met beheer');

-- ===== De tabel (Datawijzigingen 1) =====
select is(to_regclass('app.roles')::text, 'app.roles', 'app.roles: de tabel bestaat in schema app');
select results_eq(
  $$select c.relrowsecurity, c.relforcerowsecurity from pg_catalog.pg_class c where c.oid = to_regclass('app.roles')$$,
  $$values (true, true)$$,
  'app.roles: RLS aan en geforceerd'
);
select results_eq(
  $$select a.attname::text collate "default", pg_catalog.format_type(a.atttypid, a.atttypmod), a.attnotnull
    from pg_catalog.pg_attribute a
    where a.attrelid = to_regclass('app.roles') and a.attnum > 0 and not a.attisdropped order by a.attnum$$,
  $$values ('name', 'text', true), ('beheer', 'boolean', true)$$,
  'app.roles: kolommen name text en beheer boolean, beide not null'
);
select col_is_pk('app', 'roles', 'name', 'app.roles: name is de primaire sleutel');
select results_eq(
  $$select name, beheer from app.roles where name in ('user', 'admin') order by name$$,
  $$values ('admin', true), ('user', false)$$,
  'app.roles: de basisrollen user (geen beheer) en admin (beheer) staan er altijd in'
);
select results_eq(
  $$select count(*)::integer, bool_and(keep is null) from app.retention where table_name = to_regclass('app.roles')$$,
  $$values (1, true)$$,
  'app.retention: een rij voor app.roles zonder termijn (keep null, R-DB-17)'
);

-- ===== Policies op naam (Datawijzigingen 2) =====
select policies_are(
  'app', 'roles',
  array['roles_select_authenticated', 'roles_definer_select', 'roles_definer_insert', 'roles_definer_update', 'roles_definer_delete'],
  'app.roles heeft precies deze vijf policies'
);
select results_eq(
  $$select p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default",
           coalesce(p.qual, '-')::text collate "default", coalesce(p.with_check, '-')::text collate "default"
    from pg_catalog.pg_policies p where p.schemaname = 'app' and p.tablename = 'roles' and p.policyname = 'roles_select_authenticated'$$,
  $$values ('SELECT', '{app_authenticated}', 'PERMISSIVE', 'true', '-')$$,
  'roles_select_authenticated: for select to app_authenticated using (true)'
);
select results_eq(
  $$select p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default",
           coalesce(p.qual, '-')::text collate "default", coalesce(p.with_check, '-')::text collate "default"
    from pg_catalog.pg_policies p where p.schemaname = 'app' and p.tablename = 'roles' and p.policyname = 'roles_definer_select'$$,
  $$values ('SELECT', '{app_definer}', 'PERMISSIVE', 'true', '-')$$,
  'roles_definer_select: for select to app_definer using (true)'
);
select results_eq(
  $$select p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default",
           coalesce(p.qual, '-')::text collate "default", coalesce(p.with_check, '-')::text collate "default"
    from pg_catalog.pg_policies p where p.schemaname = 'app' and p.tablename = 'roles' and p.policyname = 'roles_definer_insert'$$,
  $$values ('INSERT', '{app_definer}', 'PERMISSIVE', '-', 'true')$$,
  'roles_definer_insert: for insert to app_definer with check (true)'
);
select results_eq(
  $$select p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default",
           coalesce(p.qual, '-')::text collate "default", coalesce(p.with_check, '-')::text collate "default"
    from pg_catalog.pg_policies p where p.schemaname = 'app' and p.tablename = 'roles' and p.policyname = 'roles_definer_update'$$,
  $$values ('UPDATE', '{app_definer}', 'PERMISSIVE', 'true', 'true')$$,
  'roles_definer_update: for update to app_definer using (true) with check (true)'
);
select results_eq(
  $$select p.cmd::text collate "default", p.roles::text collate "default", p.permissive::text collate "default",
           coalesce(p.with_check, '-')::text collate "default", p.qual like '%user%' and p.qual like '%admin%'
    from pg_catalog.pg_policies p where p.schemaname = 'app' and p.tablename = 'roles' and p.policyname = 'roles_definer_delete'$$,
  $$values ('DELETE', '{app_definer}', 'PERMISSIVE', '-', true)$$,
  'roles_definer_delete: for delete to app_definer using (name not in (user, admin))'
);

-- Gedrag per policy.
select is(
  pg_temp.scalar_as('app_authenticated', '', '', $$select count(*) from app.roles$$),
  pg_temp.scalar($$select count(*) from app.roles$$),
  'roles_select_authenticated: app_authenticated ziet alle rollen, ook zonder actor'
);
select is(
  pg_temp.scalar_as('app_definer', '', '', $$select count(*) from app.roles$$),
  pg_temp.scalar($$select count(*) from app.roles$$),
  'roles_definer_select: app_definer ziet alle rollen'
);
select is(
  pg_temp.attempt_as('app_definer', '', '', $$insert into app.roles (name, beheer) values ('probe', false)$$),
  '00000',
  'roles_definer_insert: app_definer voegt een rol toe'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', '', '', $$insert into app.roles (name, beheer) values ('probe2', false)$$), 5),
  '42501',
  'roles_definer_insert: app_authenticated schrijft nooit direct (geen recht, 42501)'
);
select is(
  pg_temp.scalar_as('app_definer', '', '', $$with u as (update app.roles set beheer = true where name = 'probe' returning 1) select count(*) from u$$),
  '1',
  'roles_definer_update: app_definer wijzigt een rol (beheer), de CHECK bewaakt alleen de basisrollen'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', '', '', $$update app.roles set beheer = true where name = 'probe'$$), 5),
  '42501',
  'roles_definer_update: app_authenticated wijzigt nooit direct (42501)'
);
select is(
  pg_temp.scalar_as('app_definer', '', '', $$with d as (delete from app.roles where name in ('user', 'admin') returning 1) select count(*) from d$$),
  '0',
  'roles_definer_delete: app_definer raakt de basisrollen user en admin niet (0 rijen)'
);
select is(
  pg_temp.scalar_as('app_definer', '', '', $$with d as (delete from app.roles where name = 'probe' returning 1) select count(*) from d$$),
  '1',
  'roles_definer_delete: app_definer verwijdert een andere rol'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', '', '', $$delete from app.roles where name = 'planner'$$), 5),
  '42501',
  'roles_definer_delete: app_authenticated verwijdert nooit direct (42501)'
);

-- ===== Grants (Datawijzigingen 2) =====
select is(
  array(
    select p.privilege from (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (privilege)
    where pg_catalog.has_table_privilege('app_authenticated', to_regclass('app.roles'), p.privilege)
    order by 1
  ),
  array['select'],
  'app_authenticated heeft precies select op app.roles'
);
select is(
  array(
    select r.rolname || ':' || p.privilege
    from (values ('api_user'), ('auth_service')) r (rolname)
    cross join (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (privilege)
    where pg_catalog.has_table_privilege(r.rolname, to_regclass('app.roles'), p.privilege)
    order by 1
  ),
  '{}'::text[],
  'api_user en auth_service hebben geen recht op app.roles'
);
select is(
  array(
    select p.privilege from (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (privilege)
    where pg_catalog.has_table_privilege('public', to_regclass('app.roles'), p.privilege)
  ),
  '{}'::text[],
  'PUBLIC heeft geen recht op app.roles'
);
select is(
  array(
    select p.privilege from (values ('select'), ('insert'), ('update'), ('delete'), ('truncate'), ('references'), ('trigger')) p (privilege)
    where pg_catalog.has_table_privilege('app_definer', to_regclass('app.roles'), p.privilege)
    order by 1
  ),
  array['delete', 'insert', 'select', 'update'],
  'app_definer heeft precies select, insert, update en delete op app.roles (nooit truncate, references, trigger)'
);
select is(
  array(
    select p.privilege from (values ('select'), ('insert'), ('update'), ('delete')) p (privilege)
    where pg_catalog.has_table_privilege('app_migrator', to_regclass('app.roles'), p.privilege)
    order by 1
  ),
  array['delete', 'insert', 'select', 'update'],
  'app_migrator erft select, insert, update en delete op app.roles via app_definer'
);

-- ===== Functies en triggers (Datawijzigingen 5, Ontwerp: laatste beheerder) =====
select results_eq(
  $$select f, p.proowner::regrole::text, p.prosecdef, coalesce(p.proconfig @> array['search_path=""'], false)
    from unnest(array['app.register_role(text, boolean)', 'app.unregister_role(text)', 'app.assert_roles_registered()',
                      'app.has_counted_beheer()', 'app.roles_keep_one_beheer()']) f
    left join pg_catalog.pg_proc p on p.oid = to_regprocedure(f) order by f collate "C"$$,
  $$values ('app.assert_roles_registered()', 'app_definer', true, true), ('app.has_counted_beheer()', 'app_definer', true, true),
           ('app.register_role(text, boolean)', 'app_definer', true, true), ('app.roles_keep_one_beheer()', 'app_definer', true, true),
           ('app.unregister_role(text)', 'app_definer', true, true)$$,
  'de vijf nieuwe functies bestaan: security definer, eigenaar app_definer, search_path leeg'
);
select is(
  array(
    select r.rolname || ':' || f
    from (values ('app_authenticated'), ('api_user'), ('auth_service'), ('public')) r (rolname)
    cross join unnest(array['app.register_role(text, boolean)', 'app.unregister_role(text)', 'app.assert_roles_registered()',
                            'app.has_counted_beheer()', 'app.roles_keep_one_beheer()']) f
    where pg_catalog.has_function_privilege(r.rolname, to_regprocedure(f), 'execute')
    order by 1
  ),
  '{}'::text[],
  'de vijf nieuwe functies zijn intern: geen execute voor app_authenticated, api_user, auth_service of PUBLIC'
);
select results_eq(
  $$select pg_catalog.pg_get_triggerdef(t.oid) from pg_catalog.pg_trigger t
    where t.tgrelid = to_regclass('app.roles') and t.tgname = 'roles_keep_one_beheer' and not t.tgisinternal$$,
  $$values ('CREATE TRIGGER roles_keep_one_beheer AFTER DELETE OR UPDATE ON app.roles FOR EACH ROW EXECUTE FUNCTION app.roles_keep_one_beheer()')$$,
  'roles_keep_one_beheer: after update or delete for each row op app.roles, zonder WHEN-clause'
);
select results_eq(
  $$select pg_catalog.pg_get_triggerdef(t.oid) from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.user_roles'::regclass and t.tgname = 'user_roles_keep_one_admin' and not t.tgisinternal$$,
  $$values ('CREATE TRIGGER user_roles_keep_one_admin AFTER DELETE OR UPDATE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION app.user_roles_keep_one_admin()')$$,
  'user_roles_keep_one_admin: blijft after update or delete for each row op public.user_roles'
);
select results_eq(
  $$select c.confrelid::regclass::text, c.confdeltype::text from pg_catalog.pg_constraint c
    where c.conname = 'user_roles_role_fkey' and c.conrelid = 'public.user_roles'::regclass$$,
  $$values ('app.roles', 'r')$$,
  'user_roles_role_fkey: verwijst naar app.roles, on delete restrict'
);
select is(
  (select count(*)::integer from pg_catalog.pg_constraint where conname = 'user_roles_role_check' and conrelid = 'public.user_roles'::regclass),
  0,
  'user_roles_role_check (de vaste lijst user, admin) bestaat niet meer'
);

-- ===== Testgebruikers =====
-- r-eig (eigenaar, telbaar), r-blk (admin, geblokkeerd), r-dea (toezicht, gedeactiveerd), r-inv (eigenaar, uitgenodigd: geen
-- credential-account), r-pl (planner), r-usr en r-tgt (user), r-adm (admin, later telbaar), r-baas (zonder rol).
insert into better_auth."user" (id, name, email, "emailVerified") values
  ('r-eig', 'Eigenaar', 'r-eig@test.local', true),
  ('r-blk', 'Geblokkeerd', 'r-blk@test.local', true),
  ('r-dea', 'Gedeactiveerd', 'r-dea@test.local', true),
  ('r-inv', 'Uitgenodigd', 'r-inv@test.local', false),
  ('r-pl', 'Planner', 'r-pl@test.local', true),
  ('r-usr', 'Gebruiker', 'r-usr@test.local', true),
  ('r-tgt', 'Doelwit', 'r-tgt@test.local', true),
  ('r-adm', 'Admin', 'r-adm@test.local', true),
  ('r-baas', 'Zonder rol', 'r-baas@test.local', true);
insert into better_auth.account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt") values
  ('racc-eig', 'r-eig', 'credential', 'r-eig', 'hash', now(), now()),
  ('racc-blk', 'r-blk', 'credential', 'r-blk', 'hash', now(), now()),
  ('racc-dea', 'r-dea', 'credential', 'r-dea', 'hash', now(), now()),
  ('racc-pl', 'r-pl', 'credential', 'r-pl', 'hash', now(), now()),
  ('racc-usr', 'r-usr', 'credential', 'r-usr', 'hash', now(), now()),
  ('racc-tgt', 'r-tgt', 'credential', 'r-tgt', 'hash', now(), now()),
  ('racc-adm', 'r-adm', 'credential', 'r-adm', 'hash', now(), now());
select is(
  pg_temp.attempt($$select app.assign_role('r-usr', 'user'), app.assign_role('r-tgt', 'user'), app.assign_role('r-pl', 'planner'),
                         app.assign_role('r-blk', 'admin'), app.assign_role('r-dea', 'toezicht'), app.assign_role('r-inv', 'eigenaar'),
                         app.assign_role('r-eig', 'eigenaar')$$),
  '00000',
  'voorbereiding: rollen toegekend, ook een beheerrol van de app (eigenaar, toezicht) en een planner'
);
update better_auth."user" set blocked_at = now() where id = 'r-blk';
update better_auth."user" set deactivated_at = now() where id = 'r-dea';
select results_eq(
  $$select ur.user_id::text from public.user_roles ur
    join app.roles r on r.name = ur.role
    join better_auth."user" u on u.id = ur.user_id
    where r.beheer and u.blocked_at is null and u.deactivated_at is null
      and exists (select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential')
    order by 1$$,
  $$values ('r-eig')$$,
  'voorwaarde: r-eig (eigenaar) is de enige telbare beheerder; geblokkeerd, gedeactiveerd en uitgenodigd tellen niet'
);
select is(
  pg_temp.scalar($$select count(*) from public.user_roles ur join app.roles r on r.name = ur.role where r.beheer$$),
  '4',
  'voorwaarde: vier dragers van een beheerrol (r-eig, r-blk, r-dea, r-inv), waarvan er drie niet telbaar zijn'
);
select is(pg_temp.scalar($$select app.has_counted_beheer()$$), 'true', 'voorwaarde: app.has_counted_beheer() is true met r-eig');

-- ===== rollenregister/AC-7: de laatste telbare beheerder (eigenaar) =====
-- De actor is r-dea: een beheerrol met MFA (voor de database genoeg), zelf niet telbaar.
select is(
  pg_temp.attempt_as('app_authenticated', 'r-dea', 'mfa', $$select app.set_account_blocked('r-eig', true)$$),
  'P0001|LAST_ADMIN',
  'rollenregister/AC-7: de laatste telbare beheerder (eigenaar) blokkeren geeft LAST_ADMIN'
);
select is(
  pg_temp.attempt_as('app_authenticated', 'r-dea', 'mfa', $$select app.set_account_deactivated('r-eig', true)$$),
  'P0001|LAST_ADMIN',
  'rollenregister/AC-7: de laatste telbare beheerder (eigenaar) deactiveren geeft LAST_ADMIN'
);
select is(
  pg_temp.attempt($$select app.assign_role('r-eig', 'user')$$),
  'P0001|LAST_ADMIN',
  'rollenregister/AC-7: de laatste telbare beheerder (eigenaar) naar user degraderen geeft LAST_ADMIN'
);
select is(
  pg_temp.attempt($$delete from better_auth."user" where id = 'r-eig'$$),
  'P0001|LAST_ADMIN',
  'rollenregister/AC-7: de laatste telbare beheerder (eigenaar) verwijderen geeft LAST_ADMIN (cascade naar user_roles)'
);
select results_eq(
  $$select u.blocked_at is null, u.deactivated_at is null, ur.role from better_auth."user" u
    join public.user_roles ur on ur.user_id = u.id where u.id = 'r-eig'$$,
  $$values (true, true, 'eigenaar')$$,
  'rollenregister/AC-7: alles teruggedraaid: r-eig bestaat nog, is niet geblokkeerd of gedeactiveerd en blijft eigenaar'
);
select is(
  pg_temp.scalar($$select count(*) from app.audit_log where target_id = 'r-eig'$$),
  '1',
  'rollenregister/AC-7: geen auditregel voor de geweigerde acties (alleen de roltoekenning van de voorbereiding)'
);
select lives_ok(
  $$select app.assign_role('r-eig', 'admin')$$,
  'rollenregister/AC-7: eigenaar naar admin slaagt (beheer blijft beheer)'
);
select lives_ok(
  $$select app.assign_role('r-eig', 'eigenaar')$$,
  'rollenregister/AC-7: en admin terug naar eigenaar slaagt ook'
);

-- ===== rollenregister/AC-8: register_role als alleen eigenaar telbare dragers heeft =====
select is(
  pg_temp.attempt($$select app.register_role('eigenaar', false)$$),
  'P0001|LAST_ADMIN',
  'rollenregister/AC-8: register_role(eigenaar, false) terwijl alleen eigenaar telbare dragers heeft geeft LAST_ADMIN'
);
select results_eq(
  $$select beheer from app.roles where name = 'eigenaar'$$,
  $$values (true)$$,
  'rollenregister/AC-8: beheer van eigenaar blijft true'
);
select lives_ok(
  $$select app.register_role('toezicht', false)$$,
  'rollenregister/AC-8: een rol zonder telbare dragers (toezicht: alleen een gedeactiveerde) mag zijn beheer verliezen'
);
select lives_ok($$select app.register_role('toezicht', true)$$, 'voorbereiding: toezicht weer met beheer');

-- ===== Fase D: een tweede telbare beheerder (admin) =====
select is(
  pg_temp.attempt($$select app.assign_role('r-adm', 'admin')$$),
  '00000',
  'voorbereiding: r-adm is een tweede telbare beheerder (admin)'
);
select is(
  pg_temp.attempt_as('app_authenticated', 'r-dea', 'mfa', $$select app.set_account_blocked('r-eig', true)$$),
  '00000',
  'rollenregister/AC-7: met een telbare admin erbij slaagt blokkeren van eigenaar wel'
);
select is(
  pg_temp.attempt_as('app_authenticated', 'r-dea', 'mfa', $$select app.set_account_blocked('r-eig', false)$$),
  '00000',
  'voorbereiding: r-eig weer gedeblokkeerd'
);
select lives_ok(
  $$select app.assign_role('r-eig', 'user')$$,
  'rollenregister/AC-7: met een telbare admin erbij slaagt degraderen van eigenaar naar user wel'
);
select lives_ok($$select app.assign_role('r-eig', 'eigenaar')$$, 'voorbereiding: r-eig weer eigenaar');
select lives_ok(
  $$select app.register_role('eigenaar', false)$$,
  'rollenregister/AC-8: met een telbare admin erbij slaagt register_role(eigenaar, false)'
);
select results_eq(
  $$select beheer from app.roles where name = 'eigenaar'$$,
  $$values (false)$$,
  'rollenregister/AC-8: beheer van eigenaar is nu false'
);

-- ===== rollenregister/AC-16: de beheervlag bepaalt is_mfa_admin en de accountfuncties =====
select is(
  pg_temp.scalar_as('app_authenticated', 'r-eig', 'mfa', $$select app.is_mfa_admin()$$),
  'false',
  'rollenregister/AC-16: eigenaar verliest beheer: een mfa-sessie is geen beheerder meer (is_mfa_admin false)'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', 'r-eig', 'mfa', $$select app.assign_role('r-usr', 'user')$$), 5),
  '42501',
  'rollenregister/AC-16: eigenaar zonder beheer: app.assign_role geeft 42501 ook met een mfa-sessie'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-eig', 'mfa', $$select count(*) from app.audit_log$$),
  '0',
  'rollenregister/AC-16: eigenaar zonder beheer: app.audit_log blijft leeg ook met een mfa-sessie'
);
select lives_ok($$select app.register_role('eigenaar', true)$$, 'rollenregister/AC-16: eigenaar krijgt weer beheer');
select is(
  pg_temp.scalar_as('app_authenticated', 'r-eig', 'mfa', $$select app.is_mfa_admin()$$),
  'true',
  'rollenregister/AC-16: eigenaar met beheer en een mfa-sessie is is_mfa_admin'
);
select lives_ok($$select app.register_role('planner', true)$$, 'rollenregister/AC-16: planner krijgt beheer');
select is(
  pg_temp.scalar_as('app_authenticated', 'r-pl', 'mfa', $$select app.is_mfa_admin()$$),
  'true',
  'rollenregister/AC-16: planner met beheer en een mfa-sessie is is_mfa_admin'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-pl', 'password', $$select app.is_mfa_admin()$$),
  'false',
  'rollenregister/AC-16: planner met beheer maar zonder mfa is geen is_mfa_admin'
);
select lives_ok($$select app.register_role('planner', false)$$, 'rollenregister/AC-16: planner verliest beheer weer');

-- ===== rollenregister/AC-3: eigenaar met password =====
select is(
  pg_temp.scalar_as('app_authenticated', 'r-eig', 'password', $$select app.is_mfa_admin()$$),
  'false',
  'rollenregister/AC-3: eigenaar met een password-sessie: app.is_mfa_admin() is false'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-eig', 'mfa', $$select app.is_mfa_admin()$$),
  'true',
  'rollenregister/AC-3: eigenaar met een mfa-sessie: app.is_mfa_admin() is true'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-dea', 'mfa', $$select app.is_mfa_admin()$$),
  'true',
  'rollenregister/AC-3: toezicht (beheer) met een mfa-sessie: app.is_mfa_admin() is true'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-adm', 'password', $$select app.is_mfa_admin()$$),
  'false',
  'rollenregister/AC-3: admin met een password-sessie: app.is_mfa_admin() is false'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', 'r-eig', 'password', $$select app.assign_role('r-usr', 'user')$$), 5),
  '42501',
  'rollenregister/AC-3: eigenaar met een password-sessie: app.assign_role geeft 42501'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-eig', 'password', $$select count(*) from app.accounts$$),
  '0',
  'rollenregister/AC-3: eigenaar met een password-sessie ziet niets in app.accounts'
);

-- ===== rollenregister/AC-4: eigenaar met mfa =====
select is(
  pg_temp.attempt_as('app_authenticated', 'r-eig', 'mfa', $$select app.assign_role('r-usr', 'user')$$),
  '00000',
  'rollenregister/AC-4: eigenaar met mfa: app.assign_role slaagt'
);
select is(
  pg_temp.attempt_as('app_authenticated', 'r-eig', 'mfa', $$select app.set_account_blocked('r-tgt', true)$$),
  '00000',
  'rollenregister/AC-4: eigenaar met mfa: app.set_account_blocked slaagt'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-eig', 'mfa', $$select count(*) from app.audit_log where action = 'core.account.block' and target_id = 'r-tgt' and actor_id = 'r-eig'$$),
  '1',
  'rollenregister/AC-4: eigenaar met mfa leest app.audit_log: de blokkade staat erin met hem als actor'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-eig', 'mfa', $$select count(*) > 0 from app.accounts$$),
  'true',
  'rollenregister/AC-4: eigenaar met mfa leest app.accounts'
);
select is(
  pg_temp.attempt_as('app_authenticated', 'r-eig', 'mfa', $$select app.set_account_blocked('r-tgt', false)$$),
  '00000',
  'voorbereiding: r-tgt weer gedeblokkeerd'
);

-- ===== rollenregister/AC-5: planner met mfa =====
select is(
  left(pg_temp.attempt_as('app_authenticated', 'r-pl', 'mfa', $$select app.assign_role('r-usr', 'user')$$), 5),
  '42501',
  'rollenregister/AC-5: planner met mfa: app.assign_role geeft 42501'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', 'r-pl', 'mfa', $$select app.set_account_blocked('r-tgt', true)$$), 5),
  '42501',
  'rollenregister/AC-5: planner met mfa: app.set_account_blocked geeft 42501'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', 'r-pl', 'mfa', $$select app.set_account_deactivated('r-tgt', true)$$), 5),
  '42501',
  'rollenregister/AC-5: planner met mfa: app.set_account_deactivated geeft 42501'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-pl', 'mfa', $$select count(*) from app.accounts$$),
  '0',
  'rollenregister/AC-5: planner met mfa ziet niets in app.accounts'
);
select is(
  pg_temp.scalar_as('app_authenticated', 'r-pl', 'mfa', $$select count(*) from app.audit_log$$),
  '0',
  'rollenregister/AC-5: planner met mfa ziet niets in app.audit_log'
);
select is(
  pg_temp.scalar($$select blocked_at is null and deactivated_at is null from better_auth."user" where id = 'r-tgt'$$),
  'true',
  'rollenregister/AC-5: de geweigerde functies hebben r-tgt niet aangeraakt'
);

-- ===== rollenregister/AC-9: planner naast telbare beheerders =====
select lives_ok(
  $$select app.register_role('planner', false)$$,
  'rollenregister/AC-9: register_role(planner, false) slaagt ook naast telbare beheerders'
);
select lives_ok(
  $$select app.register_role('extra', false)$$,
  'rollenregister/AC-9: een nieuwe rol zonder beheer registreren slaagt naast telbare beheerders'
);
select lives_ok($$select app.unregister_role('extra')$$, 'rollenregister/AC-9: en zonder dragers weer weghalen');

-- ===== rollenregister/AC-11: wie mag het register wijzigen, en de CHECK =====
select is(
  left(pg_temp.attempt_as('app_authenticated', 'r-adm', 'mfa', $$select app.register_role('probe', false)$$), 5),
  '42501',
  'rollenregister/AC-11: register_role als app_authenticated (admin met MFA) geeft 42501'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', 'r-adm', 'mfa', $$select app.unregister_role('planner')$$), 5),
  '42501',
  'rollenregister/AC-11: unregister_role als app_authenticated (admin met MFA) geeft 42501'
);
select is(
  left(pg_temp.attempt_as('app_authenticated', 'r-usr', 'password', $$select app.register_role('probe', false)$$), 5),
  '42501',
  'rollenregister/AC-11: register_role als app_authenticated (user) geeft 42501'
);
select is(
  left(pg_temp.attempt($$select app.register_role('user', true)$$), 5),
  '22023',
  'rollenregister/AC-11: register_role(user, ...) geeft 22023'
);
select is(
  left(pg_temp.attempt($$select app.register_role('admin', false)$$), 5),
  '22023',
  'rollenregister/AC-11: register_role(admin, ...) geeft 22023'
);
select is(
  left(pg_temp.attempt($$select app.unregister_role('user')$$), 5),
  '22023',
  'rollenregister/AC-11: unregister_role(user) geeft 22023'
);
select is(
  left(pg_temp.attempt($$select app.unregister_role('admin')$$), 5),
  '22023',
  'rollenregister/AC-11: unregister_role(admin) geeft 22023'
);
select is(
  left(pg_temp.attempt($$select app.register_role('Baas', false)$$), 5),
  '23514',
  'rollenregister/AC-11: een naam met een hoofdletter (Baas) valt op de CHECK (23514)'
);
select is(
  left(pg_temp.attempt($$select app.register_role(repeat('a', 33), false)$$), 5),
  '23514',
  'rollenregister/AC-11: een naam van 33 tekens valt op de CHECK (23514)'
);
select lives_ok(
  $$select app.register_role(repeat('a', 32), false)$$,
  'rollenregister/AC-11: een naam van precies 32 tekens mag'
);
select lives_ok($$select app.unregister_role(repeat('a', 32))$$, 'voorbereiding: de rol van 32 tekens weer weg');
select is(
  left(pg_temp.attempt($$select app.register_role('1baas', false)$$), 5),
  '23514',
  'rollenregister/AC-11: een naam die met een cijfer begint valt op de CHECK (23514)'
);
select is(
  left(pg_temp.attempt($$update app.roles set beheer = false where name = 'admin'$$), 5),
  '23514',
  'rollenregister/AC-11: app_migrator kan admin niet zonder beheer maken (CHECK)'
);
select is(
  left(pg_temp.attempt($$update app.roles set beheer = true where name = 'user'$$), 5),
  '23514',
  'rollenregister/AC-11: app_migrator kan user niet beheer geven (CHECK)'
);
select is(
  pg_temp.scalar($$with d as (delete from app.roles where name = 'admin' returning 1) select count(*) from d$$),
  '0',
  'rollenregister/AC-11: een delete van admin door app_migrator raakt 0 rijen'
);
select results_eq(
  $$select name, beheer from app.roles where name in ('user', 'admin') order by name$$,
  $$values ('admin', true), ('user', false)$$,
  'rollenregister/AC-11: de basisrollen zijn na al deze pogingen ongewijzigd'
);

-- ===== rollenregister/AC-12: de FK =====
select is(
  left(pg_temp.attempt($$select app.assign_role('r-usr', 'baas')$$), 5),
  '23503',
  'rollenregister/AC-12: assign_role met een rol die niet in app.roles staat geeft 23503'
);
select is(
  left(pg_temp.attempt($$select app.unregister_role('planner')$$), 5),
  '23503',
  'rollenregister/AC-12: unregister_role van een rol met dragers (r-pl) geeft 23503'
);
select results_eq(
  $$select ur.role from public.user_roles ur where ur.user_id = 'r-pl'$$,
  $$values ('planner')$$,
  'rollenregister/AC-12: de drager van de rol is na de geweigerde unregister_role ongemoeid'
);

-- ===== rollenregister/AC-17: assert_roles_registered =====
select is(
  pg_temp.attempt($$select app.assert_roles_registered()$$),
  '00000',
  'rollenregister/AC-17: zonder rij met een onbekende rol slaagt app.assert_roles_registered()'
);
select like(
  pg_temp.assert_with_unregistered_row(),
  'P0001|registreer eerst rol baas%',
  'rollenregister/AC-17: met de FK weg en een rij met rol baas geeft assert_roles_registered P0001 registreer eerst rol baas'
);
select results_eq(
  $$select count(*)::integer from pg_catalog.pg_constraint where conname = 'user_roles_role_fkey' and conrelid = 'public.user_roles'::regclass$$,
  $$values (1)$$,
  'rollenregister/AC-17: de testtransactie heeft de FK en de rij met rol baas weer teruggedraaid'
);
select is(
  pg_temp.scalar($$select count(*) from public.user_roles where role = 'baas'$$),
  '0',
  'rollenregister/AC-17: er staat geen rij met rol baas meer in user_roles'
);

select * from finish();
rollback;
