// Tests voor scripts/kit/template-release.mjs (spec docs/template/specs/template-release.md, AC-2 en AC-3, plus `releasesUit`
// met de meldingen van release-versie/AC-1), geschreven vóór de bouw. Geen netwerk, geen docker: fixture-templates in een
// tijdelijke map; het script draait via spawnSync met de fixture als werkmap.
//
// De interface die de developer bouwt:
//
//   export function releasesUit(changelog: string): { versie: string; datum: string; notities: string[] }[]
//     de releases onder `## [Unreleased]` op volgorde van de lijst (nieuwste eerst); `notities` zijn de lijstitems onder
//     `### Bij een update` van die release. Een notitie is de tekst van het item zonder `- `, een ingesprongen vervolgregel hoort
//     bij hetzelfde item (de test normaliseert witruimte en toetst alleen de tekst). Gooit met de meldingen van `latestRelease`
//     in test/scripts/template-version.test.ts: "de eerste kop is niet …", "geen releasekop …", "releasekop zonder de vorm …".
//   CLI: `node scripts/kit/template-release.mjs <x.y.z> [--datum JJJJ-MM-DD]`, met de huidige map als hoofdmap van de template
//     (zoals check-docs-drift.mjs `root = '.'` gebruikt). Exit 0 bij succes; anders exit 1, een regel `✗ template:release: <reden>`
//     op stdout of stderr, en geen enkel bestand gewijzigd. Draait zijn CLI alleen als het script zelf wordt aangeroepen.
import { readdirSync } from 'node:fs';
import { afterEach, describe, expect, test } from 'vitest';
import {
  CHANGELOG,
  FRAGMENTEN,
  GATES_APP,
  GATES_TEMPLATE,
  RELEASE_SCRIPT,
  UNRELEASED_ZIN,
  VERSIE_BESTAND,
  changelogTekst,
  draai,
  git,
  importeer,
  laadModule,
  lees,
  mapInhoud,
  onderhoudMelding,
  ruimOp,
  schrijf,
  tijdelijkeMap,
  versieTekst,
} from './template-release-kit';

interface Notitie {
  versie: string;
  datum: string;
  notities: string[];
}
interface ReleaseModule {
  releasesUit: (changelog: string) => Notitie[];
}
const MIST = 'scripts/kit/template-release.mjs bestaat niet: de developer bouwt het (spec template-release)';
const { releasesUit } = await laadModule<ReleaseModule>(RELEASE_SCRIPT, {
  releasesUit: () => expect.fail(MIST),
});

afterEach(ruimOp);

const schoon = (tekst: string): string => tekst.replace(/^-\s+/, '').replace(/\s+/g, ' ').trim();

// --- releasesUit ---------------------------------------------------------------------------------------------------------

describe('release-versie/AC-1 via releasesUit: de meldingen bij een ongeldige lijst', () => {
  test.each([
    ['een releasekop zonder datum', '# Lijst\n\n## [Unreleased]\n\n## [0.1.0]\n', /releasekop zonder de vorm/],
    [
      'een oudere releasekop zonder datum',
      '# Lijst\n\n## [Unreleased]\n\n## [0.2.0] - 2026-12-01\n\n## [0.1.0]\n',
      /releasekop zonder de vorm/,
    ],
    ['geen "## [Unreleased]"', '# Lijst\n\n## [0.1.0] - 2026-11-15\n', /eerste kop is niet/],
    [
      '"## [Unreleased]" niet als eerste kop',
      '# Lijst\n\n## [0.1.0] - 2026-11-15\n\n## [Unreleased]\n',
      /eerste kop is niet/,
    ],
    ['alleen "## [Unreleased]"', '# Lijst\n\n## [Unreleased]\n', /geen releasekop/],
  ])('release-versie/AC-1: %s gooit', (_geval, changelog, melding) => {
    expect(() => releasesUit(changelog)).toThrow(melding);
  });
});

