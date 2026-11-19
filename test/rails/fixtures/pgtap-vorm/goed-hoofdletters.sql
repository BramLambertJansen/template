BEGIN;
SET   search_path=tap,public;
SELECT  plan( 2 );
SET LOCAL ROLE app_authenticated;
SELECT ok(true, 'goed-hoofdletters: eerste');
SELECT ok(true, 'goed-hoofdletters: tweede');
SELECT * FROM finish();
ROLLBACK;
