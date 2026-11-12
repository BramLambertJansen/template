import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { padNiveau } from '../../rails/hooks/lib/padtabel.mjs';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// templateregime/AC-3 (docs/specs/templateregime.md, ADR 0089 punt 2): `.github/CODEOWNERS` wordt afgeleid uit de padtabel in
// `.claude/gates.json`: eerst `* @<eigenaar>`, dan elke glob met besluit `agent` zonder eigenaar, dan elke glob met een ander
// besluit met de eigenaar; GitHub laat het laatste passende patroon winnen.
//
// Aangenomen ingang (scripts/kit/codeowners.mjs bestaat nog niet; dynamisch geladen, zodat dit bestand zelf laadt):
//   codeownersTekst(gatesJson: object, eigenaar: string): string   gatesJson = de GEPARSEDE gates.json, eigenaar = handle zonder `@`
//   eigenaarVan(codeownersTekst: string, pad: string): string | null   de eigenaar (met of zonder `@`) of null
const ROOT = path.join(import.meta.dirname, '../..');
const MODULE = path.join(ROOT, 'scripts/kit/codeowners.mjs');
const EIGENAAR = 'bramlambertjansen';

type Codeowners = {
  codeownersTekst: (gatesJson: unknown, eigenaar: string) => string;
  eigenaarVan: (tekst: string, pad: string) => string | null;
};

// Een ontbrekende of onleesbare module is `null`; elke test laat dat een assertiefout worden.
async function laad(): Promise<Codeowners | null> {
  try {
    const module: unknown = await import(pathToFileURL(MODULE).href);
    if (typeof module !== 'object' || module === null) return null;
    const tekstFn: unknown = Reflect.get(module, 'codeownersTekst');
    const eigenaarFn: unknown = Reflect.get(module, 'eigenaarVan');
    if (typeof tekstFn !== 'function' || typeof eigenaarFn !== 'function') return null;
    return {
      codeownersTekst: (gatesJson, eigenaar) => String(Reflect.apply(tekstFn, undefined, [gatesJson, eigenaar])),
      eigenaarVan: (tekst, pad) => {
        const uitkomst: unknown = Reflect.apply(eigenaarFn, undefined, [tekst, pad]);
        return typeof uitkomst === 'string' ? uitkomst : null;
      },
    };
  } catch {
    return null;
  }
}

async function vereis(): Promise<Codeowners> {
  const gevonden = await laad();
  expect(gevonden, 'scripts/kit/codeowners.mjs met codeownersTekst en eigenaarVan').not.toBeNull();
  if (gevonden === null) throw new Error('scripts/kit/codeowners.mjs ontbreekt');
  return gevonden;
}

// De handle met of zonder `@` telt hetzelfde.
const schoon = (eigenaar: string | null): string | null => (eigenaar === null ? null : eigenaar.replace(/^@/, ''));

const gatesTekst = readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8');
const echteGates: unknown = JSON.parse(gatesTekst);

function getrackt(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean);
}

// Wat de padtabel zegt: besluit `agent` is geen eigenaar, al het andere wel.
function verwachteEigenaar(pad: string): string | null {
  return padNiveau(pad, echteGates).besluit === 'agent' ? null : EIGENAAR;
}

