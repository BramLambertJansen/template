import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

// check:roadmap (spec docs/specs/roadmap-vinkjes.md): bewijst dat een nieuw of gewijzigd `[x]` in docs/roadmap.md zonder bewijs en een
// spec die naar `gebouwd` gaat zonder bewijs worden gemeld, dat bestaande vinkjes met rust worden gelaten, en dat de CLI de juiste
// exitcode en uitvoer geeft. De fixtures staan als data in test/rails/fixtures/roadmap/<geval>/{basis,head}/ (geen *.test.* of
// *.spec.*-namen: die matchen op `testpaden`).
//
// Importvorm: het script bestaat nog niet. Een statische `import { roadmapMeldingen } from '…check-roadmap.mjs'` laat het hele
// bestand en `tsc` op de import falen. Daarom laadt `roep()` de module pas in de test, met een niet-letterlijk pad, en valideert
// het resultaat met type-guards (geen casts). Ontbreekt de module of een export, dan faalt elke test met een duidelijke melding.
const REPO = path.resolve(import.meta.dirname, '../..');
const FIXTURES = path.join(import.meta.dirname, 'fixtures/roadmap');
const ROADMAP_MODULE = ['../../scripts/kit', 'check-roadmap.mjs'].join('/');
const DOCS_MODULE = ['../../scripts/kit', 'check-docs.mjs'].join('/');
const SCRIPT = path.join(REPO, 'scripts/kit/check-roadmap.mjs');

interface Melding {
  key: string;
  message: string;
}

async function exportVan(module: string, naam: string): Promise<unknown> {
  const geladen: unknown = await import(/* @vite-ignore */ module);
  if (typeof geladen !== 'object' || geladen === null) throw new Error(`${module} levert geen module`);
  if (!(naam in geladen)) throw new Error(`${module} exporteert ${naam} niet`);
  const waarde: unknown = Reflect.get(geladen, naam);
  return waarde;
}

async function roep(module: string, naam: string, ...args: unknown[]): Promise<unknown> {
  const functie = await exportVan(module, naam);
  if (typeof functie !== 'function') throw new Error(`${module} exporteert ${naam} niet als functie`);
  const resultaat: unknown = await Reflect.apply(functie, undefined, args);
  return resultaat;
}

function alsMelding(item: unknown): Melding {
  if (
    typeof item === 'object' &&
    item !== null &&
    'key' in item &&
    typeof item.key === 'string' &&
    'message' in item &&
    typeof item.message === 'string'
  )
    return { key: item.key, message: item.message };
  throw new Error('geen { key, message }');
}

function alsMeldingen(resultaat: unknown): Melding[] {
  if (!Array.isArray(resultaat)) throw new Error('geen lijst van meldingen');
  const lijst: unknown[] = resultaat;
  return lijst.map(alsMelding);
}

// --- fixtures inlezen als `basis` en `head` voor roadmapMeldingen ---------------------------------------------------------