describe('template-release/AC-2: releasesUit leest releases en notities', () => {
  test('template-release/AC-2: releases op volgorde van de lijst met versie, datum en alleen de notities onder "Bij een update"', () => {
    const lijst = releasesUit(
      changelogTekst([
        { versie: '0.3.0', datum: '2026-11-25', notities: ['Eerste notitie.', 'Tweede notitie.'] },
        { versie: '0.2.0', datum: '2026-11-18', notities: [] },
        { versie: '0.1.0', datum: '2026-11-15', notities: ['Oude notitie.'] },
      ]),
    );

    expect(lijst.map(({ versie, datum }) => ({ versie, datum }))).toStrictEqual([
      { versie: '0.3.0', datum: '2026-11-25' },
      { versie: '0.2.0', datum: '2026-11-18' },
      { versie: '0.1.0', datum: '2026-11-15' },
    ]);
    expect(lijst.map(({ notities }) => notities.map(schoon))).toStrictEqual([
      ['Eerste notitie.', 'Tweede notitie.'],
      [],
      ['Oude notitie.'],
    ]);
  });

  test('template-release/AC-2: een "Bij een update" midden in een lijstitem en tekst onder [Unreleased] zijn geen notitie', () => {
    const changelog = [
      '# Lijst',
      '',
      '## [Unreleased]',
      '',
      '### Bij een update',
      '',
      '- Hoort bij niets.',
      '',
      '## [0.2.0] - 2026-11-18',
      '',
      '### Toegevoegd',
      '',
      '- Iets. Bij een update: doe dit niet als notitie.',
      '',
    ].join('\n');

    expect(releasesUit(changelog).map(({ versie, notities }) => ({ versie, notities }))).toStrictEqual([
      { versie: '0.2.0', notities: [] },
    ]);
  });

  test('template-release/AC-2: een notitie die over twee regels loopt blijft één notitie', () => {
    const changelog = [
      '# Lijst',
      '',
      '## [Unreleased]',
      '',
      '## [0.2.0] - 2026-11-18',
      '',
      '### Bij een update',
      '',
      '- Eerste deel van de notitie',
      '  en het tweede deel.',
      '- Een tweede notitie.',
      '',
    ].join('\n');

    const [release] = releasesUit(changelog);
    expect(release?.notities.map(schoon)).toStrictEqual([
      'Eerste deel van de notitie en het tweede deel.',
      'Een tweede notitie.',
    ]);
  });
});

// --- AC-2: een release samenstellen -----------------------------------------------------------------------------------------

const ORIGINEEL = changelogTekst([
  { versie: '0.2.0', datum: '2026-11-18', notities: ['Oude notitie.'] },
  { versie: '0.1.0', datum: '2026-11-15', notities: [] },
]);

const fragment = (soort: string, items: string[], notities: string[] = []): string =>
  [
    '---',
    `soort: ${soort}`,
    '---',
    '',
    ...items.map((item) => `- ${item}`),
    ...(notities.length === 0 ? [] : ['', '### Bij een update', '', ...notities.map((n) => `- ${n}`)]),
    '',
  ].join('\n');

const FRAGMENT_A = fragment('opgelost', ['Fix A.'], ['Voer A uit.']);
const FRAGMENT_B = fragment('toegevoegd', ['Nieuw B.']);
const FRAGMENT_C = fragment('toegevoegd', ['Nieuw C.']);
const README = '# Fragmenten\n\nLegt de vorm uit en is zelf geen fragment.\n';

interface Opzet {
  versie?: string;
  fragmenten?: Record<string, string>;
  gates?: string;
  changelog?: string;
  metGit?: boolean;
}

function template({ versie = '0.2.0', fragmenten, gates = GATES_TEMPLATE, changelog = ORIGINEEL, metGit }: Opzet = {}) {
  const root = tijdelijkeMap('template-release');
  const bestanden = Object.fromEntries(
    Object.entries(fragmenten ?? { 'a.md': FRAGMENT_A, 'b.md': FRAGMENT_B, 'c.md': FRAGMENT_C }).map(
      ([naam, tekst]) => [`${FRAGMENTEN}/${naam}`, tekst],
    ),
  );
  schrijf(root, {
    '.claude/gates.json': gates,
    [CHANGELOG]: changelog,
    [VERSIE_BESTAND]: versieTekst(versie),
    [`${FRAGMENTEN}/README.md`]: README,
    ...bestanden,
  });
  if (metGit === true) {
    git(root, 'init', '-q', '-b', 'main');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '-m', 'begin');
  }
  return root;
}

const vandaag = (): string[] => {
  const nu = new Date();
  const lokaal = `${String(nu.getFullYear())}-${String(nu.getMonth() + 1).padStart(2, '0')}-${String(nu.getDate()).padStart(2, '0')}`;
  return [nu.toISOString().slice(0, 10), lokaal];
};