describe('templateregime/AC-3 de echte CODEOWNERS volgt de padtabel', () => {
  test('templateregime/AC-3 voor elk getrackt pad geeft "laatste passende patroon wint" de eigenaar uit de padtabel', async () => {
    const { codeownersTekst, eigenaarVan } = await vereis();
    const tekst = codeownersTekst(echteGates, EIGENAAR);
    const paden = getrackt();

    expect(paden.length).toBeGreaterThan(100);
    const afwijkend = paden
      .map((pad) => ({ pad, kreeg: schoon(eigenaarVan(tekst, pad)), hoort: verwachteEigenaar(pad) }))
      .filter(({ kreeg, hoort }) => kreeg !== hoort);
    expect(afwijkend).toStrictEqual([]);
  });

  test('templateregime/AC-3 de voorbeeldpaden: beschermd krijgt de handle, gewoon werk niemand', async () => {
    const { codeownersTekst, eigenaarVan } = await vereis();
    const tekst = codeownersTekst(echteGates, EIGENAAR);
    const beschermd = [
      'db/migrations/x.sql',
      'docs/template/adr/x.md',
      'src/x/CLAUDE.md',
      'src/x/.envrc',
      'docs/x/package.json',
      'src/web/vite.config.ts',
    ];
    const vrij = ['src/web/features/x/page.tsx', 'docs/gebruik.md', 'CHANGELOG.md'];

    expect(beschermd.map((pad) => [pad, schoon(eigenaarVan(tekst, pad))])).toStrictEqual(
      beschermd.map((pad) => [pad, EIGENAAR]),
    );
    expect(vrij.map((pad) => [pad, schoon(eigenaarVan(tekst, pad))])).toStrictEqual(vrij.map((pad) => [pad, null]));
    // Dezelfde paden volgens de padtabel zelf: de rijen van AC-3 staan erin.
    expect(beschermd.map((pad) => padNiveau(pad, echteGates).besluit)).not.toContain('agent');
    expect(vrij.map((pad) => padNiveau(pad, echteGates).besluit)).toStrictEqual(['agent', 'agent', 'agent']);
  });

  test('templateregime/AC-3 de padtabel heeft de rijen met besluit eigenaar voor de zelfladende en configuratiepaden', () => {
    const paden: unknown =
      typeof echteGates === 'object' && echteGates !== null ? Reflect.get(echteGates, 'paden') : undefined;
    const rij = (glob: string): unknown =>
      typeof paden === 'object' && paden !== null ? Reflect.get(paden, glob) : undefined;

    for (const glob of [
      'docs/template/**',
      '**/CLAUDE*.md',
      '**/AGENTS*.md',
      '**/.*',
      '**/.*/**',
      '**/*.config.*',
      '**/package.json',
      '**/tsconfig*.json',
    ]) {
      expect([glob, rij(glob)]).toMatchObject([glob, { besluit: 'eigenaar' }]);
    }
  });

  test('templateregime/AC-3 het bestand .github/CODEOWNERS is gelijk aan de afleiding voor de handle uit goedkeurders', async () => {
    const { codeownersTekst } = await vereis();
    const goedkeurders: unknown =
      typeof echteGates === 'object' && echteGates !== null ? Reflect.get(echteGates, 'goedkeurders') : undefined;
    const handle = Array.isArray(goedkeurders) ? String(goedkeurders[0]) : '';

    expect(handle).toBe(EIGENAAR);
    expect(readFileSync(path.join(ROOT, '.github/CODEOWNERS'), 'utf8')).toBe(codeownersTekst(echteGates, handle));
  });
});

