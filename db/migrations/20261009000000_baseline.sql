-- migrate:up
-- Basis van elke app. Draait als app_migrator (eigenaar van alles wat hier ontstaat).

-- Geen standaardrechten voor PUBLIC op wat app_migrator maakt.
alter default privileges for role app_migrator revoke execute on functions from public;
alter default privileges for role app_migrator revoke usage on types from public;

create schema app;
create schema auth;
grant usage on schema app to app_authenticated;
grant usage on schema auth to auth_service;

-- PG15+: public is niet meer schrijfbaar; app_authenticated krijgt alleen gebruik.
revoke all on schema public from public;
grant usage on schema public to app_authenticated;

-- Better Auth leest en schrijft alleen rijen in zijn eigen schema; nooit DDL.
alter default privileges for role app_migrator in schema auth
  grant select, insert, update, delete on tables to auth_service;
alter default privileges for role app_migrator in schema auth
  grant usage, select on sequences to auth_service;

-- Gezet door withUser() met set_config(…, true). nullif: na eerder lokaal gebruik op
-- dezelfde verbinding geeft current_setting een lege string in plaats van NULL.
create function app.current_user_id() returns text
  language sql stable
  return nullif(pg_catalog.current_setting('app.user_id', true), '');

create function app.session_strength() returns text
  language sql stable
  return coalesce(nullif(pg_catalog.current_setting('app.session_strength', true), ''), 'none');

grant execute on function app.current_user_id() to app_authenticated;
grant execute on function app.session_strength() to app_authenticated;

-- migrate:down
-- Append-only: geen down-migraties (docs/framework.md §10).