/** De regels van de nieuwe sectie tussen het [Unreleased]-blok en de oude releases, zonder lege regels. */
function nieuweSectie(origineel: string, nieuw: string): string[] {
  const grens = origineel.indexOf('## [0.2.0]');
  const voor = origineel.slice(0, grens);
  const na = origineel.slice(grens);
  expect(nieuw.slice(0, voor.length), 'het [Unreleased]-blok is gewijzigd').toBe(voor);
  expect(nieuw.slice(nieuw.length - na.length), 'oudere releases zijn gewijzigd').toBe(na);
  return nieuw
    .slice(voor.length, nieuw.length - na.length)
    .split('\n')
    .filter((regel) => regel.trim() !== '');
}

describe('template-release/AC-2: pnpm template:release voegt de fragmenten samen', () => {
  test('template-release/AC-2: drie fragmenten worden één releasesectie onder [Unreleased], zonder lege subkoppen', () => {
    const root = template();

    const uit = draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });

    expect(uit.status, uit.uit).toBe(0);
    expect(nieuweSectie(ORIGINEEL, lees(root, CHANGELOG))).toStrictEqual([
      '## [0.3.0] - 2026-12-01',
      '### Toegevoegd',
      '- Nieuw B.',
      '- Nieuw C.',
      '### Opgelost',
      '- Fix A.',
      '### Bij een update',
      '- Voer A uit.',
    ]);
  });

  test('template-release/AC-2: TEMPLATE_VERSION wordt 0.3.0, de fragmenten zijn weg en README.md blijft', () => {
    const root = template();

    draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });

    expect(lees(root, VERSIE_BESTAND)).toBe(versieTekst('0.3.0'));
    expect(readdirSync(`${root}/${FRAGMENTEN}`)).toStrictEqual(['README.md']);
  });

  test('template-release/AC-2: releasesUit op de nieuwe lijst geeft 0.3.0 met precies de notitie van a als eerste', () => {
    const root = template();

    draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });

    const lijst = releasesUit(lees(root, CHANGELOG));
    expect(lijst.map(({ versie, datum }) => ({ versie, datum }))).toStrictEqual([
      { versie: '0.3.0', datum: '2026-12-01' },
      { versie: '0.2.0', datum: '2026-11-18' },
      { versie: '0.1.0', datum: '2026-11-15' },
    ]);
    expect(lijst[0]?.notities.map(schoon)).toStrictEqual(['Voer A uit.']);
  });

  test('template-release/AC-2: de volgorde van de items volgt de bestandsnaam, ook als de namen anders gerangschikt staan', () => {
    const root = template({
      fragmenten: { 'z-laatste.md': fragment('toegevoegd', ['Z.']), 'a-eerste.md': fragment('toegevoegd', ['A.']) },
    });

    draai(RELEASE_SCRIPT, ['0.2.1', '--datum', '2026-12-01'], { cwd: root });

    expect(nieuweSectie(ORIGINEEL, lees(root, CHANGELOG))).toStrictEqual([
      '## [0.2.1] - 2026-12-01',
      '### Toegevoegd',
      '- A.',
      '- Z.',
    ]);
  });

  test('template-release/AC-2: alle vijf soorten komen in de vaste volgorde, zonder --datum met de datum van vandaag', () => {
    const root = template({
      fragmenten: {
        'a-documentatie.md': fragment('documentatie', ['Doc.']),
        'b-verwijderd.md': fragment('verwijderd', ['Weg.']),
        'c-opgelost.md': fragment('opgelost', ['Los.']),
        'd-gewijzigd.md': fragment('gewijzigd', ['Anders.']),
        'e-toegevoegd.md': fragment('toegevoegd', ['Erbij.']),
      },
    });

    const uit = draai(RELEASE_SCRIPT, ['0.2.1'], { cwd: root });

    expect(uit.status, uit.uit).toBe(0);
    const sectie = nieuweSectie(ORIGINEEL, lees(root, CHANGELOG));
    expect(vandaag().map((datum) => `## [0.2.1] - ${datum}`)).toContain(sectie[0]);
    expect(sectie.slice(1)).toStrictEqual([
      '### Toegevoegd',
      '- Erbij.',
      '### Gewijzigd',
      '- Anders.',
      '### Opgelost',
      '- Los.',
      '### Verwijderd',
      '- Weg.',
      '### Documentatie',
      '- Doc.',
    ]);
  });

  test('template-release/AC-2: het script commit, tagt en pusht niet; het wijzigt alleen de lijst, de versie en de fragmenten', () => {
    const root = template({ metGit: true });
    const commitsVoor = git(root, 'rev-list', '--all', '--count');

    const uit = draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });

    expect(uit.status, uit.uit).toBe(0);
    expect(git(root, 'rev-list', '--all', '--count')).toBe(commitsVoor);
    expect(git(root, 'tag')).toBe('');
    // `git()` trimt de uitvoer, dus de eerste porcelain-regel verliest zijn voorloopspatie: vergelijk per regel getrimd.
    const status = git(root, 'status', '--porcelain')
      .split('\n')
      .map((regel) => regel.trim())
      .toSorted();
    expect(status).toStrictEqual([
      `D ${FRAGMENTEN}/a.md`,
      `D ${FRAGMENTEN}/b.md`,
      `D ${FRAGMENTEN}/c.md`,
      `M ${CHANGELOG}`,
      `M ${VERSIE_BESTAND}`,
    ]);
  });

  test('template-release/AC-2: het [Unreleased]-blok blijft de zin zonder lijstitem', () => {
    const root = template();

    draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });

    expect(lees(root, CHANGELOG)).toContain(`## [Unreleased]\n\n${UNRELEASED_ZIN}\n\n## [0.3.0] - 2026-12-01`);
  });

  test('template-release/AC-2: alleen een patchverhoging zonder notitie is toegestaan', () => {
    const root = template({ fragmenten: { 'b.md': FRAGMENT_B } });

    const uit = draai(RELEASE_SCRIPT, ['0.2.1', '--datum', '2026-12-01'], { cwd: root });

    expect(uit.status, uit.uit).toBe(0);
    expect(lees(root, VERSIE_BESTAND)).toBe(versieTekst('0.2.1'));
  });

  test('template-release/AC-2: importeren van het script doet niets, ook niet met fragmenten in de werkmap', () => {
    const root = template();
    const voor = mapInhoud(root);

    const uit = importeer(RELEASE_SCRIPT, root);

    expect(uit.status, uit.uit).toBe(0);
    expect(mapInhoud(root)).toStrictEqual(voor);
  });
});

