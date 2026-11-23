import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { docsKrimp, docsViolations } from '../../scripts/kit/check-docs.mjs';

// docs/specs/specarchief-en-bouwvorm.md (ADR 0080): `check-docs` (docsViolations) op echte, tijdelijke git-repositories.
// Links vanuit en naar het specarchief (AC-4), een naam in beide mappen (AC-5), het AC-verlies van regel 6 (AC-7, ADR 0104) en de oude statusvorm met SHA (AC-11). Vorm van archief-spec-links en archief-check-docs.
const mappen: string[] = [];

beforeEach(() => {
  vi.stubEnv('GITHUB_ACTIONS', 'false');
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const map of mappen.splice(0)) rmSync(map, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'specarchief-check-docs-'));
  mappen.push(root);
  const all = { 'package.json': JSON.stringify({ scripts: {} }), ...files };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function meldingen(files: Record<string, string>): Promise<string[]> {
  return (await docsViolations(repo(files))).map(({ message }) => message);
}

/** De linkmeldingen ("wijst naar niets") over `file`. */
async function linkMeldingen(files: Record<string, string>, file: string): Promise<string[]> {
  return (await meldingen(files)).filter(
    (message) => message.startsWith(`${file}:`) && message.includes('wijst naar niets'),
  );
}

const SHA = 'a'.repeat(40);
const ADR = { 'docs/adr/0001-demo.md': '# 0001 — Demo\n\nStatus: geaccepteerd\n' };

function spec(status: string, naam = 'a', regels: string[] = []): string {
  return [
    '---',
    `status: ${status}`,
    `namespace: ${naam}`,
    '---',
    '',
    `# Spec ${naam}`,
    '',
    '## Hergebruik en UX',
    '',
    'Bestaande kit.',
    '',
    ...regels,
    '',
  ].join('\n');
}

const GEARCHIVEERD = { 'docs/specs/archief/a.md': spec('vervallen') };

describe('specarchief-en-bouwvorm/AC-4: links lossen op naar het specarchief', () => {
  test('specarchief-en-bouwvorm/AC-4 een link ../adr/<adr>.md in een gearchiveerde spec: groen', async () => {
    const file = 'docs/specs/archief/a.md';
    const files = { ...ADR, [file]: spec('vervallen', 'a', ['Zie [0001](../adr/0001-demo.md).']) };
    expect(await linkMeldingen(files, file)).toStrictEqual([]);
  });

  test('specarchief-en-bouwvorm/AC-4 een link a.md in een gebouwde spec naar een gearchiveerde a.md: groen', async () => {
    const file = 'docs/specs/b.md';
    const files = { ...GEARCHIVEERD, [file]: spec('gebouwd # #120', 'b', ['Zie [a](a.md).']) };
    expect(await linkMeldingen(files, file)).toStrictEqual([]);
  });

  test('specarchief-en-bouwvorm/AC-4 een link ../specs/a.md vanuit een ADR naar een gearchiveerde a.md: groen', async () => {
    const file = 'docs/adr/0002-ander.md';
    const files = { ...GEARCHIVEERD, [file]: '# 0002 — Ander\n\nStatus: geaccepteerd\n\nZie [a](../specs/a.md).\n' };
    expect(await linkMeldingen(files, file)).toStrictEqual([]);
  });

  test.each([
    ['docs/operations/demo.md', '# Demo\n\nZie [a](../specs/a.md).\n'],
    ['README.md', '# Demo\n\nZie [a](docs/specs/a.md).\n'],
  ])('specarchief-en-bouwvorm/AC-4 een link naar die a.md vanuit %s: rood', async (file, tekst) => {
    expect(await linkMeldingen({ ...GEARCHIVEERD, [file]: tekst }, file)).toHaveLength(1);
  });
});

describe('specarchief-en-bouwvorm/AC-5: een naam uit het archief komt niet terug', () => {
  test('specarchief-en-bouwvorm/AC-5 verschillende namen in beide mappen: geen melding over het archief', async () => {
    const lijst = await meldingen({ ...GEARCHIVEERD, 'docs/specs/b.md': spec('voorstel', 'b') });
    expect(lijst.filter((message) => message.includes('archief'))).toStrictEqual([]);
  });
});

// ADR 0104: het merkteken `(nog niet gebouwd)` vervalt; een AC zonder test is vanzelf niet gebouwd. Regel 6 is een ratchet
// tegenover de merge-base: alleen het verlies van een AC die op main gebouwd was, is rood. Een nieuwe AC zonder test is dat
// niet, ook niet zonder markering.
describe('specarchief-en-bouwvorm/AC-7: regel 6 telt alleen het verlies van een gebouwde AC', () => {
  const TEST = { 'test/demo.test.ts': "test('demo/AC-1 werkt', () => {});\n" };
  const SPEC = 'docs/specs/demo.md';
  const acs = [
    '## Acceptatiecriteria',
    '',
    '- **demo/AC-1** — Gegeven iets, dan iets.',
    '- **demo/AC-2** — Gegeven meer, dan meer.',
  ];

  /** Basis (origin/main): spec met AC-1 en AC-2 en een test voor AC-1; head: `head` (null verwijdert). */
  const verlies = async (head: Record<string, string | null>): Promise<string[]> => {
    const root = repo({ ...TEST, [SPEC]: spec('goedgekeurd', 'demo', acs) });
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'basis'], { cwd: root });
    execFileSync('git', ['update-ref', 'refs/remotes/origin/main', 'HEAD'], { cwd: root });
    for (const [file, inhoud] of Object.entries(head)) {
      if (inhoud === null) rmSync(path.join(root, file), { force: true });
      else writeFileSync(path.join(root, file), inhoud);
    }
    execFileSync('git', ['add', '-A'], { cwd: root });
    return (await docsKrimp(root))
      .map(({ message }) => message)
      .filter((message) => message.startsWith(`${SPEC}: AC-`));
  };

  test('specarchief-en-bouwvorm/AC-7 een AC zonder test die nooit gebouwd was (AC-2), zonder markering: groen', async () => {
    expect(await verlies({})).toStrictEqual([]);
  });

  test('specarchief-en-bouwvorm/AC-7 de gebouwde AC-1 verliest zijn test: rood, de ongebouwde AC-2 niet', async () => {
    const lijst = await verlies({ 'test/demo.test.ts': null });
    expect(lijst).toHaveLength(1);
    expect(lijst[0]).toMatch(/^docs\/specs\/demo\.md: AC-1 was gebouwd op main/);
  });
});

describe('specarchief-en-bouwvorm/AC-11: check-docs weigert de oude vorm met SHA in docs/specs/', () => {
  test('specarchief-en-bouwvorm/AC-11 gebouwd # #N; gevalideerd: <sha> in docs/specs/: rood met de melding', async () => {
    const lijst = await meldingen({ 'docs/specs/a.md': spec(`gebouwd # #130; gevalideerd: ${SHA}`) });
    expect(
      lijst.filter((message) => message.startsWith('docs/specs/a.md: statusregel met gevalideerd: ')),
    ).toHaveLength(1);
    expect(lijst.join('\n')).toMatch(
      /^docs\/specs\/a\.md: statusregel met gevalideerd: .+; schrijf status: gebouwd # #.+ \(ADR 0080\)$/m,
    );
  });

  test('specarchief-en-bouwvorm/AC-11 gebouwd # #N zonder SHA: geen melding over gevalideerd', async () => {
    const lijst = await meldingen({ 'docs/specs/a.md': spec('gebouwd # #130') });
    expect(lijst.filter((message) => message.includes('gevalideerd'))).toStrictEqual([]);
  });
});
