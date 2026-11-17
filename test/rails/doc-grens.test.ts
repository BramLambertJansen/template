import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsKrimp, docsViolations } from '../../scripts/kit/check-docs.mjs';
import { metingen } from '../../scripts/kit/leespad.mjs';
import { compare } from '../../scripts/kit/ratchet.mjs';

// Harde grens op levende ADR's (6 KB) in check-docs (R-DOC-01): de sleutel `docs:<bestand>:budget` staat zonder grootte in
// de baseline, groei boven de grens tegenover de merge-base is rood in het strikte kanaal (`:budget-groei`). Een spec heeft
// geen harde grens (eigenaarbesluit 2026-11-17): 10 KB is een meting in `pnpm leespad`, nooit rood en nooit in de baseline.
const KB = 1024;
const SPEC_STREEF = 10 * KB;
const ADR_GRENS = 6 * KB;
const SPEC_MAPPEN = ['docs/specs', 'docs/template/specs'] as const;
const ADR_MAPPEN = ['docs/adr', 'docs/template/adr'] as const;

/** Een tekst van precies `bytes` bytes die met `kop` begint. */
function opMaat(kop: string, bytes: number): string {
  return `${kop}${'x'.repeat(bytes - Buffer.byteLength(kop) - 1)}\n`;
}

const spec = (bytes: number, status = 'voorstel'): string =>
  opMaat(`---\nstatus: ${status}\nnamespace: kaart\n---\n\n# Kaart\n\n`, bytes);
const adr = (bytes: number, status = 'geaccepteerd'): string => opMaat(`# 0005 — Demo\n\nStatus: ${status}\n\n`, bytes);

const mappen: string[] = [];
afterEach(() => {
  for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
});

function git(root: string, ...args: string[]): void {
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.test', ...args], { cwd: root });
}

function schrijf(root: string, files: Record<string, string>): void {
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

/** Een repo met `files` als commit op `origin/main`; `nu` staat daarna gestaged in de werkmap. */
function repo(files: Record<string, string>, nu: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'doc-grens-'));
  mappen.push(root);
  schrijf(root, { 'package.json': JSON.stringify({ scripts: {} }), ...files });
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', 'basis');
  git(root, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  schrijf(root, nu);
  git(root, 'add', '-A');
  return root;
}

const BUDGET = /:budget(?:-groei)?$/;

async function budget(root: string) {
  return (await docsViolations(root)).filter(({ key }) => BUDGET.test(key));
}

async function groei(root: string) {
  return (await docsKrimp(root)).filter(({ key }) => BUDGET.test(key));
}

/** De meting van `pnpm leespad` voor de specs in de werkmap van `root`. */
function specMeting(root: string, ...files: string[]) {
  return metingen(files, (file) => readFileSync(path.join(root, file), 'utf8'))['specs'];
}

describe('leesbudget/AC-10 deel 1: een ADR boven de grens is een overtreding', () => {
  test.each(ADR_MAPPEN)('leesbudget/AC-10 deel 1 een ADR van 6 KB + 1 byte in %s is rood', async (map) => {
    const uit = await budget(repo({ [`${map}/0005-demo.md`]: adr(ADR_GRENS + 1) }));

    expect(uit.map(({ key }) => key)).toStrictEqual([`docs:${map}/0005-demo.md:budget`]);
    expect(uit[0]?.message).toContain(`${map}/0005-demo.md`);
    expect(uit[0]?.message).toContain(String(ADR_GRENS + 1));
    expect(uit[0]?.message).toContain(String(ADR_GRENS));
  });

  test('leesbudget/AC-10 deel 1 de sjablonen, het archief en andere documenten tellen niet', async () => {
    const groot = 'x'.repeat(3 * SPEC_STREEF);
    const uit = await budget(
      repo({
        'docs/specs/_template.md': groot,
        'docs/specs/_mini.md': groot,
        'docs/template/specs/_template.md': groot,
        'docs/adr/_template.md': groot,
        'docs/adr/README.md': groot,
        'docs/adr/archief/0005-demo.md': adr(3 * ADR_GRENS),
        'docs/template/adr/archief/0005-demo.md': adr(3 * ADR_GRENS),
        'docs/operations/lang.md': groot,
        'docs/specs/sub/kaart.md': groot,
      }),
    );

    expect(uit).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 1 de grens van een ADR geldt niet voor een spec', async () => {
    expect(await budget(repo({ 'docs/specs/kaart.md': spec(ADR_GRENS + 1) }))).toStrictEqual([]);
  });
});