// --- AC-3: weigeren zonder iets te wijzigen --------------------------------------------------------------------------------

const KAPOT = JSON.stringify({ onderhoud: 'kapot', template: { repository: 'acme/sjabloon' } });
const ALLEEN_NOTITIE = { 'a.md': FRAGMENT_A };

interface Geval {
  naam: string;
  versie: string;
  opzet: Opzet;
  /** Tekst die in de melding moet staan, of een patroon. */
  melding: RegExp | string;
}

describe('template-release/AC-3: weigeren met exit 1 en geen enkel bestand gewijzigd', () => {
  test.each<Geval>([
    { naam: 'geen semver', versie: 'abc', opzet: {}, melding: /versie/i },
    { naam: 'een versie met maar twee delen', versie: '0.3', opzet: {}, melding: /versie/i },
    { naam: 'een versie met een voorvoegsel', versie: 'v0.3.0', opzet: {}, melding: /versie/i },
    { naam: 'een versie gelijk aan TEMPLATE_VERSION', versie: '0.2.0', opzet: {}, melding: /versie/i },
    { naam: 'een lagere versie', versie: '0.1.9', opzet: {}, melding: /versie/i },
    {
      naam: 'alleen het patchnummer verhoogd bij een fragment met "Bij een update"',
      versie: '0.2.1',
      opzet: { fragmenten: ALLEEN_NOTITIE },
      melding: /Bij een update/,
    },
    { naam: 'geen fragmenten', versie: '0.3.0', opzet: { fragmenten: {} }, melding: /fragment/i },
    {
      naam: 'een fragment met een onbekende soort',
      versie: '0.3.0',
      opzet: { fragmenten: { 'kapot.md': '---\nsoort: nieuw\n---\n\n- Iets.\n' } },
      melding: 'kapot.md',
    },
    {
      naam: 'een fragment zonder lijstitem',
      versie: '0.3.0',
      opzet: { fragmenten: { 'leeg.md': '---\nsoort: opgelost\n---\n\nTekst.\n' } },
      melding: 'leeg.md',
    },
    {
      naam: 'een fragment zonder front matter',
      versie: '0.3.0',
      opzet: { fragmenten: { 'kaal.md': '- Iets.\n' } },
      melding: 'kaal.md',
    },
    {
      naam: 'uitvoering in een app (geen onderhoud)',
      versie: '0.3.0',
      opzet: { gates: GATES_APP },
      melding: /template|onderhoud/i,
    },
    {
      naam: 'een onderhoud met ongeldige vorm',
      versie: '0.3.0',
      opzet: { gates: KAPOT },
      melding: onderhoudMelding('kapot'),
    },
  ])('template-release/AC-3: $naam', ({ versie, opzet, melding }) => {
    const root = template(opzet);
    const voor = mapInhoud(root);

    const uit = draai(RELEASE_SCRIPT, [versie, '--datum', '2026-12-01'], { cwd: root });

    expect(uit.status, uit.uit).toBe(1);
    expect(uit.uit).toContain('✗ template:release:');
    if (typeof melding === 'string') expect(uit.uit).toContain(melding);
    else expect(uit.uit).toMatch(melding);
    expect(mapInhoud(root)).toStrictEqual(voor);
  });

  test('template-release/AC-3: een fragment met alleen een README in de map telt als geen fragmenten', () => {
    const root = template({ fragmenten: {} });
    expect(readdirSync(`${root}/${FRAGMENTEN}`)).toStrictEqual(['README.md']);

    const uit = draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });

    expect(uit.status, uit.uit).toBe(1);
  });
});

