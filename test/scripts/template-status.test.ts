// Tests voor scripts/kit/template-status.mjs (spec docs/template/specs/template-release.md, AC-4, AC-6, AC-7, AC-8 en AC-9),
// geschreven vóór de bouw. Geen netwerk, geen docker: een fixture-template met releasecommits en geannoteerde tags
// `template-v<versie>`, en een fixture-app (een kloon daarvan) met een lokale remote `template` waarvan de URL naar iets
// onbereikbaars wijst. Het script draait met een git-schim op PATH dat fetch, pull, push, clone en ls-remote weigert en vastlegt.
//
// De interface die de developer bouwt:
//
//   CLI: `node scripts/kit/template-status.mjs`, met de huidige map als hoofdmap van de repo; draait alleen als het script zelf
//     wordt aangeroepen. Alleen-lezen: geen fetch, geen schrijfactie in werkmap of `.git`. De uitvoer staat letterlijk in de
//     spec ("Hergebruik en UX"); de test leest stdout en stderr samen, de keuze van de stroom is aan de developer.
//     Herkenning: `onderhoudVan` uit rails/hooks/lib/padtabel.mjs op `.claude/gates.json` (geen `onderhoud`: een app).
//     App: `TEMPLATE_VERSION` uit de werkmap, releases met `releasesUit` uit `refs/remotes/template/main:docs/template-changelog.md`,
//       lokale tags `refs/tags/template-v*` (een tag mag geannoteerd zijn; `v*`-tags telt het script niet).
//     Template: `TEMPLATE_VERSION`, de lokale tag, de fragmenten in `docs/template-changelog.d/` (zonder README.md).
//     Exit 0 als het iets kan melden, 1 bij een onleesbare template-ref of gates.json of een ongeldige vorm van `onderhoud`.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence.ts';
import {
  FRAGMENTEN,
  ONREIKBAAR,
  STATUS_SCRIPT,
  TEMPLATE_RELEASES,
  bouwApp,
  bouwTemplate,
  draai,
  git,
  maakSchim,
  onderhoudMelding,
  ruimOp,
  schrijf,
  tijdelijkeMap,
  toestand,
} from './template-release-kit';
import type { AppOpzet, Uitkomst } from './template-release-kit';

afterEach(ruimOp);

// --- opzet --------------------------------------------------------------------------------------------------------------

interface Wereld {
  app: string;
  shas: Record<string, string>;
}

interface WereldOpzet extends AppOpzet {
  /** De releases tot en met deze versie bestaan in de template. */
  totEnMet: string;
  /** Na deze release komt een templatecommit zonder release (`shas.fix`). */
  fixNa?: string;
  /** De app is gebouwd op die templatecommit in plaats van op de release van `versie`. */
  opFix?: boolean;
}

/** Een template met releases tot en met `totEnMet` en een app daarvan (zie `bouwApp`). */
function wereld({ totEnMet, fixNa, opFix, ...appOpzet }: WereldOpzet): Wereld {
  const basis = tijdelijkeMap('template-status');
  const template = `${basis}/template`;
  mkdirSync(template);
  const shas = bouwTemplate(template, fixNa === undefined ? { totEnMet } : { totEnMet, fixNa });
  const bouwBasis = opFix === true ? shas['fix'] : undefined;
  const app = bouwApp({
    template,
    shas,
    root: `${basis}/app`,
    ...appOpzet,
    ...(bouwBasis === undefined ? {} : { basis: bouwBasis }),
  });
  return { app, shas };
}

/**
 * Draait `template:status` in `root` met het git-schim. Controleert in elk geval (AC-8) dat het script geen netwerkcommando
 * probeerde en niets schreef in de werkmap of in `.git`; refs en `git status --porcelain` zijn na afloop gelijk aan ervoor.
 */
function status(root: string): Uitkomst {
  const schim = maakSchim();
  const voor = toestand(root);
  const uit = draai(STATUS_SCRIPT, [], { cwd: root, env: schim.env });
  expect(toestand(root), 'template:status schreef in de werkmap of in .git').toStrictEqual(voor);
  expect(schim.netwerkPogingen(), 'template:status riep een netwerkcommando aan').toStrictEqual([]);
  return uit;
}

