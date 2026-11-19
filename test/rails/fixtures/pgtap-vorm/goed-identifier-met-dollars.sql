begin;
set search_path = tap, public;
-- `a$$b` is een identifier met dollars en opent geen dollar-quote; het blok daarna sluit met zijn eigen `$$`.
select a$$b;
do $$
begin
  null;
set local role app_authenticated;
end
$$;
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-identifier-met-dollars: eerste');
select * from finish();
rollback;