describe('leesbudget/AC-10 deel 2: een bestaande overschrijding van een ADR blijft staan zolang ze niet groeit', () => {
  const PAD = 'docs/adr/0005-demo.md';
  const SLEUTEL = `docs:${PAD}:budget`;

  test('leesbudget/AC-10 deel 2 de sleutel bevat geen grootte: krimpen boven de grens breekt de baseline niet', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000) }, { [PAD]: adr(ADR_GRENS + 500) });

    expect(compare([SLEUTEL], await budget(root))).toStrictEqual({ nieuw: [], opgelost: [] });
    expect(await groei(root)).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 2 gelijk blijven is groen', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000) });

    expect(compare([SLEUTEL], await budget(root))).toStrictEqual({ nieuw: [], opgelost: [] });
    expect(await groei(root)).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 2 onder de grens gekrompen: opgelost, tot ratchet:update de sleutel weghaalt', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000) }, { [PAD]: adr(ADR_GRENS - 100) });

    expect(compare([SLEUTEL], await budget(root))).toStrictEqual({ nieuw: [], opgelost: [SLEUTEL] });
    expect(await groei(root)).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 2 één byte groei boven de grens is rood, ook met de sleutel in de baseline', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000) }, { [PAD]: adr(ADR_GRENS + 4001) });
    const uit = await groei(root);

    expect(compare([SLEUTEL], await budget(root)).nieuw).toStrictEqual([]);
    expect(uit.map(({ key }) => key)).toStrictEqual([`docs:${PAD}:budget-groei`]);
    expect(uit[0]?.message).toContain(PAD);
    expect(uit[0]?.message).toContain(String(ADR_GRENS + 4000));
    expect(uit[0]?.message).toContain(String(ADR_GRENS + 4001));
    expect(uit[0]?.message).toContain(String(ADR_GRENS));
  });

  test('leesbudget/AC-10 deel 2 een ADR in docs/template/adr boven de grens die groeit is rood', async () => {
    const pad = 'docs/template/adr/0005-demo.md';
    const root = repo({ [pad]: adr(ADR_GRENS + 10) }, { [pad]: adr(ADR_GRENS + 2000) });

    expect((await groei(root)).map(({ key }) => key)).toStrictEqual([`docs:${pad}:budget-groei`]);
  });

  test('leesbudget/AC-10 deel 2 groei die al is gecommit telt ook: de vergelijking is met de merge-base', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000) }, { [PAD]: adr(ADR_GRENS + 5000) });
    git(root, 'commit', '-q', '-m', 'groei');

    expect((await groei(root)).map(({ key }) => key)).toStrictEqual([`docs:${PAD}:budget-groei`]);
  });

  test('leesbudget/AC-10 deel 2 nieuw boven de grens of van onder naar boven: alleen de baseline-sleutel, geen groeimelding', async () => {
    const root = repo(
      { [PAD]: adr(ADR_GRENS - 100) },
      { [PAD]: adr(ADR_GRENS + 100), 'docs/adr/0006-nieuw.md': adr(ADR_GRENS + 100) },
    );

    expect((await budget(root)).map(({ key }) => key)).toStrictEqual([SLEUTEL, 'docs:docs/adr/0006-nieuw.md:budget']);
    expect(await groei(root)).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 2 zonder origin/main toetst de groeicontrole niets en faalt ze niet', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000) }, { [PAD]: adr(ADR_GRENS + 5000) });
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main');

    expect(await groei(root)).toStrictEqual([]);
    expect((await budget(root)).map(({ key }) => key)).toStrictEqual([SLEUTEL]);
  });
});

