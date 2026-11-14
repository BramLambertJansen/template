-- migrate:up
-- Rollen als register van de app (spec rollenregister, ST-16): app.roles is de lijst van rollen met de vlag `beheer`. De
-- basisrollen user en admin staan er altijd in; een app voegt rollen toe met app.register_role (in een eigen migratie) en
-- in src/shared/roles.ts. De MFA-eis (app.is_mfa_admin) en de laatste-beheerder-regel hangen aan `beheer`, niet meer aan de
-- naam admin. Expand en contract samen: de vorige codeversie schrijft alleen user en admin. Geen persoonsgegevens.

-- Naamgrens 32 is ROLE_NAME_MAX_LENGTH (src/core/shared/limits.ts); test/auth/role-name-limit.test.ts houdt ze gelijk.
create table app.roles (
  name text primary key check (name ~ '^[a-z][a-z0-9_]*$' and length(name) <= 32),
  beheer boolean not null,
  check ((name <> 'admin' or beheer) and (name <> 'user' or not beheer))
);

-- De basisrijen en de rij in de bewaarcatalogus vóór RLS aan gaat (R-DB-17).
insert into app.roles (name, beheer) values ('user', false), ('admin', true);
alter table app.retention no force row level security;
insert into app.retention values
  ('app.roles', null, null, 'app', 'register van rollen, geen persoonsgegevens');
alter table app.retention force row level security;

alter table app.roles enable row level security;
alter table app.roles force row level security;

grant select on app.roles to app_authenticated;
grant select, insert, update, delete on app.roles to app_definer;

-- Lezen mag elke actor (namen en een vlag, geen geheim). Schrijven alleen via de security definer-functies hieronder
-- (framework §6: FORCE RLS geldt ook voor app_definer). Alleen de delete-policy sluit de basisrollen uit; bij update bewaakt
-- de CHECK ze. app_migrator erft deze rechten via app_definer.
create policy roles_select_authenticated on app.roles
  for select to app_authenticated using (true);
create policy roles_definer_select on app.roles
  for select to app_definer using (true);
create policy roles_definer_insert on app.roles
  for insert to app_definer with check (true);
create policy roles_definer_update on app.roles
  for update to app_definer using (true) with check (true);
create policy roles_definer_delete on app.roles
  for delete to app_definer using (name not in ('user', 'admin'));

-- Is er een telbare beheerder: een beheerrol, een account met wachtwoord (geen uitgenodigde), niet geblokkeerd en niet
-- gedeactiveerd. Aanroepen altijd ná de lock public.user_roles:last_admin. Volatile: elke aanroep leest wat er dan staat.
create function app.has_counted_beheer() returns boolean
  language sql volatile security definer set search_path = ''
  as $$
    select exists (
      select 1
      from public.user_roles r
      join app.roles ro on ro.name = r.role
      join better_auth."user" u on u.id = r.user_id
      where ro.beheer
        and u.blocked_at is null
        and u.deactivated_at is null
        and exists (
          select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
        )
    )
  $$;

alter function app.has_counted_beheer() owner to app_definer;
revoke all on function app.has_counted_beheer() from public;

-- Faalt als public.user_roles een rol bevat die niet in app.roles staat (een app met een eigen CHECK): die app registreert
-- haar rollen eerst, in een migratie vóór deze.
create function app.assert_roles_registered() returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  declare
    v_role text;
  begin
    select r.role into v_role
      from public.user_roles r
      where not exists (select 1 from app.roles ro where ro.name = r.role)
      order by r.role
      limit 1;
    if found then
      raise exception 'registreer eerst rol %', v_role using errcode = 'P0001';
    end if;
  end
  $$;

alter function app.assert_roles_registered() owner to app_definer;
revoke all on function app.assert_roles_registered() from public;

-- Een beheerrol verliest `beheer` of verdwijnt: eerst de lock, daarna beide condities. Heeft de rol telbare dragers en is
-- er daarna geen telbare beheerder meer, dan LAST_ADMIN. Zonder dragers (ook een lege database) mag het altijd.
create function app.roles_keep_one_beheer() returns trigger
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    if old.beheer and (tg_op = 'DELETE' or not new.beheer) then
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
      if exists (
        select 1
        from public.user_roles r
        join better_auth."user" u on u.id = r.user_id
        where r.role = old.name
          and u.blocked_at is null
          and u.deactivated_at is null
          and exists (
            select 1 from better_auth.account a where a."userId" = u.id and a."providerId" = 'credential'
          )
      ) and not app.has_counted_beheer() then
        raise exception 'LAST_ADMIN' using errcode = 'P0001', detail = 'De laatste beheerder kan niet weg.';
      end if;
    end if;
    return null;
  end
  $$;

alter function app.roles_keep_one_beheer() owner to app_definer;
revoke all on function app.roles_keep_one_beheer() from public;

create trigger roles_keep_one_beheer
  after update or delete on app.roles
  for each row execute function app.roles_keep_one_beheer();

-- Een rol toevoegen of haar vlag wijzigen (upsert). Alleen app_migrator (migraties): geen grants. De basisrollen liggen
-- vast (22023); een ongeldige naam valt op de CHECK (23514). Geen auditregel (OV-4).
create function app.register_role(p_name text, p_beheer boolean) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    if p_name is null or p_beheer is null or p_name in ('user', 'admin') then
      raise exception 'ongeldige rol' using errcode = '22023';
    end if;
    insert into app.roles (name, beheer) values (p_name, p_beheer)
      on conflict (name) do update set beheer = excluded.beheer;
  end
  $$;

