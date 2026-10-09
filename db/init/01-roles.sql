-- Alleen lokaal: draait één keer bij de eerste start van een lege container.
-- Demo-wachtwoorden; per omgeving maakt het runbook deze rollen met echte geheimen.
create role app_authenticated nologin noinherit;
create role api_user login noinherit password 'api_user' in role app_authenticated;
create role auth_service login password 'auth_service';
create schema app;
create schema auth authorization auth_service;

-- Nieuwe objecten krijgen standaard geen rechten voor anderen.
revoke all on schema public from public;
alter default privileges revoke all on tables from public;
alter default privileges revoke all on functions from public;
alter default privileges revoke all on sequences from public;

create extension if not exists pgtap;