describe('leesbudget/AC-10 deel 3: op of onder de grens is er niets', () => {
  test('leesbudget/AC-10 deel 3 een ADR precies op de grens is geen overtreding', async () => {
    expect(await budget(repo({ 'docs/adr/0005-demo.md': adr(ADR_GRENS) }))).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 3 groei onder de grens is vrij', async () => {
    const pad = 'docs/adr/0005-demo.md';
    const root = repo({ [pad]: adr(2000) }, { [pad]: adr(ADR_GRENS - 1) });

    expect(await budget(root)).toStrictEqual([]);
    expect(await groei(root)).toStrictEqual([]);
  });
});

describe('leesbudget/AC-10 deel 4: vervallen en vervangen ADR’s tellen niet', () => {
  const PAD = 'docs/adr/0005-demo.md';
  const SLEUTEL = `docs:${PAD}:budget`;

  test.each(['vervallen', 'vervangen door 0007'])(
    'leesbudget/AC-10 deel 4 een ADR met status "%s" boven de grens is geen overtreding',
    async (status) => {
      expect(await budget(repo({ [PAD]: adr(ADR_GRENS + 4000, status) }))).toStrictEqual([]);
    },
  );

  test.each(['voorstel', 'geaccepteerd'])('leesbudget/AC-10 deel 4 een ADR met status %s telt wel', async (status) => {
    const uit = await budget(repo({ [PAD]: adr(ADR_GRENS + 4000, status) }));

    expect(uit.map(({ key }) => key)).toStrictEqual([SLEUTEL]);
  });

  test('leesbudget/AC-10 deel 4 een vervallen ADR die groeit is geen groeimelding', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000, 'vervallen') }, { [PAD]: adr(ADR_GRENS + 5000, 'vervallen') });

    expect(await groei(root)).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 4 een ADR die op de basis vervallen was en weer levend groeit: baseline-sleutel, geen groeimelding', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000, 'vervallen') }, { [PAD]: adr(ADR_GRENS + 5000) });

    expect((await budget(root)).map(({ key }) => key)).toStrictEqual([SLEUTEL]);
    expect(await groei(root)).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 4 een ADR die vervalt verdwijnt uit de baseline (opgelost)', async () => {
    const root = repo({ [PAD]: adr(ADR_GRENS + 4000) }, { [PAD]: adr(ADR_GRENS + 4000, 'vervallen') });

    expect(compare([SLEUTEL], await budget(root)).opgelost).toStrictEqual([SLEUTEL]);
  });
});

describe('leesbudget/AC-10 deel 5: de baseline van deze repo', () => {
  test('leesbudget/AC-10 deel 5 elke overschrijding in deze repo staat in .kit/baseline.json en geen is opgelost', async () => {
    const parsed: unknown = JSON.parse(readFileSync('.kit/baseline.json', 'utf8'));
    const velden = typeof parsed === 'object' && parsed !== null ? Object.entries(parsed) : [];
    const lijst: unknown = velden.find(([naam]) => naam === 'check-docs')?.[1];
    const baseline = Array.isArray(lijst) ? lijst.filter((key): key is string => typeof key === 'string') : [];

    const uit = compare(
      baseline.filter((key) => BUDGET.test(key)),
      await budget(process.cwd()),
    );

    expect(uit).toStrictEqual({ nieuw: [], opgelost: [] });
  });
});