describe('templateregime/AC-3 codeownersTekst', () => {
  const GATES = {
    paden: {
      'src/**': { besluit: 'agent' },
      'docs/**': { besluit: 'agent' },
      'CHANGELOG.md': { besluit: 'agent' },
      'scripts/**': { schrijven: 'voorReview' },
      '**/*.test.*': { schrijven: 'gate' },
      'package.json': { schrijven: 'altijdVragen', besluit: 'besluit-pr' },
      'compose*.yaml': { schrijven: 'voorReview' },
      'docs/template/**': { besluit: 'eigenaar' },
      '**/.*': { besluit: 'eigenaar' },
      '**/.*/**': { besluit: 'eigenaar' },
    },
  };

  // De regels zonder commentaar en lege regels, als [patroon, ...eigenaars] (spaties en uitlijning doen er niet toe).
  const regels = (tekst: string): string[][] =>
    tekst
      .split('\n')
      .map((regel) => regel.trim())
      .filter((regel) => regel !== '' && !regel.startsWith('#'))
      .map((regel) => regel.split(/\s+/).map((deel) => deel.replace(/^@/, '')));

  test('templateregime/AC-3 eerst een commentaarkop, dan * met de eigenaar, dan de agent-globs zonder eigenaar, dan de rest met de eigenaar', async () => {
    const { codeownersTekst } = await vereis();
    const tekst = codeownersTekst(GATES, 'eig');

    expect(tekst.startsWith('#')).toBe(true);
    expect(regels(tekst)).toStrictEqual([
      ['*', 'eig'],
      ['/src/'],
      ['/docs/'],
      ['/CHANGELOG.md'],
      ['/scripts/', 'eig'],
      ['**/*.test.*', 'eig'],
      ['/package.json', 'eig'],
      ['/compose*.yaml', 'eig'],
      ['/docs/template/', 'eig'],
      ['**/.*', 'eig'],
      ['**/.*/**', 'eig'],
    ]);
  });

  test('templateregime/AC-3 de afgeleide tekst geeft dezelfde eigenaar als de padtabel, ook voor een rij met alleen schrijven', async () => {
    const { codeownersTekst, eigenaarVan } = await vereis();
    const tekst = codeownersTekst(GATES, 'eig');
    const paden = [
      'src/a.ts',
      'docs/gids.md',
      'docs/template/adr/0001.md',
      'CHANGELOG.md',
      'scripts/x.sh',
      'src/a/b.test.ts',
      'package.json',
      'sub/package.json',
      'compose.dev.yaml',
      'src/.hidden/x.ts',
      'README.md',
    ];

    for (const pad of paden) {
      const hoort = padNiveau(pad, GATES).besluit === 'agent' ? null : 'eig';
      expect([pad, schoon(eigenaarVan(tekst, pad))]).toStrictEqual([pad, hoort]);
    }
  });
});