// --- schaduwmodus/AC-10: een gevuld register weigert de release (ADR 0106 punt 8) -------------------------------------------

const SCHADUW_REGEL = {
  naam: 'proef',
  soort: 'hook',
  spec: 'docs/template/specs/x.md',
  rids: ['R-WEB-01'],
  start: '2026-11-20',
  eind: '2026-12-01',
  drempel: { hard: 'a', aanpassen: 'b', verwijderen: 'c' },
  aangepast: 0,
};

describe('schaduwmodus/AC-10: template:release weigert een gevuld schaduwregister', () => {
  test('schaduwmodus/AC-10: met een controle in .kit/schaduw.json weigert hij zonder iets te wijzigen; met [] loopt de release door', () => {
    const root = template();
    schrijf(root, {
      '.kit/schaduw.json': `${JSON.stringify([SCHADUW_REGEL, { ...SCHADUW_REGEL, naam: 'tweede' }])}\n`,
    });
    const voor = mapInhoud(root);

    const geweigerd = draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });

    expect(geweigerd.uit).toContain(
      '✗ template:release: .kit/schaduw.json bevat 2 controle(s) (proef, tweede); een app krijgt geen controle in schaduw, neem eerst het besluit (ADR 0106 punt 8)',
    );
    expect(geweigerd.status, geweigerd.uit).toBe(1);
    expect(mapInhoud(root)).toStrictEqual(voor);
    expect(lees(root, CHANGELOG)).toBe(ORIGINEEL);
    expect(lees(root, VERSIE_BESTAND)).toBe(versieTekst('0.2.0'));

    schrijf(root, { '.kit/schaduw.json': '[]\n' });
    const door = draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });
    expect(door.status, door.uit).toBe(0);
    expect(lees(root, VERSIE_BESTAND)).toBe(versieTekst('0.3.0'));
  });
});

// --- schaduwmodus/AC-18: een register dat geen JSON-lijst is weigert de release (B-9) --------------------------------------

describe('schaduwmodus/AC-18: template:release weigert een register dat geen JSON-lijst is', () => {
  test.each([
    ['een object', '{}\n'],
    ['ongeldige JSON', '{'],
  ])('schaduwmodus/AC-18: met %s in .kit/schaduw.json weigert hij en blijft alles ongewijzigd', (_naam, inhoud) => {
    const root = template();
    schrijf(root, { '.kit/schaduw.json': inhoud });
    const voor = mapInhoud(root);

    const geweigerd = draai(RELEASE_SCRIPT, ['0.3.0', '--datum', '2026-12-01'], { cwd: root });

    expect(geweigerd.uit).toContain(
      '✗ template:release: .kit/schaduw.json is geen JSON-lijst; herstel het register vóór de release (ADR 0106 punt 8)',
    );
    expect(geweigerd.status, geweigerd.uit).toBe(1);
    expect(mapInhoud(root)).toStrictEqual(voor);
    expect(lees(root, CHANGELOG)).toBe(ORIGINEEL);
    expect(lees(root, VERSIE_BESTAND)).toBe(versieTekst('0.2.0'));
  });
});
