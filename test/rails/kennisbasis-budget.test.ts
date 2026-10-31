import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// compacte-kennisbasis-rails/AC-9 (ADR 0063 punt 3): budgetten als ratchet in `check-docs`, in bytes (1 KB = 1024):
// AGENTS.md <= 100 regels en 9 KB, framework.md <= 40 KB, een nieuwe spec <= 10 KB, een nieuw ADR <= 6 KB. Bestaande
// overschrijdingen staan in een baseline die alleen omlaag mag: groei, krimp (de baseline blijft te ruim) en een handmatig
// te ruime baselinewaarde zijn rood. Twee soorten tests: `docsViolations` op een fixture (wat komt erbij) en de echte
// `scripts/kit/ratchet.mjs` op een fixture met zijn eigen baseline (zodat het baselineformaat niet vastligt).
const RATCHET = path.resolve('scripts/kit/ratchet.mjs');
const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function repo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'kennisbasis-budget-'));
  directories.push(root);
  const all = {
    'package.json': JSON.stringify({ scripts: {} }),
    'src/leeg.ts': 'export {};\n',
    '.kit/baseline.json': '{}\n',
    ...files,
  };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

/** Een tekst van precies `bytes` bytes (ASCII) in `regels` regels, elk afgesloten met een regeleinde. */
function tekst(bytes: number, regels = 1): string {
  const per = Math.floor(bytes / regels);
  const rest = bytes - per * regels;
  return Array.from({ length: regels }, (_r, index) => `${'x'.repeat(per - 1 + (index === 0 ? rest : 0))}\n`).join('');
}

/** De meldingen die `files` toevoegt aan een lege repo, voor het bestand `file`. */
async function budgetMeldingen(file: string, inhoud: string): Promise<{ key: string; message: string }[]> {
  const meldingen = await docsViolations(repo({ [file]: inhoud }));
  return meldingen.filter(({ key, message }) => key.includes(file) || message.includes(file));
}

const KB = 1024;
const SPEC_KOP = (naam: string): string => `---\nstatus: voorstel\nnamespace: ${naam}\n---\n\n`;
const adrKop = (nr: string): string => `# ${nr} — Demo\n\nStatus: voorgesteld\n\n`;

