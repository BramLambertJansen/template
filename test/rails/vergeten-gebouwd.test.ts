import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsKrimp, docsMeldingen, docsViolations } from '../../scripts/kit/check-docs.mjs';

// Spec gebouwd-zonder-nummer, AC-15 (leerpunt #756): `docsMeldingen` geeft "let op" als een PR een testregel toevoegt
// met een AC-id van een spec die nog goedgekeurd is (a), of van een AC die in een gebouwde spec nog
// `(nog niet gebouwd)` draagt (b). Nooit een overtreding: `docsViolations` en `docsKrimp` geven niets nieuws.
const root = path.resolve(import.meta.dirname, '../..');
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function git(cwd: string, ...args: string[]) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
}

/** Schrijft de bestanden; `null` verwijdert er een. */
function schrijf(dir: string, bestanden: Record<string, string | null>) {
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    if (inhoud === null) {
      rmSync(path.join(dir, pad), { force: true });
      continue;
    }
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
}

const SPEC = 'docs/template/specs/x.md';
const ANDERE = 'docs/template/specs/andere.md';
const TEST = 'test/x.test.ts';
const ACS = '- **xn/AC-1** — Een.\n- **xn/AC-2** (nog niet gebouwd) — Twee.\n- **xn/AC-3** (nog niet gebouwd) — Drie.';

function spec(status: string, acs = ACS, namespace = 'xn'): string {
  return `---\nstatus: ${status}\nnamespace: ${namespace}\n---\n\n# X\n\n## Hergebruik en UX\n\nNiets.\n\n## Acceptatiecriteria\n\n${acs}\n\n## Testplan\n\nTests.\n`;
}

const testRegels = (...ids: string[]) => ids.map((id) => `test('${id} doet iets', () => {});\n`).join('');

type Stand = {
  basis: Record<string, string>;
  head?: Record<string, string | null>;
  los?: Record<string, string>;
  commit?: boolean;
  zonderBasis?: boolean;
};
type Repo = { dir: string; voor: { violations: string[]; krimp: string[] } };

const sleutels = (lijst: readonly { key: string }[]) => lijst.map((violation) => violation.key);

/**
 * Een repo met `basis` gecommit als origin/main (behalve bij `zonderBasis`), daarna `head` in de werkmap (getrackt,
 * gecommit als `commit`) en `los` als niet-getrackte bestanden. `voor` is de stand van de overtredingen op de basis.
 */
async function repo(stand: Stand): Promise<Repo> {
  const dir = mkdtempSync(path.join(tmpdir(), 'vergeten-gebouwd-'));
  dirs.push(dir);
  schrijf(dir, { 'package.json': JSON.stringify({ scripts: {} }), 'src/leeg.ts': 'export {};\n', ...stand.basis });
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'basis');
  if (stand.zonderBasis !== true) git(dir, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  const voor = { violations: sleutels(await docsViolations(dir)), krimp: sleutels(await docsKrimp(dir)) };
  schrijf(dir, stand.head ?? {});
  git(dir, 'add', '-A');
  if (stand.commit === true) git(dir, 'commit', '-qm', 'werk');
  schrijf(dir, stand.los ?? {});
  return { dir, voor };
}

/** De meldingen van AC-15, en de toets dat docsViolations en docsKrimp niets nieuws geven. */
async function meldingen({ dir, voor }: Repo): Promise<string[]> {
  expect(sleutels(await docsViolations(dir)).filter((key) => !voor.violations.includes(key))).toStrictEqual([]);
  expect(sleutels(await docsKrimp(dir)).filter((key) => !voor.krimp.includes(key))).toStrictEqual([]);
  return (await docsMeldingen(dir)).filter((regel) => regel.includes('(R-WERK-08, ADR 0095)'));
}

const meldingA = (specpad: string, testpad: string, id: string) =>
  `let op: ${specpad} staat op goedgekeurd, maar ${testpad} voegt ${id} toe; maakt deze PR de spec af, zet dan status: gebouwd (R-WERK-08, ADR 0095)`;
const meldingB = (specpad: string, testpad: string, id: string) =>
  `let op: ${specpad} markeert ${id} nog met (nog niet gebouwd), maar ${testpad} voegt die AC toe; maakt deze PR de AC af, haal dan het merkteken weg (R-WERK-08, ADR 0095)`;