const regels = (uit: Uitkomst): string[] => uit.uit.trimEnd().split('\n');
const zonderLegeRegels = (tekst: string[]): string[] => tekst.filter((regel) => regel.trim() !== '');
/** Zonder lege regels: of er een lege regel staat tussen de blokken en de waarschuwingen, laat de spec open. */
const zonderLeeg = (uit: Uitkomst): string[] => zonderLegeRegels(regels(uit));

const datum = (versie: string): string => TEMPLATE_RELEASES.find((release) => release.versie === versie)?.datum ?? '';

const AC4 = [
  'Templateversie van deze app: 0.3.0',
  `Nieuwste release: 0.3.0 (template-v0.3.0, ${datum('0.3.0')})`,
  'Bijgewerkt: geen openstaande releases.',
];
const AC6 = [
  'Templateversie van deze app: 0.2.0',
  `Nieuwste release: 0.4.0 (template-v0.4.0, ${datum('0.4.0')})`,
  'Openstaande releases: 0.3.0, 0.4.0',
  '',
  'Bij een update naar 0.3.0:',
  '- Voer NOTITIE-0.3.0 uit.',
  'Bij een update naar 0.4.0: geen notities.',
];
const tagOntbreekt = (versie: string): string =>
  `Let op: release ${versie} staat in de wijzigingenlijst van template/main, maar de tag template-v${versie} ontbreekt lokaal; haal de tags op (stap 1 van "Een template-update binnenhalen") of wacht op de tag van de eigenaar.`;
const commitsNaTag = (versie: string): string =>
  `Let op: deze app bevat templatecommits na template-v${versie} die in geen release zitten; hun notities staan nog niet in een release.`;

describe('template-release/AC-8: de fixture-app lijkt op een echte app', () => {
  test('template-release/AC-8: refs/remotes/template/main, geannoteerde tags, een onbereikbare remote en de templatecommit in HEAD', () => {
    const { app, shas } = wereld({ versie: '0.3.0', totEnMet: '0.3.0', fixNa: '0.3.0', opFix: true });

    expect(git(app, 'rev-parse', 'refs/remotes/template/main')).toBe(shas['fix']);
    expect(git(app, 'cat-file', '-t', 'refs/tags/template-v0.3.0')).toBe('tag');
    expect(git(app, 'rev-parse', 'template-v0.3.0^{commit}')).toBe(shas['0.3.0']);
    expect(git(app, 'remote', 'get-url', 'template')).toBe(ONREIKBAAR);
    expect(git(app, 'merge-base', '--is-ancestor', shas['fix'] ?? '', 'HEAD')).toBe('');
    expect(git(app, 'status', '--porcelain')).toBe('');
    expect(git(app, 'show', 'refs/remotes/template/main:docs/template-changelog.md')).toContain('## [0.3.0] - ');
    expect(git(app, 'show', 'HEAD:.claude/gates.json')).not.toContain('onderhoud');
  });
});

describe("template-release/AC-8: het git-schim weigert netwerkcommando's en geeft de rest door", () => {
  test('template-release/AC-8: git fetch en ls-remote geven exit 97 en staan in het logboek, git rev-parse werkt gewoon', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0' });
    const schim = maakSchim();
    const draaiGit = (...args: string[]) => spawnSync('git', args, { cwd: app, env: schim.env, encoding: 'utf8' });

    expect(draaiGit('rev-parse', 'HEAD').status).toBe(0);
    expect(draaiGit('fetch', '--no-tags', 'template', 'main').status).toBe(97);
    expect(draaiGit('ls-remote', 'template').status).toBe(97);
    expect(schim.netwerkPogingen()).toStrictEqual(['fetch', 'ls-remote']);
  });
});

// --- AC-4: een bijgewerkte app ---------------------------------------------------------------------------------------------