alter function app.register_role(text, boolean) owner to app_definer;
revoke all on function app.register_role(text, boolean) from public;

-- Een rol weghalen. Met dragers weigert de foreign key (23503); een basisrol is 22023; een onbekende rol is geen fout.
create function app.unregister_role(p_name text) returns void
  language plpgsql volatile security definer set search_path = ''
  as $$
  begin
    if p_name is null or p_name in ('user', 'admin') then
      raise exception 'ongeldige rol' using errcode = '22023';
    end if;
    delete from app.roles where name = p_name;
  end
  $$;

alter function app.unregister_role(text) owner to app_definer;
revoke all on function app.unregister_role(text) from public;

-- Bestaande rijen blijven staan: eerst controleren, dan de foreign key in plaats van de vaste lijst.
select app.assert_roles_registered();
alter table public.user_roles
  add constraint user_roles_role_fkey foreign key (role) references app.roles (name) on delete restrict;
alter table public.user_roles drop constraint if exists user_roles_role_check;

-- Beheerder met MFA: elke beheerrol uit app.roles (OV-3: de naam blijft).
create or replace function app.is_mfa_admin() returns boolean
  language sql stable security definer set search_path = ''
  as $$
    select app.session_strength() = 'mfa'
       and exists (
         select 1
         from public.user_roles r
         join app.roles ro on ro.name = r.role
         where r.user_id = app.current_user_id() and ro.beheer
       )
  $$;

-- Laatste beheerder op public.user_roles: `old` beheer en (delete of `new` niet beheer) en geen telbare beheerder meer.
-- Van de ene beheerrol naar de andere mag. De lock altijd eerst, ook als de regel niet geldt (volgorde met app.roles).
create or replace function app.user_roles_keep_one_admin() returns trigger
  language plpgsql security definer set search_path = ''
  as $$
  begin
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    if exists (select 1 from app.roles ro where ro.name = old.role and ro.beheer)
       and (tg_op = 'DELETE' or not exists (select 1 from app.roles ro where ro.name = new.role and ro.beheer))
       and not app.has_counted_beheer() then
      raise exception 'LAST_ADMIN' using errcode = 'P0001', detail = 'De laatste beheerder kan niet weg.';
    end if;
    return null;
  end
  $$;

-- Blokkeren en deactiveren: ongewijzigd, behalve dat de laatste-beheerder-regel app.has_counted_beheer() gebruikt (na de lock).
create or replace function app.set_account_blocked(p_user_id text, p_blocked boolean) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_blocked_at timestamptz;
  begin
    if not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    select u.blocked_at into v_blocked_at from better_auth."user" u where u.id = p_user_id;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if not p_blocked then
      if v_blocked_at is not null then
        update better_auth."user" set blocked_at = null where id = p_user_id;
        insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
          values (app.current_user_id(), 'core.account.unblock', 'account', p_user_id, app.request_id(), '{}'::jsonb);
      end if;
      return;
    end if;
    if p_user_id = app.current_user_id() then
      raise exception 'OWN_ACCOUNT';
    end if;
    if not exists (
      select 1 from better_auth.account a where a."userId" = p_user_id and a."providerId" = 'credential'
    ) then
      raise exception 'ACCOUNT_INVITED';
    end if;
    if v_blocked_at is not null then
      return;
    end if;
    update better_auth."user"
      set blocked_at = pg_catalog.now(), session_version = session_version + 1
      where id = p_user_id;
    if not app.has_counted_beheer() then
      raise exception 'LAST_ADMIN' using detail = 'De laatste beheerder kan niet weg.';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), 'core.account.block', 'account', p_user_id, app.request_id(), '{}'::jsonb);
  end
  $$;

create or replace function app.set_account_deactivated(p_user_id text, p_deactivated boolean) returns void
  language plpgsql security definer set search_path = ''
  as $$
  declare
    v_deactivated_at timestamptz;
  begin
    if not app.is_mfa_admin() then
      raise exception 'FORBIDDEN' using errcode = '42501';
    end if;
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('public.user_roles:last_admin'));
    select u.deactivated_at into v_deactivated_at from better_auth."user" u where u.id = p_user_id;
    if not found then
      raise exception 'NOT_FOUND';
    end if;
    if not exists (
      select 1 from better_auth.account a where a."userId" = p_user_id and a."providerId" = 'credential'
    ) then
      raise exception 'ACCOUNT_INVITED';
    end if;
    if not p_deactivated then
      if v_deactivated_at is not null then
        update better_auth."user" set deactivated_at = null where id = p_user_id;
        insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
          values (app.current_user_id(), 'core.account.activate', 'account', p_user_id, app.request_id(), '{}'::jsonb);
      end if;
      return;
    end if;
    if p_user_id = app.current_user_id() then
      raise exception 'OWN_ACCOUNT';
    end if;
    if v_deactivated_at is not null then
      return;
    end if;
    update better_auth."user"
      set deactivated_at = pg_catalog.now(), session_version = session_version + 1
      where id = p_user_id;
    if not app.has_counted_beheer() then
      raise exception 'LAST_ADMIN' using detail = 'De laatste beheerder kan niet weg.';
    end if;
    insert into app.audit_log (actor_id, action, target_type, target_id, request_id, details)
      values (app.current_user_id(), 'core.account.deactivate', 'account', p_user_id, app.request_id(), '{}'::jsonb);
  end
  $$;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
