import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// Spec agent-recepten (leerpunt #893): een commando dat een agentinstructie of de receptenkaart voorschrijft, komt door het
// rolhek en door permissions.deny. Bewijstest van #893: alleen check-docs.mjs wordt geïmporteerd, dat ook op de basis bestaat.
const REPO = path.resolve(import.meta.dirname, '../..');
const GATES = readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8');
const SETTINGS = readFileSync(path.join(REPO, '.claude/settings.json'), 'utf8');
const ROOTS: string[] = [];

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

function repo(bestanden: Record<string, string | null>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-recept-rolhek-'));
  ROOTS.push(root);
  const basis: Record<string, string | null> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.claude/gates.json': GATES,
    '.claude/settings.json': SETTINGS,
  };
  for (const [file, content] of Object.entries({ ...basis, ...bestanden })) {
    if (content === null) continue;
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function found(bestanden: Record<string, string | null>) {
  return (await docsViolations(repo(bestanden))).filter((v) => v.key.startsWith('docs:recept-rolhek'));
}

const kaart = (cloud: string): string =>
  ['# Recepten', '', '| Taak | Lokaal | Cloud |', '|---|---|---|', `| Iets | \`git status\` | ${cloud} |`, ''].join(
    '\n',
  );

describe('agent-recepten: de template zelf', () => {
  test('agent-recepten/AC-1: geen melding op de eigen bestanden, en de kaart heeft de kerntaken', async () => {
    expect((await docsViolations(REPO)).filter((v) => v.key.startsWith('docs:recept-rolhek'))).toStrictEqual([]);
    // Eerst een assertie op de kaart: op de basis (leerpunt-bewijs) faalt de test zo rood, niet op een leesfout.
    expect(existsSync(path.join(REPO, 'docs/operations/recepten.md'))).toBe(true);
    const { receptRijen } = await import('../../scripts/kit/recepten.mjs');
    const taken = receptRijen(readFileSync(path.join(REPO, 'docs/operations/recepten.md'), 'utf8')).map(
      (rij) => rij.taak,
    );
    for (const taak of ['Commit', 'Push', 'PR openen', 'Log van een job', 'Is de PR gemerged', 'Leerpunt indienen'])
      expect(taken).toContain(taak);
    const rijen = receptRijen(readFileSync(path.join(REPO, 'docs/operations/recepten.md'), 'utf8'));
    for (const taak of ['Is de PR gemerged', 'Reviewopmerkingen', "Open PR's"])
      expect(rijen.find((rij) => rij.taak === taak)?.lokaal).toContain('--paginate');
  });
});

describe('agent-recepten: agentinstructies', () => {
  test('agent-recepten/AC-2: een geweigerde vorm in een skill en in een codeblok van een agent geeft een melding', async () => {
    const fout = await found({
      '.claude/skills/x/SKILL.md': 'Push met `git push -u origin HEAD`.\n',
      '.claude/agents/y.md': '# Y\n\n```bash\ngit push -u origin HEAD\n```\n',
    });
    expect(fout.map((v) => v.key).sort()).toStrictEqual([
      'docs:recept-rolhek:.claude/agents/y.md:git push -u origin HEAD',
      'docs:recept-rolhek:.claude/skills/x/SKILL.md:git push -u origin HEAD',
    ]);
    expect(fout[0]?.message).toContain('weigert het rolhek: Netwerkvorm');
    expect(fout.find((v) => v.key.includes('SKILL.md'))?.message).toContain('.claude/skills/x/SKILL.md:1:');
    expect(await found({ '.claude/skills/x/SKILL.md': 'Push met `git push origin HEAD`.\n' })).toStrictEqual([]);
  });

  test.each([
    'Nooit `gh pr merge 1`.',
    '`git push -u origin HEAD` weigert het rolhek.',
    'Regel `gh api *`.',
    'Zie `gh pr …`.',
    'Mergen via `pnpm pr:merge`.',
    'Dit is verboden:\n`git push -u origin HEAD`, ook in een branch.',
  ])('agent-recepten/AC-3: geen melding voor %j', async (zin) => {
    expect(await found({ '.claude/skills/x/SKILL.md': `${zin}\n` })).toStrictEqual([]);
  });

  test('agent-recepten/AC-3: buiten de agentinstructies geen melding; een codeblok kent geen uitzondering', async () => {
    expect(await found({ 'docs/operations/andere.md': 'Push met `git push -u origin HEAD`.\n' })).toStrictEqual([]);
    const fout = await found({ '.claude/skills/x/SKILL.md': 'Nooit dit:\n\n```bash\ngh pr merge 1\n```\n' });
    expect(fout.map((v) => v.key)).toStrictEqual(['docs:recept-rolhek:.claude/skills/x/SKILL.md:gh pr merge 1']);
  });

  test.each([
    'Push met `git push -u origin HEAD` als de branch nog geen upstream heeft.\n',
    '| Taak | Vorm |\n|---|---|\n| Push | `git push -u origin HEAD` |\n| Force | nooit |\n',
    '- Push met `git push -u origin HEAD`\n- Force nooit\n',
  ])('agent-recepten/AC-3: wel een melding voor %j', async (tekst) => {
    const fout = await found({ '.claude/skills/x/SKILL.md': tekst });
    expect(fout.map((v) => v.key)).toStrictEqual([
      'docs:recept-rolhek:.claude/skills/x/SKILL.md:git push -u origin HEAD',
    ]);
  });

  test('agent-recepten/AC-2: een codespan over twee regels telt als één commando; een melding per sleutel', async () => {
    const fout = await found({
      '.claude/skills/x/SKILL.md': 'Push met `git push -u\norigin HEAD`.\n\nNog eens: `git push -u origin HEAD`.\n',
    });
    expect(fout.map((v) => v.key)).toStrictEqual([
      'docs:recept-rolhek:.claude/skills/x/SKILL.md:git push -u origin HEAD',
    ]);
    expect(await found({ '.claude/skills/x/SKILL.md': 'Commit met `git commit\n-F <bestand>`.\n' })).toStrictEqual([]);
  });

  test('agent-recepten/AC-3: een kale pnpm-verwijzing in een codeblok heeft geen uitzondering', async () => {
    const fout = await found({ '.claude/skills/x/SKILL.md': '```bash\npnpm pr:merge\n```\n' });
    expect(fout.map((v) => v.key)).toStrictEqual(['docs:recept-rolhek:.claude/skills/x/SKILL.md:pnpm pr:merge']);
  });

  test('agent-recepten/AC-6: plaatshouders worden 1, in een vertrouwde ctx', async () => {
    expect(await found({ '.claude/skills/x/SKILL.md': 'Merge met `pnpm pr:merge <nr>`.\n' })).toStrictEqual([]);
  });

  test('agent-recepten/AC-6: zonder gates.json geen melding; ongeldige settings.json één melding', async () => {
    const skill = { '.claude/skills/x/SKILL.md': 'Push met `git push -u origin HEAD`.\n' };
    expect(await found({ ...skill, '.claude/gates.json': null })).toStrictEqual([]);
    const fout = await found({ ...skill, '.claude/settings.json': '{ kapot' });
    expect(fout.map((v) => v.key)).toStrictEqual(['docs:recept-rolhek:config']);
    expect(fout[0]?.message).toBe('.claude/settings.json: geen geldige JSON');
    const zonderTestpaden = GATES.replace('"testpaden":', '"testpadenWeg":');
    expect(await found({ ...skill, '.claude/gates.json': zonderTestpaden })).toStrictEqual([]);
  });
});

describe('agent-recepten: de kaart', () => {
  test('agent-recepten/AC-4: de kaart kent geen uitzondering voor een afwijzende zin', async () => {
    const fout = await found({ 'docs/operations/recepten.md': kaart('nooit `git push -u origin HEAD`') });
    expect(fout.map((v) => v.key)).toStrictEqual([
      'docs:recept-rolhek:docs/operations/recepten.md:git push -u origin HEAD',
    ]);
    expect(fout[0]?.message).toContain('docs/operations/recepten.md:5:');
  });

  test('agent-recepten/AC-4: een vorm die permissions.deny dekt, geeft een melding', async () => {
    const cmd = 'gh api "repos/{owner}/{repo}/commits/<sha>/check-runs" --jq .total_count';
    const fout = await found({ 'docs/operations/recepten.md': kaart(`\`${cmd}\``) });
    expect(fout.map((v) => v.message)).toStrictEqual([
      `docs/operations/recepten.md:5: \`${cmd}\` staat in permissions.deny van .claude/settings.json`,
    ]);
  });

  test('agent-recepten/AC-5: een endpoint met {owner} zonder aanhalingstekens geeft een melding', async () => {
    const kaal = "gh api repos/{owner}/{repo}/pulls/<nr>/comments --jq '.[].id'";
    const fout = await found({ 'docs/operations/recepten.md': kaart(`\`${kaal}\``) });
    expect(fout.map((v) => v.message)).toStrictEqual([
      `docs/operations/recepten.md:5: \`${kaal}\`: zet een endpoint met {owner} of {repo} tussen aanhalingstekens, anders draait gh api in de sandbox en geeft het 401`,
    ]);
    for (const aangehaald of [
      'gh api "repos/{owner}/{repo}/pulls/<nr>/comments" --jq \'.[].id\'',
      "gh api 'repos/{owner}/{repo}/pulls/<nr>/comments' --jq '.[].id'",
    ])
      expect(await found({ 'docs/operations/recepten.md': kaart(`\`${aangehaald}\``) })).toStrictEqual([]);
    expect((await found({ '.claude/skills/x/SKILL.md': `Lees \`${kaal}\`.\n` })).map((v) => v.message)).toStrictEqual([
      `.claude/skills/x/SKILL.md:1: \`${kaal}\`: zet een endpoint met {owner} of {repo} tussen aanhalingstekens, anders draait gh api in de sandbox en geeft het 401`,
    ]);
  });
});
