begin;
set search_path = tap, public;
-- Genest blokcommentaar over meerdere regels: het eerste `*/` sluit alleen het binnenste blok, de rol staat nog in het buitenste.
/* a /* b */
set local role app_authenticated;
*/
select plan(1);
set local role app_authenticated;
select ok(true, 'goed-blok-genest-meerregelig: eerste');
select * from finish();
rollback;