describe('compacte-kennisbasis-rails/AC-9: budgetten in bytes (1 KB = 1024)', () => {
  test('compacte-kennisbasis-rails/AC-9 AGENTS.md op precies 9 KB (9216 bytes) en 100 regels: groen', async () => {
    expect(await budgetMeldingen('AGENTS.md', tekst(9 * KB, 100))).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-9 AGENTS.md van 9 KB + 1 byte: rood en het bestand wordt genoemd', async () => {
    const meldingen = await budgetMeldingen('AGENTS.md', tekst(9 * KB + 1, 100));
    expect(meldingen).toHaveLength(1);
    expect(meldingen[0]?.message).toContain('AGENTS.md');
  });

  test('compacte-kennisbasis-rails/AC-9 AGENTS.md met 101 regels (onder 9 KB): rood', async () => {
    expect(await budgetMeldingen('AGENTS.md', tekst(2000, 101))).toHaveLength(1);
  });

  test('compacte-kennisbasis-rails/AC-9 AGENTS.md met 100 regels onder 9 KB: groen', async () => {
    expect(await budgetMeldingen('AGENTS.md', tekst(2000, 100))).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-9 AGENTS.md van 9100 bytes: groen (het budget is 9216, geen 9000)', async () => {
    expect(await budgetMeldingen('AGENTS.md', tekst(9100, 100))).toStrictEqual([]);
  });

  test('compacte-kennisbasis-rails/AC-9 docs/framework.md op precies 40 KB (40960 bytes): groen', async () => {
    expect(await budgetMeldingen('docs/framework.md', tekst(40 * KB))).toStrictEqual([]);
  });

  // Eigenaarbesluit: de sleutels passen bij `compare()` en dragen de waarde.
  test('compacte-kennisbasis-rails/AC-9 sleutelvorm: docs:<bestand>:budget:<bytes> en docs:AGENTS.md:regels:<n>', async () => {
    const groot = await docsViolations(repo({ 'docs/framework.md': tekst(40 * KB + 7) }));
    expect(groot.map(({ key }) => key)).toContain(`docs:docs/framework.md:budget:${String(40 * KB + 7)}`);
    const regels = await docsViolations(repo({ 'AGENTS.md': tekst(2000, 101) }));
    expect(regels.map(({ key }) => key)).toContain('docs:AGENTS.md:regels:101');
  });

  test('compacte-kennisbasis-rails/AC-9 docs/framework.md van 40 KB + 1 byte: rood en het bestand wordt genoemd', async () => {
    const meldingen = await budgetMeldingen('docs/framework.md', tekst(40 * KB + 1));
    expect(meldingen).toHaveLength(1);
    expect(meldingen[0]?.message).toContain('docs/framework.md');
  });

  test('compacte-kennisbasis-rails/AC-9 een spec op precies 10 KB (10240 bytes): groen', async () => {
    const kop = SPEC_KOP('groot');
    expect(await budgetMeldingen('docs/specs/groot.md', kop + tekst(10 * KB - Buffer.byteLength(kop)))).toStrictEqual(
      [],
    );
  });

  test('compacte-kennisbasis-rails/AC-9 een spec van 10 KB + 1 byte: rood en het bestand wordt genoemd', async () => {
    const kop = SPEC_KOP('groot');
    const meldingen = await budgetMeldingen('docs/specs/groot.md', kop + tekst(10 * KB + 1 - Buffer.byteLength(kop)));
    expect(meldingen).toHaveLength(1);
    expect(meldingen[0]?.message).toContain('docs/specs/groot.md');
  });

  test('compacte-kennisbasis-rails/AC-9 een ADR op precies 6 KB (6144 bytes): groen', async () => {
    const kop = adrKop('0070');
    expect(await budgetMeldingen('docs/adr/0070-groot.md', kop + tekst(6 * KB - Buffer.byteLength(kop)))).toStrictEqual(
      [],
    );
  });

  test('compacte-kennisbasis-rails/AC-9 een ADR van 6 KB + 1 byte: rood en het bestand wordt genoemd', async () => {
    const kop = adrKop('0070');
    const meldingen = await budgetMeldingen('docs/adr/0070-groot.md', kop + tekst(6 * KB + 1 - Buffer.byteLength(kop)));
    expect(meldingen).toHaveLength(1);
    expect(meldingen[0]?.message).toContain('docs/adr/0070-groot.md');
  });
});