describe('template-release/AC-4: een app die bij is meldt precies drie regels', () => {
  test('template-release/AC-4: versie, nieuwste release en "Bijgewerkt", exit 0, geen waarschuwing', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0' });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(regels(uit)).toStrictEqual(AC4);
  });

  test('template-release/AC-4: lokale v*-tags op de release veranderen niets', () => {
    const { app, shas } = wereld({ versie: '0.3.0', totEnMet: '0.3.0' });
    git(app, 'tag', 'v0.1.0', shas['0.1.0'] ?? 'HEAD');
    git(app, 'tag', 'v0.3.0', shas['0.3.0'] ?? 'HEAD');

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(regels(uit)).toStrictEqual(AC4);
  });
});

// --- AC-6: achterstand met notities ----------------------------------------------------------------------------------------

describe('template-release/AC-6: openstaande releases en hun notities', () => {
  test('template-release/AC-6: 0.3.0 met een notitie en 0.4.0 zonder, exit 0, de notitie van 0.2.0 ontbreekt', () => {
    const { app } = wereld({ versie: '0.2.0', totEnMet: '0.4.0' });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(regels(uit)).toStrictEqual(AC6);
    expect(uit.uit).not.toContain('OUDE-NOTITIE');
  });

  test('template-release/AC-6: de uitvoer komt uit template/main, niet uit de wijzigingenlijst in de werkmap van de app', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.4.0' });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(zonderLeeg(uit)).toStrictEqual([
      'Templateversie van deze app: 0.3.0',
      `Nieuwste release: 0.4.0 (template-v0.4.0, ${datum('0.4.0')})`,
      'Openstaande releases: 0.4.0',
      'Bij een update naar 0.4.0: geen notities.',
    ]);
  });

  test('template-release/AC-6: een app op 0.1.0 meldt 0.2.0, 0.3.0 en 0.4.0 op oplopende versie met de notitie van 0.2.0', () => {
    const { app } = wereld({ versie: '0.1.0', totEnMet: '0.4.0' });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(zonderLeeg(uit).slice(2)).toStrictEqual([
      'Openstaande releases: 0.2.0, 0.3.0, 0.4.0',
      'Bij een update naar 0.2.0:',
      '- OUDE-NOTITIE van 0.2.0.',
      'Bij een update naar 0.3.0:',
      '- Voer NOTITIE-0.3.0 uit.',
      'Bij een update naar 0.4.0: geen notities.',
    ]);
  });
});

// --- AC-7: waarschuwingen --------------------------------------------------------------------------------------------------

describe('template-release/AC-7: waarschuwingen blijven exit 0', () => {
  test('template-release/AC-7: de tag van de nieuwste release ontbreekt lokaal: de uitvoer van AC-6 plus de waarschuwing', () => {
    const { app } = wereld({ versie: '0.2.0', totEnMet: '0.4.0', tags: ['0.1.0', '0.2.0', '0.3.0'] });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(zonderLeeg(uit)).toStrictEqual([...zonderLegeRegels(AC6), tagOntbreekt('0.4.0')]);
  });

  test('template-release/AC-7: een lokale v*-tag op die release telt niet als de template-v-tag', () => {
    const { app, shas } = wereld({ versie: '0.2.0', totEnMet: '0.4.0', tags: ['0.1.0', '0.2.0', '0.3.0'] });
    git(app, 'tag', 'v0.4.0', shas['0.4.0'] ?? 'HEAD');

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(zonderLeeg(uit)).toStrictEqual([...zonderLegeRegels(AC6), tagOntbreekt('0.4.0')]);
  });

  test('template-release/AC-7: templatecommits na template-v0.3.0 die in geen release zitten geven de waarschuwing', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0', fixNa: '0.3.0', opFix: true });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(zonderLeeg(uit)).toStrictEqual([...AC4, commitsNaTag('0.3.0')]);
  });

  test("template-release/AC-7: zonder zo'n commit in de app (de template heeft er wel een) ontbreekt de waarschuwing", () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0', fixNa: '0.3.0' });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(zonderLeeg(uit)).toStrictEqual(AC4);
  });

  test('template-release/AC-7: de tag van de eigen versie ontbreekt: alleen die waarschuwing, niet die over templatecommits', () => {
    const { app } = wereld({
      versie: '0.3.0',
      totEnMet: '0.3.0',
      fixNa: '0.3.0',
      opFix: true,
      tags: ['0.1.0', '0.2.0'],
    });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(zonderLeeg(uit)).toStrictEqual([...AC4, tagOntbreekt('0.3.0')]);
  });

  test('template-release/AC-7: lokale v*-tags op templatecommits veranderen de waarschuwing over templatecommits niet', () => {
    const { app, shas } = wereld({ versie: '0.3.0', totEnMet: '0.3.0', fixNa: '0.3.0', opFix: true });
    git(app, 'tag', 'v0.1.0', shas['fix'] ?? 'HEAD');
    git(app, 'tag', 'v0.3.0', shas['0.3.0'] ?? 'HEAD');

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(0);
    expect(zonderLeeg(uit)).toStrictEqual([...AC4, commitsNaTag('0.3.0')]);
  });
});

