import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  TEMPLATE_URL_FIXTURE,
  draai,
  git,
  leesResultaat,
  maakFixture,
  ruimOp,
  schrijvendeGhAanroepen,
  type Fixture,
} from './nieuwe-app-kit.ts';

// Tests voor `koppel` van scripts/kit/nieuwe-app.mjs (spec nieuwe-app-script, AC-3, AC-4 en het koppel-deel van AC-5), geschreven
// vóór de bouw. De nep-template is een lokale repo; de fixture-repo verwijst met `url.<pad>.insteadOf` van de https-URL naar
// die map, zodat `git fetch` zonder netwerk werkt en de remote-URL in de config de https-URL blijft.
afterEach(ruimOp);

const ouders = (fx: Fixture, rev = 'HEAD'): string[] =>
  git(fx.repo, 'rev-list', '--parents', '-n', '1', rev).split(' ').slice(1);
const onderwerp = (fx: Fixture): string => git(fx.repo, 'log', '-1', '--format=%s');

function toestand(fx: Fixture): Record<string, string> {
  return {
    head: git(fx.repo, 'rev-parse', 'HEAD'),
    remotes: git(fx.repo, 'remote', '-v'),
    refs: git(fx.repo, 'for-each-ref', 'refs/remotes'),
    status: git(fx.repo, 'status', '--porcelain'),
  };
}

function commitBestand(fx: Fixture, naam: string, bericht: string): void {
  writeFileSync(path.join(fx.repo, naam), `${bericht}\n`);
  git(fx.repo, 'add', '-A');
  git(fx.repo, 'commit', '-q', '-m', bericht);
}

describe('nieuwe-app-script/AC-3: koppel op een verse fixture', () => {
  test('nieuwe-app-script/AC-3 koppel maakt een merge met twee ouders, een lege diff en push-URL DISABLED', () => {
    const fx = maakFixture();
    const vooraf = git(fx.repo, 'rev-parse', 'HEAD');
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(0);
    expect(ouders(fx)).toHaveLength(2);
    expect(ouders(fx)[0]).toBe(vooraf);
    expect(git(fx.repo, 'diff', 'HEAD~1', '--stat'), 'de merge verandert de inhoud niet').toBe('');
    expect(git(fx.repo, 'config', '--get', 'remote.template.pushurl')).toBe('DISABLED');
    expect(git(fx.repo, 'config', '--get', 'remote.template.url')).toBe(TEMPLATE_URL_FIXTURE);
    expect(ouders(fx)[1]).toBe(git(fx.template, 'rev-parse', 'HEAD'));
    expect(onderwerp(fx)).toBe(`chore: link to template (${git(fx.repo, 'rev-parse', '--short', 'template/main')})`);
  });

  test('nieuwe-app-script/AC-3 het resultaat noemt de merge-commit als head en de volledige template-sha en tree-ID', () => {
    const fx = maakFixture();
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(0);
    const resultaat = leesResultaat(fx.repo, 'koppel');
    expect(resultaat.head).toBe(git(fx.repo, 'rev-parse', 'HEAD'));
    expect(resultaat.uitslag).toBe('ok');
    const waarden = Object.values(resultaat.gegevens ?? {}).map(String);
    expect(waarden, 'gegevens bevat de volledige template-sha').toContain(git(fx.template, 'rev-parse', 'HEAD'));
    expect(waarden, 'gegevens bevat de tree-ID').toContain(git(fx.template, 'rev-parse', 'HEAD^{tree}'));
    expect(r.stdout).toMatch(/^nieuwe-app koppel: ok \(\d+ stappen\) → \.template\/nieuwe-app-koppel\.json$/m);
  });

  test('nieuwe-app-script/AC-3 een tweede run is overgeslagen met exitcode 0 en laat HEAD staan', () => {
    const fx = maakFixture();
    draai(fx, ['koppel']);
    const vooraf = git(fx.repo, 'rev-parse', 'HEAD');
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(0);
    expect(r.stdout).toContain('· al gekoppeld aan template/main (overgeslagen)');
    expect(git(fx.repo, 'rev-parse', 'HEAD')).toBe(vooraf);
  });

  test('nieuwe-app-script/AC-3 ook na een extra hernoem-commit boven de merge is een tweede run overgeslagen', () => {
    const fx = maakFixture();
    draai(fx, ['koppel']);
    commitBestand(fx, 'hernoemd.txt', 'chore: rename to mijn-app');
    const vooraf = git(fx.repo, 'rev-parse', 'HEAD');
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(0);
    expect(r.stdout).toContain('· al gekoppeld aan template/main (overgeslagen)');
    expect(git(fx.repo, 'rev-parse', 'HEAD')).toBe(vooraf);
  });

  test('nieuwe-app-script/AC-3 een bestaande remote template met de juiste URL en push-URL DISABLED zonder merge koppelt met 0', () => {
    const fx = maakFixture();
    git(fx.repo, 'remote', 'add', 'template', TEMPLATE_URL_FIXTURE);
    git(fx.repo, 'remote', 'set-url', '--push', 'template', 'DISABLED');
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(0);
    expect(ouders(fx)).toHaveLength(2);
    expect(git(fx.repo, 'diff', 'HEAD~1', '--stat')).toBe('');
  });

  test('nieuwe-app-script/AC-3 een remote template met een andere URL geeft exitcode 1 en laat HEAD ongewijzigd', () => {
    const fx = maakFixture();
    const andere = 'https://github.com/iemand/anders.git';
    git(fx.repo, 'remote', 'add', 'template', andere);
    git(fx.repo, 'remote', 'set-url', '--push', 'template', 'DISABLED');
    const vooraf = git(fx.repo, 'rev-parse', 'HEAD');
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain(`✗ remote template wijst naar ${andere}, verwacht ${TEMPLATE_URL_FIXTURE}`);
    expect(r.stdout).toContain('→ stop en leg het de eigenaar voor (docs/nieuwe-app.md, 5.1)');
    expect(git(fx.repo, 'rev-parse', 'HEAD')).toBe(vooraf);
  });
});