describe('compacte-kennisbasis-rails/AC-9: de ratchet is strikt in twee richtingen', { timeout: 60_000 }, () => {
  function ratchet(root: string, ...args: string[]): { status: number | null; stderr: string; stdout: string } {
    const { status, stderr, stdout } = spawnSync(process.execPath, [RATCHET, ...args], { cwd: root, encoding: 'utf8' });
    return { status, stderr, stdout };
  }

  const BASELINE = '.kit/baseline.json';
  const OVER = tekst(40 * KB + 500);

  /** Een repo met een te groot regelboek, en een baseline die precies die overschrijding kent. */
  function metBaseline(): string {
    const root = repo({ 'docs/framework.md': OVER });
    const update = ratchet(root, '--update');
    expect(update.status, update.stderr).toBe(0);
    return root;
  }

  test('compacte-kennisbasis-rails/AC-9 een bestaande overschrijding in de baseline, ongewijzigd: groen', () => {
    const root = metBaseline();
    const uitslag = ratchet(root);
    expect(uitslag.stderr).toBe('');
    expect(uitslag.status).toBe(0);
  });

  test('compacte-kennisbasis-rails/AC-9 een overschrijding zonder baseline-ingang: rood', () => {
    const root = repo({ 'docs/framework.md': tekst(1000) });
    expect(ratchet(root, '--update').status).toBe(0);
    writeFileSync(path.join(root, 'docs/framework.md'), OVER);
    const uitslag = ratchet(root);
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain('docs/framework.md');
  });

  test('compacte-kennisbasis-rails/AC-9 groei van een bestaande overschrijding met 1 byte: rood', () => {
    const root = metBaseline();
    writeFileSync(path.join(root, 'docs/framework.md'), tekst(40 * KB + 501));
    const uitslag = ratchet(root);
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain('docs/framework.md');
  });

  test('compacte-kennisbasis-rails/AC-9 krimp van een bestaande overschrijding met 1 byte zonder baseline-update: rood', () => {
    const root = metBaseline();
    writeFileSync(path.join(root, 'docs/framework.md'), tekst(40 * KB + 499));
    expect(ratchet(root).status).toBe(1);
  });

  test('compacte-kennisbasis-rails/AC-9 krimp tot onder het budget zonder baseline-update: rood', () => {
    const root = metBaseline();
    writeFileSync(path.join(root, 'docs/framework.md'), tekst(1000));
    expect(ratchet(root).status).toBe(1);
  });

  test('compacte-kennisbasis-rails/AC-9 een te ruime waarde in de baseline (de grootte opgehoogd): rood', () => {
    const root = metBaseline();
    const bestand = path.join(root, BASELINE);
    const ruim = readFileSync(bestand, 'utf8').replaceAll(String(40 * KB + 500), String(40 * KB + 5000));
    expect(ruim).not.toBe(readFileSync(bestand, 'utf8'));
    writeFileSync(bestand, ruim);
    expect(ratchet(root).status).toBe(1);
  });

  // Een ADR heeft een sleutel op nummer, ook in het archief: een byte-gelijke verhuizing laat de baseline ongemoeid.
  test('compacte-kennisbasis-rails/AC-9 een te groot ADR uit de baseline verhuist byte-gelijk naar archief/: groen', () => {
    const groot = adrKop('0050') + tekst(7 * KB);
    const root = repo({ 'docs/adr/0050-groot.md': groot });
    expect(ratchet(root, '--update').status).toBe(0);
    const baseline = readFileSync(path.join(root, BASELINE), 'utf8');
    expect(baseline).toContain(`docs:adr:0050:budget:${String(Buffer.byteLength(groot))}`);
    mkdirSync(path.join(root, 'docs/adr/archief'), { recursive: true });
    execFileSync('git', ['mv', 'docs/adr/0050-groot.md', 'docs/adr/archief/0050-groot.md'], { cwd: root });
    const uitslag = ratchet(root);
    expect(uitslag.stderr).toBe('');
    expect(uitslag.status).toBe(0);
    expect(readFileSync(path.join(root, BASELINE), 'utf8')).toBe(baseline);
  });

  test('compacte-kennisbasis-rails/AC-9 een te groot ADR alleen in archief/, niet in de baseline: rood', () => {
    const root = repo({ 'docs/adr/0040-klein.md': `${adrKop('0040')}Kort.\n` });
    expect(ratchet(root, '--update').status).toBe(0);
    mkdirSync(path.join(root, 'docs/adr/archief'), { recursive: true });
    writeFileSync(path.join(root, 'docs/adr/archief/0050-groot.md'), adrKop('0050') + tekst(7 * KB));
    execFileSync('git', ['add', '-A'], { cwd: root });
    const uitslag = ratchet(root);
    expect(uitslag.status).toBe(1);
    expect(uitslag.stderr).toContain('docs/adr/archief/0050-groot.md');
  });

  test('compacte-kennisbasis-rails/AC-9 binnen alle budgetten en een lege baseline: groen', () => {
    const root = repo({ 'docs/framework.md': tekst(1000), 'AGENTS.md': tekst(1000, 50) });
    expect(ratchet(root, '--update').status).toBe(0);
    const uitslag = ratchet(root);
    expect(uitslag.stderr).toBe('');
    expect(uitslag.status).toBe(0);
  });
});