// --- AC-8: dicht falen en alleen-lezen ---------------------------------------------------------------------------------------

describe('template-release/AC-8: een onleesbare template of gates.json is exit 1', () => {
  test('template-release/AC-8: zonder refs/remotes/template/main de foutregel over de template-ref', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0' });
    git(app, 'update-ref', '-d', 'refs/remotes/template/main');

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(1);
    expect(regels(uit)).toContain(
      '✗ template:status: refs/remotes/template/main is niet te lezen; haal de template op met git fetch --no-tags template main',
    );
  });

  test('template-release/AC-8: zonder remote template hetzelfde', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0' });
    git(app, 'remote', 'remove', 'template');

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(1);
    expect(uit.uit).toContain('✗ template:status: refs/remotes/template/main is niet te lezen');
  });

  test('template-release/AC-8: met "onderhoud": "kapot" de foutregel met de melding van onderhoudVan', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0' });
    schrijf(app, {
      '.claude/gates.json': JSON.stringify({ onderhoud: 'kapot', template: { repository: 'acme/sjabloon' } }),
    });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(1);
    expect(regels(uit)).toContain(`✗ template:status: ${onderhoudMelding('kapot')}`);
  });

  test('template-release/AC-8: een gates.json die geen JSON is geeft exit 1 met de foutregel', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0' });
    schrijf(app, { '.claude/gates.json': '{ dit is geen json' });

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(1);
    expect(uit.uit).toMatch(/^✗ template:status: \S+/m);
  });

  test('template-release/AC-8: ook zonder .claude/gates.json is het exit 1, niet stil een app', () => {
    const { app } = wereld({ versie: '0.3.0', totEnMet: '0.3.0' });
    git(app, 'rm', '-q', '.claude/gates.json');

    const uit = status(app);

    expect(uit.status, uit.uit).toBe(1);
    expect(uit.uit).toContain('✗ template:status:');
  });
});

describe('template-release/AC-8: alleen-lezen, ook als de remote template onbereikbaar is', () => {
  test('template-release/AC-8: na AC-4, AC-6, AC-7 en een fout zijn refs, status, werkmap en .git gelijk en is niets opgehaald', () => {
    const bijgewerkt = wereld({ versie: '0.3.0', totEnMet: '0.3.0' }).app;
    const achter = wereld({ versie: '0.2.0', totEnMet: '0.4.0' }).app;
    const zonderTag = wereld({ versie: '0.2.0', totEnMet: '0.4.0', tags: ['0.1.0', '0.2.0', '0.3.0'] }).app;
    const zonderRef = wereld({ versie: '0.3.0', totEnMet: '0.3.0' }).app;
    git(zonderRef, 'update-ref', '-d', 'refs/remotes/template/main');
    const apps = [bijgewerkt, achter, zonderTag, zonderRef];

    const statussen = apps.map((app) => {
      expect(git(app, 'remote', 'get-url', 'template')).toBe(ONREIKBAAR);
      return status(app).status;
    });

    expect(statussen).toStrictEqual([0, 0, 0, 1]);
  });
});

// --- AC-9: in de template ----------------------------------------------------------------------------------------------------