describe('templateregime/AC-3 eigenaarVan rekent met de matchregels van CODEOWNERS', () => {
  async function eigenaar(tekst: string, pad: string): Promise<string | null> {
    const { eigenaarVan } = await vereis();
    return schoon(eigenaarVan(tekst, pad));
  }

  test('templateregime/AC-3 * geldt voor elk pad, ook in submappen', async () => {
    expect(await eigenaar('* @eig\n', 'README.md')).toBe('eig');
    expect(await eigenaar('* @eig\n', 'src/a/b/c.ts')).toBe('eig');
  });

  test('templateregime/AC-3 geen enkel passend patroon geeft null', async () => {
    expect(await eigenaar('/src/ @eig\n', 'README.md')).toBeNull();
    expect(await eigenaar('', 'README.md')).toBeNull();
  });

  test('templateregime/AC-3 /map/ dekt alles eronder, alleen vanaf de root, en geen map met dezelfde beginletters', async () => {
    const tekst = '/map/ @eig\n';
    expect(await eigenaar(tekst, 'map/a.txt')).toBe('eig');
    expect(await eigenaar(tekst, 'map/sub/b.txt')).toBe('eig');
    expect(await eigenaar(tekst, 'x/map/a.txt')).toBeNull();
    expect(await eigenaar(tekst, 'mapx/a.txt')).toBeNull();
  });

  test('templateregime/AC-3 **/naam dekt die naam op elke diepte, maar geen langere naam', async () => {
    const tekst = '**/naam @eig\n';
    expect(await eigenaar(tekst, 'naam')).toBe('eig');
    expect(await eigenaar(tekst, 'a/naam')).toBe('eig');
    expect(await eigenaar(tekst, 'a/b/naam')).toBe('eig');
    expect(await eigenaar(tekst, 'a/naamx')).toBeNull();
    expect(await eigenaar(tekst, 'a/xnaam')).toBeNull();
  });

  test('templateregime/AC-3 **/*.test.* dekt een bestandsnaam met een deel ertussen op elke diepte', async () => {
    const tekst = '**/*.test.* @eig\n';
    expect(await eigenaar(tekst, 'a.test.ts')).toBe('eig');
    expect(await eigenaar(tekst, 'src/web/a.test.tsx')).toBe('eig');
    expect(await eigenaar(tekst, 'src/web/a.ts')).toBeNull();
  });

  test('templateregime/AC-3 /pad/bestand dekt alleen dat bestand vanaf de root', async () => {
    const tekst = '/pad/bestand @eig\n';
    expect(await eigenaar(tekst, 'pad/bestand')).toBe('eig');
    expect(await eigenaar(tekst, 'x/pad/bestand')).toBeNull();
    expect(await eigenaar(tekst, 'pad/ander')).toBeNull();
  });

  test('templateregime/AC-3 /compose*.yaml dekt alleen bestanden in de root', async () => {
    const tekst = '/compose*.yaml @eig\n';
    expect(await eigenaar(tekst, 'compose.yaml')).toBe('eig');
    expect(await eigenaar(tekst, 'compose.dev.yaml')).toBe('eig');
    expect(await eigenaar(tekst, 'sub/compose.yaml')).toBeNull();
    expect(await eigenaar(tekst, 'compose.yml')).toBeNull();
  });

  test('templateregime/AC-3 een * in een patroon met een map steekt geen map over', async () => {
    const tekst = '/src/*.ts @eig\n';
    expect(await eigenaar(tekst, 'src/a.ts')).toBe('eig');
    expect(await eigenaar(tekst, 'src/a/b.ts')).toBeNull();
  });

  test('templateregime/AC-3 het laatste passende patroon wint, ook als het specifieker patroon eerder staat', async () => {
    const tekst = '/src/core/ @a\n/src/ @b\n';
    expect(await eigenaar(tekst, 'src/core/x.ts')).toBe('b');
    expect(await eigenaar(tekst, 'src/web/x.ts')).toBe('b');
  });

  test('templateregime/AC-3 een later patroon zonder eigenaar heft een eerder patroon op', async () => {
    const tekst = '* @eig\n/src/\n';
    expect(await eigenaar(tekst, 'src/web/x.ts')).toBeNull();
    expect(await eigenaar(tekst, 'README.md')).toBe('eig');
  });

  test('templateregime/AC-3 een patroon met eigenaar na een patroon zonder eigenaar maakt het pad weer van de eigenaar', async () => {
    const tekst = '* @eig\n/src/\n/src/core/ @eig\n';
    expect(await eigenaar(tekst, 'src/web/x.ts')).toBeNull();
    expect(await eigenaar(tekst, 'src/core/x.ts')).toBe('eig');
  });

  test('templateregime/AC-3 commentaar en lege regels doen niet mee', async () => {
    const tekst = '# /src/ @fout\n\n* @eig\n   \n# /docs/\n';
    expect(await eigenaar(tekst, 'src/a.ts')).toBe('eig');
    expect(await eigenaar(tekst, 'docs/a.md')).toBe('eig');
  });
});

describe('templateregime/AC-3 check-docs eist dat CODEOWNERS gelijk is aan de afleiding', () => {
  // Een git-repo met de echte gates.json en settings.json, en de opgegeven CODEOWNERS.
  function repo(codeowners: string): string {
    const root = mkdtempSync(path.join(tmpdir(), 'check-docs-codeowners-'));
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ scripts: {} }),
      '.github/CODEOWNERS': codeowners,
      '.claude/settings.json': readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'),
      '.claude/gates.json': gatesTekst,
    };
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    }
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root });
    return root;
  }

  async function codeownersMeldingen(codeowners: string): Promise<string[]> {
    const lijst = await docsViolations(repo(codeowners));
    return lijst
      .filter((v) => /codeowners/i.test(v.key) || /codeowners/i.test(v.message))
      .map((v) => `${v.key} | ${v.message}`);
  }

  test('templateregime/AC-3 de afgeleide tekst geeft geen enkele melding over CODEOWNERS', async () => {
    const { codeownersTekst } = await vereis();

    expect(await codeownersMeldingen(codeownersTekst(echteGates, EIGENAAR))).toStrictEqual([]);
  });

  test('templateregime/AC-3 een regel te weinig, een regel te veel en een andere handle geven elk een melding', async () => {
    const { codeownersTekst } = await vereis();
    const goed = codeownersTekst(echteGates, EIGENAAR);
    const zonderRegel = goed.replace(/^\/scripts\/.*\n/m, '');
    const extraRegel = `${goed}/extra/ @${EIGENAAR}\n`;
    const andereHandle = goed.replaceAll(`@${EIGENAAR}`, '@iemand-anders');

    expect(zonderRegel).not.toBe(goed);
    for (const afwijking of [zonderRegel, extraRegel, andereHandle]) {
      expect((await codeownersMeldingen(afwijking)).length).toBeGreaterThan(0);
    }
  });
});

