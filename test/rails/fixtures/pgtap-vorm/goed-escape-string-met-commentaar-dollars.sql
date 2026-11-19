begin;
set search_path = tap, public;
-- E'…' kent \': de string loopt door tot de laatste ', dus `-- $$` is commentaar en opent geen blok.
select E'it\'s'; -- $$
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-escape-string-met-commentaar-dollars: eerste');
select * from finish();
rollback;