function fragment(soort: string, metNotitie: boolean): string {
  const update = metNotitie ? '\n### Bij een update\n\n- Doe iets.\n' : '';
  return `---\nsoort: ${soort}\n---\n\n- Wijziging.\n${update}`;
}

/** Een template op 0.3.0 (tag aanwezig) met een README en de gegeven fragmenten in `docs/template-changelog.d/`. */
function templateRepo(fragmenten: Record<string, string>): string {
  const basis = tijdelijkeMap('template-status-template');
  const root = `${basis}/template`;
  mkdirSync(root);
  bouwTemplate(root, { totEnMet: '0.3.0' });
  schrijf(root, {
    [`${FRAGMENTEN}/README.md`]: '# Fragmenten\n',
    ...Object.fromEntries(Object.entries(fragmenten).map(([naam, tekst]) => [`${FRAGMENTEN}/${naam}`, tekst])),
  });
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'fragmenten');
  return root;
}

const TWEE = { 'een.md': fragment('toegevoegd', true), 'twee.md': fragment('opgelost', false) };
const TOOLCHAIN = 'Toolchain: pnpm check:toolchain (wekelijks in de workflow toolchain)';

describe('toolchain-bewaking/AC-11: template:status verwijst naar de toolchaincheck', () => {
  test('toolchain-bewaking/AC-11: in de template de verwijsregel als laatste regel, exit 0, zonder iets op te halen', () => {
    const root = templateRepo(TWEE);

    const uit = status(root);

    expect(uit.status, uit.uit).toBe(0);
    expect(regels(uit).at(-1)).toBe(TOOLCHAIN);
    expectAbsent(readFileSync(STATUS_SCRIPT, 'utf8'), /\bfetch\(|https?:\/\/|check-toolchain/, {
      recognizes: ['fetch(url)', 'https://nodejs.org', "import './check-toolchain.mjs'"],
      allows: ['pnpm check:toolchain'],
    });
  });
});

describe('template-release/AC-9: template:status in de template', () => {
  test('template-release/AC-9: versie, tag aanwezig en twee fragmenten waarvan één met een notitie, exit 0', () => {
    const root = templateRepo(TWEE);
    expect(git(root, 'for-each-ref', 'refs/remotes')).toBe('');

    const uit = status(root);

    expect(uit.status, uit.uit).toBe(0);
    expect(regels(uit)).toStrictEqual([
      'Templateversie: 0.3.0',
      'Tag: template-v0.3.0 (lokaal aanwezig)',
      'Wachtend op een release: 2 fragmenten, waarvan 1 met "Bij een update".',
      // GEWIJZIGD (spec toolchain-bewaking AC-11): de verwijsregel naar de toolchaincheck volgt in de template.
      TOOLCHAIN,
    ]);
  });

  test('template-release/AC-9: een ontbrekende tag, ook met een v*-tag op de release, geeft de eigenaarsmelding', () => {
    const root = templateRepo(TWEE);
    git(root, 'tag', '-d', 'template-v0.3.0');
    git(root, 'tag', 'v0.3.0');

    const uit = status(root);

    expect(uit.status, uit.uit).toBe(0);
    expect(regels(uit)).toStrictEqual([
      'Templateversie: 0.3.0',
      'Tag: template-v0.3.0 ontbreekt lokaal; de eigenaar tagt de squash-commit van de release-PR op main.',
      'Wachtend op een release: 2 fragmenten, waarvan 1 met "Bij een update".',
      // GEWIJZIGD (spec toolchain-bewaking AC-11): de verwijsregel naar de toolchaincheck volgt in de template.
      TOOLCHAIN,
    ]);
  });

  test('template-release/AC-9: de tellingen volgen de fragmenten: drie fragmenten waarvan twee met een notitie', () => {
    const root = templateRepo({ ...TWEE, 'drie.md': fragment('gewijzigd', true) });

    const uit = status(root);

    expect(uit.status, uit.uit).toBe(0);
    expect(regels(uit)).toContain('Wachtend op een release: 3 fragmenten, waarvan 2 met "Bij een update".');
  });
});