describe('leesbudget/AC-10 deel 6: een spec is een meting, nooit rood en nooit in de baseline', () => {
  test.each(SPEC_MAPPEN)(
    'leesbudget/AC-10 deel 6 een spec van 10 KB + 1 byte in %s: geen overtreding, geen baseline-ingang, wel gemeten',
    async (map) => {
      const pad = `${map}/kaart.md`;
      const root = repo({ [pad]: spec(SPEC_STREEF + 1) });

      expect(await budget(root)).toStrictEqual([]);
      expect(compare([], await budget(root))).toStrictEqual({ nieuw: [], opgelost: [] });
      expect(await groei(root)).toStrictEqual([]);
      expect(specMeting(root, pad)).toMatchObject({
        streefwaarde: SPEC_STREEF,
        aantal: 1,
        boven: 1,
        grootste: [{ naam: pad, waarde: SPEC_STREEF + 1 }],
      });
    },
  );

  test.each(SPEC_MAPPEN)(
    'leesbudget/AC-10 deel 6 een spec in %s die boven 10 KB groeit: geen groeimelding, geen baseline-ingang, wel gemeten',
    async (map) => {
      const pad = `${map}/kaart.md`;
      const root = repo({ [pad]: spec(SPEC_STREEF + 4000) }, { [pad]: spec(SPEC_STREEF + 4001) });

      expect(await groei(root)).toStrictEqual([]);
      expect(await budget(root)).toStrictEqual([]);
      expect(specMeting(root, pad)?.grootste).toStrictEqual([{ naam: pad, waarde: SPEC_STREEF + 4001 }]);
    },
  );

  test('leesbudget/AC-10 deel 6 groei van een spec die al is gecommit is geen groeimelding', async () => {
    const pad = 'docs/specs/kaart.md';
    const root = repo({ [pad]: spec(SPEC_STREEF + 4000) }, { [pad]: spec(SPEC_STREEF + 5000) });
    git(root, 'commit', '-q', '-m', 'groei');

    expect(await groei(root)).toStrictEqual([]);
    expect(await budget(root)).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 6 een spec nieuw boven 10 KB of van onder naar boven: geen overtreding', async () => {
    const root = repo(
      { 'docs/specs/kaart.md': spec(SPEC_STREEF - 100) },
      { 'docs/specs/kaart.md': spec(SPEC_STREEF + 100), 'docs/specs/nieuw.md': spec(SPEC_STREEF + 100) },
    );

    expect(await budget(root)).toStrictEqual([]);
    expect(await groei(root)).toStrictEqual([]);
  });

  test('leesbudget/AC-10 deel 6 zonder origin/main is een spec boven 10 KB ook geen overtreding', async () => {
    const pad = 'docs/specs/kaart.md';
    const root = repo({ [pad]: spec(SPEC_STREEF + 4000) }, { [pad]: spec(SPEC_STREEF + 5000) });
    git(root, 'update-ref', '-d', 'refs/remotes/origin/main');

    expect(await budget(root)).toStrictEqual([]);
    expect(await groei(root)).toStrictEqual([]);
  });

  test.each(['voorstel', 'goedgekeurd', 'gebouwd', 'vervallen'])(
    'leesbudget/AC-10 deel 6 een spec met status %s boven 10 KB is geen overtreding en telt in de meting',
    async (status) => {
      const pad = 'docs/specs/kaart.md';
      const root = repo({ [pad]: spec(SPEC_STREEF + 4000, status) });

      expect(await budget(root)).toStrictEqual([]);
      expect(specMeting(root, pad)?.boven).toBe(1);
    },
  );

  test('leesbudget/AC-10 deel 6 een oude spec-ingang in de baseline is opgelost: ratchet:update haalt hem weg', async () => {
    const pad = 'docs/specs/kaart.md';
    const root = repo({ [pad]: spec(SPEC_STREEF + 4000) });

    expect(compare([`docs:${pad}:budget`], await budget(root))).toStrictEqual({
      nieuw: [],
      opgelost: [`docs:${pad}:budget`],
    });
  });
});