describe('gebouwd-zonder-nummer/AC-15: melding bij een vergeten status', { timeout: 60_000 }, () => {
  test('gebouwd-zonder-nummer/AC-15 (a) goedgekeurde spec, toegevoegde testregel: melding met de exacte tekst', async () => {
    const r = await repo({ basis: { [SPEC]: spec('goedgekeurd') }, head: { [TEST]: testRegels('xn/AC-2') } });
    expect(await meldingen(r)).toStrictEqual([meldingA(SPEC, TEST, 'xn/AC-2')]);
  });

  test('gebouwd-zonder-nummer/AC-15 (a) ook met diff.mnemonicPrefix of diff.noprefix in de gitconfig', async () => {
    for (const sleutel of ['diff.mnemonicPrefix', 'diff.noprefix']) {
      const r = await repo({ basis: { [SPEC]: spec('goedgekeurd') }, head: { [TEST]: testRegels('xn/AC-2') } });
      git(r.dir, 'config', sleutel, 'true');
      expect(await meldingen(r)).toStrictEqual([meldingA(SPEC, TEST, 'xn/AC-2')]);
    }
  });

  test('gebouwd-zonder-nummer/AC-15 (a) het voorvoegsel zoals de test het schrijft, de laagste AC, één regel', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd') },
      head: { [TEST]: testRegels('x/AC-3', 'x/AC-2', 'xn/AC-3') },
    });
    expect(await meldingen(r)).toStrictEqual([meldingA(SPEC, TEST, 'x/AC-2')]);
  });

  test('gebouwd-zonder-nummer/AC-15 (b) gebouwde spec, AC met merkteken: melding met de laagste AC die voldoet', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('gebouwd'), [TEST]: testRegels('xn/AC-1') },
      head: { [TEST]: testRegels('xn/AC-1') + testRegels('xn/AC-3', 'xn/AC-1', 'xn/AC-2', 'xn/AC-9') },
    });
    expect(await meldingen(r)).toStrictEqual([meldingB(SPEC, TEST, 'xn/AC-2')]);
  });

  test('gebouwd-zonder-nummer/AC-15 (b) ook met commentaar achter de status en met de specnaam als voorvoegsel', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('gebouwd # #12'), [TEST]: testRegels('xn/AC-1') },
      head: { 'test/y.test.ts': testRegels('x/AC-3') },
    });
    expect(await meldingen(r)).toStrictEqual([meldingB(SPEC, 'test/y.test.ts', 'x/AC-3')]);
  });

  test('gebouwd-zonder-nummer/AC-15 een gecommitte toevoeging op de branch telt ook', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd') },
      head: { [TEST]: testRegels('xn/AC-1') },
      commit: true,
    });
    expect(await meldingen(r)).toStrictEqual([meldingA(SPEC, TEST, 'xn/AC-1')]);
  });

  test('gebouwd-zonder-nummer/AC-15 een niet-getrackt testbestand telt met elke regel', async () => {
    const r = await repo({ basis: { [SPEC]: spec('goedgekeurd') }, los: { 'e2e/x.spec.ts': testRegels('xn/AC-1') } });
    expect(await meldingen(r)).toStrictEqual([meldingA(SPEC, 'e2e/x.spec.ts', 'xn/AC-1')]);
  });

  test('gebouwd-zonder-nummer/AC-15 per spec en testbestand één regel', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd'), [ANDERE]: spec('goedgekeurd', '- **andere/AC-1** — Een.', 'andere') },
      head: { [TEST]: testRegels('xn/AC-2', 'andere/AC-1', 'xn/AC-1'), 'test/y.test.ts': testRegels('xn/AC-3') },
    });
    expect((await meldingen(r)).toSorted()).toStrictEqual(
      [
        meldingA(SPEC, TEST, 'xn/AC-1'),
        meldingA(ANDERE, TEST, 'andere/AC-1'),
        meldingA(SPEC, 'test/y.test.ts', 'xn/AC-3'),
      ].toSorted(),
    );
  });
});

describe('gebouwd-zonder-nummer/AC-15: geen melding', { timeout: 60_000 }, () => {
  test('gebouwd-zonder-nummer/AC-15 gebouwde spec zonder merkteken op die AC', async () => {
    const r = await repo({ basis: { [SPEC]: spec('gebouwd') }, head: { [TEST]: testRegels('xn/AC-1') } });
    expect(await meldingen(r)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-15 de spec is in de werkmap gebouwd zonder merkteken', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd') },
      head: {
        [SPEC]: spec('gebouwd', ACS.replaceAll(' (nog niet gebouwd)', '')),
        [TEST]: testRegels('xn/AC-1', 'xn/AC-2', 'xn/AC-3'),
      },
    });
    expect(await meldingen(r)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-15 voorstel', async () => {
    const r = await repo({ basis: { [SPEC]: spec('voorstel') }, head: { [TEST]: testRegels('xn/AC-2') } });
    expect(await meldingen(r)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-15 het AC-id staat alleen in een ongewijzigde regel', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd'), [TEST]: testRegels('xn/AC-2') },
      head: { [TEST]: `${testRegels('xn/AC-2')}// andere regel\n` },
    });
    expect(await meldingen(r)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-15 het AC-id staat alleen in een verwijderde regel', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd'), [TEST]: `// kop\n${testRegels('xn/AC-2')}` },
      head: { [TEST]: '// kop\n' },
    });
    expect(await meldingen(r)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-15 een hernoemd testbestand zonder inhoudswijziging', async () => {
    const inhoud = `// kop\n${testRegels('xn/AC-2', 'xn/AC-3')}// staart\n`;
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd'), [TEST]: inhoud },
      head: { [TEST]: null, 'test/hernoemd.test.ts': inhoud },
    });
    expect(await meldingen(r)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-15 een AC-id van een spec die niet voldoet, of geen heel woord', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd'), [ANDERE]: spec('voorstel', '- **andere/AC-1** — Een.', 'andere') },
      head: { [TEST]: testRegels('andere/AC-1', 'onbekend/AC-1', 'iets/xn/AC-1', 'y.xn/AC-1', 'xn/AC-1x', 'AC-2') },
    });
    expect(await meldingen(r)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-15 een regel buiten een testbestand', async () => {
    const r = await repo({ basis: { [SPEC]: spec('goedgekeurd') }, head: { 'docs/notitie.md': 'xn/AC-1\n' } });
    expect(await meldingen(r)).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-15 geen merge-base', async () => {
    const r = await repo({
      basis: { [SPEC]: spec('goedgekeurd') },
      head: { [TEST]: testRegels('xn/AC-1') },
      los: { 'test/los.test.ts': testRegels('xn/AC-2') },
      zonderBasis: true,
    });
    expect(await meldingen(r)).toStrictEqual([]);
  });
});

describe('gebouwd-zonder-nummer/AC-15: de module', () => {
  test('gebouwd-zonder-nummer/AC-15 los gedraaid verwijst vergeten-gebouwd naar pnpm ratchet', () => {
    const result = spawnSync(process.execPath, ['scripts/kit/vergeten-gebouwd.mjs'], { cwd: root, encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('vergeten-gebouwd');
    expect(result.stderr).toContain('pnpm ratchet');
  });
});