function leesMap(dir: string): { lees: (pad: string) => string | null; bestanden: string[] } {
  const bestanden = existsSync(dir)
    ? readdirSync(dir, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .sort()
    : [];
  return {
    bestanden,
    lees: (pad) => (bestanden.includes(pad) ? readFileSync(path.join(dir, pad), 'utf8') : null),
  };
}

function leesHernoemd(geval: string): Record<string, string> {
  const bestand = path.join(FIXTURES, geval, 'hernoemd.json');
  if (!existsSync(bestand)) return {};
  const json: unknown = JSON.parse(readFileSync(bestand, 'utf8'));
  if (typeof json !== 'object' || json === null) throw new Error('hernoemd.json is geen object');
  return Object.fromEntries(Object.entries(json).map(([nieuw, oud]) => [nieuw, String(oud)]));
}

function leesTestpaden(): string[] {
  const json: unknown = JSON.parse(readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8'));
  if (typeof json !== 'object' || json === null || !('testpaden' in json))
    throw new Error('gates.json zonder testpaden');
  const testpaden: unknown = json.testpaden;
  if (!Array.isArray(testpaden)) throw new Error('testpaden is geen lijst');
  const lijst: unknown[] = testpaden;
  return lijst.map(String);
}

// Zoals de aanroeper in het script: `packageScripts` in een try/catch; ontbreekt of is kapot, dan is `scripts` leeg.
function scriptsVan(tekst: string | null): Record<string, string> {
  if (tekst === null) return {};
  try {
    const pkg: unknown = JSON.parse(tekst);
    if (typeof pkg !== 'object' || pkg === null || !('scripts' in pkg)) return {};
    const scripts: unknown = pkg.scripts;
    if (typeof scripts !== 'object' || scripts === null) return {};
    return Object.fromEntries(Object.entries(scripts).map(([naam, opdracht]) => [naam, String(opdracht)]));
  } catch {
    return {};
  }
}

// Een package.json die geen JSON is, kan niet als bestand in git staan: Prettier (format:check) weigert hem te parsen. De test levert
// hem daarom zelf; het bestand bestaat in `head` (git ls-files) en zijn inhoud is ongeldig.
const ONGELDIG_PACKAGE_JSON = 'dit is geen json\n';

function leesHead(geval: string): {
  lees: (pad: string) => string | null;
  bestanden: string[];
  hernoemd: Record<string, string>;
} {
  const head = leesMap(path.join(FIXTURES, geval, 'head'));
  const ongeldig = geval === 'package-json-ongeldig';
  return {
    hernoemd: leesHernoemd(geval),
    bestanden: ongeldig
      ? [...head.bestanden.filter((pad) => pad !== 'package.json'), 'package.json'].sort()
      : head.bestanden,
    lees: (pad) => (ongeldig && pad === 'package.json' ? ONGELDIG_PACKAGE_JSON : head.lees(pad)),
  };
}

async function meldingenVoor(geval: string): Promise<Melding[]> {
  const basis = leesMap(path.join(FIXTURES, geval, 'basis'));
  const head = leesHead(geval);
  const resultaat = await roep(ROADMAP_MODULE, 'roadmapMeldingen', {
    basis,
    head,
    scripts: scriptsVan(head.lees('package.json')),
    testpaden: leesTestpaden(),
  });
  return alsMeldingen(resultaat);
}

// --- bewijsmatrix: één test per rij van het Testplan (de beginregel van het item staat in `head`) -------------------------

const GEEN: string[] = [];
const matrix: [geval: string, ac: string, verwacht: string[]][] = [
  ['schoon', 'roadmap/AC-6', GEEN],
  ['oud-vinkje-zonder-bewijs', 'roadmap/AC-6', GEEN],
  ['alleen-herafgebroken', 'roadmap/AC-6', GEEN],
  ['vinkje-zonder-bewijs', 'roadmap/AC-1', ['roadmap:bewijs:5']],
  ['vinkje-met-pr', 'roadmap/AC-2', GEEN],
  ['vinkje-met-testpad', 'roadmap/AC-2', GEEN],
  ['vinkje-met-testmap', 'roadmap/AC-2', GEEN],
  ['vinkje-met-checknaam', 'roadmap/AC-2', GEEN],
  ['vinkje-testpad-bestaat-niet', 'roadmap/AC-3', ['roadmap:bewijs:5', 'roadmap:pad:5:db/tests/weg.sql']],
  ['testpad-alleen-als-achtervoegsel', 'roadmap/AC-3', ['roadmap:bewijs:5', 'roadmap:pad:5:db/tests/weg.sql']],
  ['vinkje-onbekend-script', 'roadmap/AC-4', ['roadmap:bewijs:5']],
  ['vinkje-geen-check', 'roadmap/AC-4', ['roadmap:bewijs:5']],
  ['vinkje-pad-bestaat-niet', 'roadmap/AC-5', ['roadmap:pad:5:src/api/weg.ts']],
  ['vinkje-glob-url-kale-naam', 'roadmap/AC-5', GEEN],
  ['vinkje-map-met-slash', 'roadmap/AC-5', GEEN],
  ['nieuw-item-afgevinkt', 'roadmap/AC-1', ['roadmap:bewijs:6']],
  ['vinkje-tekst-gewijzigd', 'roadmap/AC-7', ['roadmap:bewijs:5']],
  ['bewijs-op-vervolgregel', 'roadmap/AC-8', GEEN],
  ['bewijs-na-lege-regel', 'roadmap/AC-8', ['roadmap:bewijs:5']],
  ['bewijs-na-kop-in-kolom-0', 'roadmap/AC-8', ['roadmap:bewijs:5']],
  ['st-item', 'roadmap/AC-8 en roadmap/AC-16', GEEN],
  ['anker-is-geen-pr', 'roadmap/AC-1', ['roadmap:bewijs:5']],
  ['anker-genummerde-kop', 'roadmap/AC-17', ['roadmap:bewijs:5']],
  ['vervallen-met-adr', 'roadmap/AC-9', GEEN],
  ['vervallen-adr-bestaat-niet', 'roadmap/AC-9', ['roadmap:bewijs:5']],
  ['vervallen-met-pr', 'roadmap/AC-9', GEEN],
  ['verplaatst', 'randgeval', GEEN],
  ['heropend', 'randgeval', GEEN],
  ['identiek-dubbel', 'randgeval', GEEN],
  ['pr-bestaat-niet', 'randgeval (OV-7: alleen de vorm)', GEEN],
  ['package-json-ongeldig', 'randgeval', ['roadmap:bewijs:5']],
  // GEWIJZIGD (gebouwd-zonder-nummer/AC-1, ADR 0095): de fixture zonder nummer is groen.
  ['spec-gebouwd-zonder-bewijs', 'gebouwd-zonder-nummer/AC-1', GEEN],
  // GEWIJZIGD (gebouwd-zonder-nummer/AC-1, ADR 0095): de melding spec:bewijs bestaat niet meer; deze fixtures zijn groen.
  ['spec-gebouwd-bewijs-in-status', 'gebouwd-zonder-nummer/AC-1', GEEN],
  ['spec-gebouwd-met-vinkje-zonder-verwijzing', 'gebouwd-zonder-nummer/AC-1', GEEN],
  ['spec-gebouwd-met-roadmapvinkje', 'gebouwd-zonder-nummer/AC-1', GEEN],
  ['spec-roadmapverwijzing-roadmap-ongewijzigd', 'roadmap/AC-11', ['spec:roadmap:docs/specs/a.md']],
  [
    'spec-st-verwijzing-roadmap-ongewijzigd',
    'roadmap/AC-11 (ST-<nn>, hoofdletterongevoelig)',
    ['spec:roadmap:docs/specs/a.md'],
  ],
  ['spec-al-gebouwd', 'roadmap/AC-12', GEEN],
  ['spec-nieuw-voorstel', 'roadmap/AC-12', GEEN],
  ['template', 'roadmap/AC-12', GEEN],
  ['spec-vervallen', 'randgeval', GEEN],
  ['spec-gebouwd-hernoemd', 'roadmap/AC-12', GEEN],
  // GEWIJZIGD (gebouwd-zonder-nummer/AC-1, ADR 0095): ook hier geen spec:bewijs meer.
  ['spec-hernoemd-en-gebouwd', 'randgeval', GEEN],
  ['spec-nieuw-gebouwd', 'roadmap/AC-13', GEEN],
];

describe('roadmapMeldingen: bewijsmatrix', () => {
  test.each(matrix)('%s (%s)', async (geval, _ac, verwacht) => {
    expect((await meldingenVoor(geval)).map((melding) => melding.key)).toStrictEqual(verwacht);
  });
});

describe('roadmapMeldingen: meldteksten (letterlijk uit de spec)', () => {
  test('vinkje zonder bewijs', async () => {
    expect(await meldingenVoor('vinkje-zonder-bewijs')).toStrictEqual([
      {
        key: 'roadmap:bewijs:5',
        message:
          'docs/roadmap.md:5: vinkje zonder bewijs; zet er een testpad, checknaam (pnpm …) of PR-nummer (#…) achter',
      },
    ]);
  });

  test('vinkje noemt een pad dat niet bestaat', async () => {
    expect(await meldingenVoor('vinkje-pad-bestaat-niet')).toStrictEqual([
      {
        key: 'roadmap:pad:5:src/api/weg.ts',
        message: 'docs/roadmap.md:5: vinkje noemt `src/api/weg.ts`, dat niet bestaat',
      },
    ]);
  });

  // GEWIJZIGD (gebouwd-zonder-nummer/AC-1, ADR 0095): `status: gebouwd` is zelf het bewijs; de melding spec:bewijs bestaat niet meer.
  test('spec naar gebouwd zonder nummer geeft geen melding', async () => {
    expect(await meldingenVoor('spec-gebouwd-zonder-bewijs')).toStrictEqual([]);
  });

  // De spec laat open wat `<verwijzing>` in de tekst wordt (de gevonden tekst, bijv. "roadmap stuk 3f"); daarom alleen de vaste delen.
  test('spec noemt een roadmap-item maar de roadmap wijzigt niet', async () => {
    const [melding] = await meldingenVoor('spec-roadmapverwijzing-roadmap-ongewijzigd');
    expect(melding?.message).toMatch(
      /^docs\/specs\/a\.md: wordt in deze PR volledig gebouwd en noemt .+, maar docs\/roadmap\.md wijzigt niet in deze PR$/,
    );
  });
});

// --- git-laag: een tijdelijke repo, met origin/main via update-ref (zoals check-migrations.test.ts) ----------------------

const tijdelijk: string[] = [];
afterAll(() => {
  for (const dir of tijdelijk) rmSync(dir, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.test', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function schrijf(root: string, pad: string, tekst: string): void {
  mkdirSync(path.dirname(path.join(root, pad)), { recursive: true });
  writeFileSync(path.join(root, pad), tekst);
}

function commit(root: string, bericht: string): void {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', bericht);
}

const KOP = '# Roadmap\n\n## Stuk\n\n';

// Een repo met `main` (= origin/main) en een branch `werk` die daarvan afsplitst; `bestanden` staan op main.
function repo(bestanden: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-roadmap-'));
  tijdelijk.push(root);
  git(root, 'init', '-q', '-b', 'main');
  for (const [pad, tekst] of Object.entries(bestanden)) schrijf(root, pad, tekst);
  commit(root, 'baseline');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  git(root, 'switch', '-q', '-c', 'werk');
  return root;
}

function spec(status: string): string {
  return `---\nstatus: ${status}\n---\n\n# Spec A\n\nEen spec zonder verwijzing.\n`;
}

async function vanRepo(root: string, basisRef: string): Promise<Melding[]> {
  return alsMeldingen(await roep(ROADMAP_MODULE, 'roadmapVanRepo', root, basisRef));
}

describe('roadmapVanRepo (git-laag)', () => {
  test('roadmap/AC-14: een branch die achterloopt op main meldt wat main daarna deed niet (vergelijkt met het afsplitspunt)', async () => {
    const root = repo({ 'docs/roadmap.md': `${KOP}- [x] Oud item zonder verwijzing\n- [ ] Open taak\n` });
    git(root, 'switch', '-q', 'main');
    schrijf(root, 'docs/roadmap.md', `${KOP}- [x] Oud item zonder verwijzing, aangepast\n- [x] Open taak\n`);
    commit(root, 'main loopt door');
    git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
    git(root, 'switch', '-q', 'werk');

    expect((await vanRepo(root, 'origin/main')).map((melding) => melding.key)).toStrictEqual([]);
  });

  test('een onleesbare basis faalt met "niet te lezen"', async () => {
    const meldingen = await vanRepo(REPO, 'bestaat-niet-ref');
    expect(meldingen.length).toBeGreaterThan(0);
    expect(meldingen.map((melding) => melding.message).join('\n')).toContain('niet te lezen');
  });

  test('[ ] naar [x] in een commit op de branch zonder bewijs geeft roadmap:bewijs, met bewijs niets', async () => {
    const root = repo({ 'docs/roadmap.md': `${KOP}- [ ] Taak A\n` });
    schrijf(root, 'docs/roadmap.md', `${KOP}- [x] Taak A\n`);
    commit(root, 'vink af');
    expect((await vanRepo(root, 'origin/main')).map((melding) => melding.key)).toStrictEqual(['roadmap:bewijs:5']);

    schrijf(root, 'docs/roadmap.md', `${KOP}- [x] Taak A (#12)\n`);
    commit(root, 'bewijs');
    expect((await vanRepo(root, 'origin/main')).map((melding) => melding.key)).toStrictEqual([]);
  });

  // GEWIJZIGD (gebouwd-zonder-nummer/AC-1, ADR 0095): `status: gebouwd` zonder nummer geeft geen melding meer.
  test('een spec die in een commit naar gebouwd gaat zonder nummer geeft geen melding', async () => {
    const root = repo({ 'docs/specs/a.md': spec('goedgekeurd') });
    schrijf(root, 'docs/specs/a.md', spec('gebouwd'));
    commit(root, 'gebouwd');

    expect((await vanRepo(root, 'origin/main')).map((melding) => melding.key)).toStrictEqual([]);
  });

  test('git mv van een gebouwde spec geeft geen melding (rename-detectie via git)', async () => {
    const root = repo({ 'docs/specs/a.md': spec('gebouwd') });
    git(root, 'mv', 'docs/specs/a.md', 'docs/specs/b.md');
    commit(root, 'hernoem');

    expect((await vanRepo(root, 'origin/main')).map((melding) => melding.key)).toStrictEqual([]);
  });
});

// --- CLI (roadmap/AC-15): node scripts/kit/check-roadmap.mjs in een tijdelijke repo ---------------------------------------------------

const ZONDER_BEWIJS = 'vinkje zonder bewijs; ';
const GROEN = '✓ check:roadmap: elk nieuw vinkje en elke gebouwde spec verwijst naar bewijs';

function cli(root: string, ci: boolean): { status: number | null; stdout: string; stderr: string } {
  const env = Object.fromEntries(Object.entries(process.env).filter(([naam]) => naam !== 'GITHUB_ACTIONS'));
  const { status, stdout, stderr } = spawnSync(process.execPath, [SCRIPT], {
    cwd: root,
    encoding: 'utf8',
    env: ci ? { ...env, GITHUB_ACTIONS: 'true' } : env,
  });
  return { status, stdout, stderr };
}

// Een repo waarin de branch een item zonder bewijs afvinkt (beginregel 5).
function repoMetVinkje(): string {
  const root = repo({ 'docs/roadmap.md': `${KOP}- [ ] Taak A\n` });
  schrijf(root, 'docs/roadmap.md', `${KOP}- [x] Taak A\n`);
  commit(root, 'vink af');
  return root;
}

describe('CLI node scripts/kit/check-roadmap.mjs', () => {
  test('geen meldingen: exit 0 en de ✓-tekst op stdout', () => {
    const resultaat = cli(repo({ 'docs/roadmap.md': `${KOP}- [x] Oud item zonder verwijzing\n` }), false);
    expect(resultaat).toStrictEqual({ status: 0, stdout: `${GROEN}\n`, stderr: '' });
  });

  test('vinkje zonder bewijs, lokaal: exit 1 en ✗-regel op stderr', () => {
    const resultaat = cli(repoMetVinkje(), false);
    expect(resultaat.status).toBe(1);
    expect(resultaat.stderr).toContain(`✗ check:roadmap: docs/roadmap.md:5: ${ZONDER_BEWIJS}`);
    expect(resultaat.stdout).not.toContain('✓');
  });

  test('vinkje zonder bewijs, in CI: exit 1 en ::error:: in plaats van ✗', () => {
    const resultaat = cli(repoMetVinkje(), true);
    expect(resultaat.status).toBe(1);
    expect(resultaat.stderr).toContain(`::error::docs/roadmap.md:5: ${ZONDER_BEWIJS}`);
    expect(resultaat.stderr).not.toContain('✗');
  });

  // Zonder update-ref bestaat refs/remotes/origin/main niet.
  function repoZonderOrigin(): string {
    const root = mkdtempSync(path.join(tmpdir(), 'check-roadmap-'));
    tijdelijk.push(root);
    git(root, 'init', '-q', '-b', 'main');
    schrijf(root, 'docs/roadmap.md', `${KOP}- [ ] Taak A\n`);
    commit(root, 'baseline');
    return root;
  }

  test('geen origin/main, lokaal: exit 1 en "niet te lezen" met ✗', () => {
    const resultaat = cli(repoZonderOrigin(), false);
    expect(resultaat.status).toBe(1);
    expect(resultaat.stderr).toContain('✗ check:roadmap: origin/main is niet te lezen; ');
  });

  test('geen origin/main, in CI: exit 1 en "niet te lezen" met ::error::', () => {
    const resultaat = cli(repoZonderOrigin(), true);
    expect(resultaat.status).toBe(1);
    expect(resultaat.stderr).toContain('::error::origin/main is niet te lezen; ');
    expect(resultaat.stderr).not.toContain('✗');
  });
});

// --- echte repo (roadmap/AC-16) ------------------------------------------------------------------------------------------------------

function echteRoadmap(): string {
  return readFileSync(path.join(REPO, 'docs/roadmap.md'), 'utf8');
}

function echteHead(): { lees: (pad: string) => string | null; bestanden: string[]; hernoemd: Record<string, string> } {
  const bestanden = git(REPO, 'ls-files').split('\n').filter(Boolean);
  return {
    bestanden,
    hernoemd: {},
    lees: (pad) => (existsSync(path.join(REPO, pad)) ? readFileSync(path.join(REPO, pad), 'utf8') : null),
  };
}

function lege(): { lees: (pad: string) => null; bestanden: string[] } {
  return { lees: () => null, bestanden: [] };
}

async function echteMeldingen(basis: { lees: (pad: string) => string | null; bestanden: string[] }) {
  const head = echteHead();
  return alsMeldingen(
    await roep(ROADMAP_MODULE, 'roadmapMeldingen', {
      basis,
      head,
      scripts: scriptsVan(head.lees('package.json')),
      testpaden: leesTestpaden(),
    }),
  );
}

describe('de echte docs/roadmap.md (roadmap/AC-16)', () => {
  test('basis gelijk aan head: geen enkele melding, ook niet voor de 91+ bestaande vinkjes zonder bewijs', async () => {
    const roadmap = echteRoadmap();
    const basis = {
      ...echteHead(),
      lees: (pad: string) => (pad === 'docs/roadmap.md' ? roadmap : echteHead().lees(pad)),
    };
    expect(await echteMeldingen(basis)).toStrictEqual([]);
  });

  // De spec noemt geen export van de parser. Indirect: met een lege basis is elk `[x]`-item nieuw, en een melding hoort dan bij de
  // beginregel van een afgevinkt item (dus geen vervolgregel, `**Klaar als:**`-regel of kop als item).
  test('met een lege basis horen alle meldingen bij de beginregel van een [x]-item', async () => {
    const regels = echteRoadmap().split('\n');
    // Alleen de roadmap-meldingen: met een lege basis gaat elke bestaande gebouwde spec "naar gebouwd", en die oude statusvorm is
    // sinds taakmandaat-vervolg (B2) geen geldig bewijs meer (spec:bewijs, zie AC-13 daar: alleen een overgang wordt gecontroleerd).
    const meldingen = (await echteMeldingen(lege())).filter(({ key }) => key.startsWith('roadmap:'));
    for (const { key } of meldingen) {
      const regel = Number(/^roadmap:(?:bewijs|pad):(\d+)/.exec(key)?.[1]);
      expect(regels[regel - 1], key).toMatch(/^\s*- \[[xX]\] /);
    }
  });

  test('pnpm check:roadmap is groen op main: geen melding t.o.v. het afsplitspunt met origin/main', async () => {
    const meldingen = await vanRepo(REPO, 'origin/main');
    expect(meldingen.map((melding) => melding.message)).toStrictEqual([]);
  });
});

// --- hergebruik uit check-docs.mjs (de PR exporteert ze zonder gedragswijziging) ------------------------------------------

describe('check-docs.mjs exporteert de hulpfuncties voor check:roadmap', () => {
  test.each([
    ['#core/api/db/', 'src/core/api/db'],
    ['#shared/limits.ts', 'src/shared/limits.ts'],
    ['scripts/kit/templates/', 'scripts/kit/templates'],
    ['mise.toml', 'mise.toml'],
  ])('doelPad(%s) is %s', async (invoer, verwacht) => {
    expect(await roep(DOCS_MODULE, 'doelPad', invoer)).toBe(verwacht);
  });

  test('looksLikePath en pathExists werken als in check-docs', async () => {
    expect(await roep(DOCS_MODULE, 'looksLikePath', 'db/tests/rls.sql')).toBe(true);
    expect(await roep(DOCS_MODULE, 'looksLikePath', '/design-system')).toBe(false);
    expect(await roep(DOCS_MODULE, 'looksLikePath', 'eslint.config.*')).toBe(false);
    expect(await roep(DOCS_MODULE, 'pathExists', 'mise.toml', ['mise.toml'])).toBe(true);
    expect(await roep(DOCS_MODULE, 'pathExists', 'weg.ts', ['src/a.ts'])).toBe(false);
  });

  test('packageScripts levert de scripts en gooit op ongeldige JSON', async () => {
    expect(await roep(DOCS_MODULE, 'packageScripts', '{"scripts":{"a":"b"}}')).toStrictEqual({ a: 'b' });
    await expect(roep(DOCS_MODULE, 'packageScripts', 'geen json')).rejects.toThrow();
  });

  test('SPEC_STATUS leest de status en negeert het commentaar erachter', async () => {
    const regex = await exportVan(DOCS_MODULE, 'SPEC_STATUS');
    expect(regex).toBeInstanceOf(RegExp);
    if (!(regex instanceof RegExp)) return;
    expect(regex.exec('---\nstatus: gebouwd # gebouwd in PR #51\n---\n')?.[1]).toBe('gebouwd');
  });
});