// Nieuw (templateregime/AC-3, ADR 0089 punt 3): een ontbrekend .github/CODEOWNERS is zelf een afwijking van de afleiding.
// Aangenomen: de sleutel is `docs:spiegel:codeowners` (of begint ermee); het bestand weglaten geeft die melding, het
// gegenereerde bestand niet. Nu slaat check-docs de spiegel over als CODEOWNERS niet in de repo staat.
describe('templateregime/AC-3 check-docs meldt een ontbrekende CODEOWNERS', () => {
  function repoMet(codeowners: string | null): string {
    const root = mkdtempSync(path.join(tmpdir(), 'check-docs-codeowners-weg-'));
    const files: Record<string, string> = {
      'package.json': JSON.stringify({ scripts: {} }),
      '.claude/settings.json': readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'),
      '.claude/gates.json': gatesTekst,
    };
    if (codeowners !== null) files['.github/CODEOWNERS'] = codeowners;
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
      writeFileSync(path.join(root, file), content);
    }
    execFileSync('git', ['init', '-q'], { cwd: root });
    execFileSync('git', ['add', '-A'], { cwd: root });
    return root;
  }

  const spiegelKeys = async (codeowners: string | null): Promise<string[]> =>
    (await docsViolations(repoMet(codeowners)))
      .map((v) => v.key)
      .filter((key) => key.startsWith('docs:spiegel:codeowners'));

  test('templateregime/AC-3 zonder .github/CODEOWNERS geeft docsViolations een melding docs:spiegel:codeowners', async () => {
    expect(await spiegelKeys(null)).toStrictEqual(['docs:spiegel:codeowners']);
  });

  test('templateregime/AC-3 dezelfde repo met het gegenereerde CODEOWNERS geeft die melding niet', async () => {
    const { codeownersTekst } = await vereis();

    expect(await spiegelKeys(codeownersTekst(echteGates, EIGENAAR))).toStrictEqual([]);
  });
});

// Nieuw (templateregime/AC-3, ADR 0089 punt 3): GitHub leest sommige globs anders dan de padtabel (`**` midden in een
// segment, `[`/`]`, een spatie, `#` vooraan); codeownersTekst weigert die met een fout die de glob noemt, in plaats van
// een CODEOWNERS te schrijven die GitHub anders uitlegt.
describe('templateregime/AC-3 codeownersTekst weigert een glob die GitHub anders leest', () => {
  const rij = { besluit: 'eigenaar' };

  test.each(['src/**.ts', 'src/a**/b.ts', 'src/a[1].ts', 'src/a]b.ts', 'src/een bestand.ts', '#geheim.md'])(
    'templateregime/AC-3 de glob %s geeft een fout die de glob noemt',
    async (glob) => {
      const { codeownersTekst } = await vereis();

      expect(() => codeownersTekst({ paden: { [glob]: rij } }, EIGENAAR)).toThrow(glob);
    },
  );

  test('templateregime/AC-3 elke glob uit de echte .claude/gates.json gaat goed, ook de hele tabel in één keer', async () => {
    const { codeownersTekst } = await vereis();
    const paden: unknown =
      typeof echteGates === 'object' && echteGates !== null ? Reflect.get(echteGates, 'paden') : {};
    const globs = typeof paden === 'object' && paden !== null ? Object.keys(paden) : [];

    expect(globs.length).toBeGreaterThan(20);
    for (const glob of globs) {
      expect(() => codeownersTekst({ paden: { [glob]: rij } }, EIGENAAR), glob).not.toThrow();
    }
    expect(() => codeownersTekst(echteGates, EIGENAAR)).not.toThrow();
  });
});