describe('nieuwe-app-script/AC-4: koppel weigert een afwijkende of vuile fixture', () => {
  test('nieuwe-app-script/AC-4 een tree die afwijkt van template/main geeft exitcode 1 en laat HEAD ongewijzigd', () => {
    const fx = maakFixture({ extra: { 'extra.txt': 'meer dan de template\n' } });
    const vooraf = git(fx.repo, 'rev-parse', 'HEAD');
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain('✗ tree van HEAD wijkt af van template/main; niet gekoppeld');
    expect(r.stdout).toContain('→ stop en leg de eigenaar een herstelkeuze voor (docs/nieuwe-app.md, 5.1)');
    expect(git(fx.repo, 'rev-parse', 'HEAD')).toBe(vooraf);
    expect(ouders(fx)).toHaveLength(0);
    expect(leesResultaat(fx.repo, 'koppel').uitslag).toBe('fout');
  });

  test.each([
    { soort: 'een ongetrackt bestand', bestand: 'vuil.txt' },
    { soort: 'een gewijzigd getrackt bestand', bestand: 'README.md' },
  ])('nieuwe-app-script/AC-4 een vuile werkmap ($soort) geeft exitcode 1 en laat HEAD ongewijzigd', ({ bestand }) => {
    const fx = maakFixture();
    writeFileSync(path.join(fx.repo, bestand), 'anders\n');
    const vooraf = git(fx.repo, 'rev-parse', 'HEAD');
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain('✗ werkmap niet schoon');
    expect(r.stdout).toContain('→ commit of herstel eerst; koppel draait alleen op een verse kopie');
    expect(git(fx.repo, 'rev-parse', 'HEAD')).toBe(vooraf);
  });

  test('nieuwe-app-script/AC-4 met twee eigen commits geeft koppel exitcode 1 en laat HEAD ongewijzigd', () => {
    const fx = maakFixture();
    commitBestand(fx, 'een.txt', 'feat: eigen werk');
    const vooraf = git(fx.repo, 'rev-parse', 'HEAD');
    const r = draai(fx, ['koppel']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain('✗');
    expect(git(fx.repo, 'rev-parse', 'HEAD')).toBe(vooraf);
    expect(ouders(fx)).toHaveLength(1);
  });

  test('nieuwe-app-script/AC-4 een fout schrijft herstel en uitslag fout in het resultaatbestand', () => {
    const fx = maakFixture();
    writeFileSync(path.join(fx.repo, 'vuil.txt'), 'x\n');
    const r = draai(fx, ['koppel']);
    const resultaat = leesResultaat(fx.repo, 'koppel');
    expect(r.status).toBe(1);
    expect(resultaat.uitslag).toBe('fout');
    expect(resultaat.stappen.some((s) => s.status === 'fout' && s.herstel !== null)).toBe(true);
  });
});

describe('nieuwe-app-script/AC-5: koppel --dry-run wijzigt niets', () => {
  test('nieuwe-app-script/AC-5 koppel --dry-run laat HEAD, remotes, refs/remotes en werkmap gelijk en roept gh niet schrijvend aan', () => {
    const fx = maakFixture();
    const vooraf = toestand(fx);
    const r = draai(fx, ['koppel', '--dry-run']);
    expect(r.status, r.uit).toBe(0);
    expect(toestand(fx)).toStrictEqual(vooraf);
    expect(schrijvendeGhAanroepen(fx)).toStrictEqual([]);
    expect(r.stdout).toMatch(/^\(dry-run\) /m);
    const resultaat = leesResultaat(fx.repo, 'koppel');
    expect(resultaat.dryRun).toBe(true);
    expect(resultaat.head, 'head blijft de bestaande HEAD').toBe(vooraf['head']);
  });

  test('nieuwe-app-script/AC-5 koppel --dry-run meldt ook een afwijkende tree met exitcode 1, zonder iets te wijzigen', () => {
    const fx = maakFixture({ extra: { 'extra.txt': 'meer\n' } });
    const vooraf = toestand(fx);
    const r = draai(fx, ['koppel', '--dry-run']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain('✗ tree van HEAD wijkt af van template/main; niet gekoppeld');
    expect(toestand(fx)).toStrictEqual(vooraf);
  });
});
