import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';

// Spec zonder-prompt (leerpunt #873): een claim "zonder prompt" op een commando buiten de sandbox klopt met allow, ask en deny.
const ROOTS: string[] = [];

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

interface Instellingen {
  allow?: string[];
  ask?: string[];
  deny?: string[];
  excluded?: string[];
  autoAllow?: boolean;
}

function settings(opties: Instellingen): string {
  return JSON.stringify({
    permissions: { allow: opties.allow ?? [], ask: opties.ask ?? [], deny: opties.deny ?? [] },
    sandbox: { autoAllowBashIfSandboxed: opties.autoAllow ?? true, excludedCommands: opties.excluded ?? [] },
  });
}

function repo(bestanden: Record<string, string>, settingsTekst: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-zonder-prompt-'));
  ROOTS.push(root);
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.claude/settings.json': settingsTekst,
    ...bestanden,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

async function found(bestanden: Record<string, string>, opties: Instellingen | string) {
  const tekst = typeof opties === 'string' ? opties : settings(opties);
  return (await docsViolations(repo(bestanden, tekst))).filter((v) => v.key.startsWith('docs:zonder-prompt'));
}

const GH = { excluded: ['gh api *'] };

test('zonder-prompt/AC-1: claim buiten de sandbox zonder allow faalt; met allow niet', async () => {
  const doc = { 'docs/framework.md': 'Hier draait `gh api *` zonder prompt.\n' };
  const fout = await found(doc, GH);

  expect(fout.map((v) => v.key)).toStrictEqual(['docs:zonder-prompt:docs/framework.md:gh api *']);
  expect(fout[0]?.message).toContain('staat niet in permissions.allow');
  expect(fout[0]?.message).toContain('docs/framework.md:1:');
  expect(await found(doc, { ...GH, allow: ['Bash(gh api *)'] })).toStrictEqual([]);
});

test('zonder-prompt/AC-2: gedekte opsomming is groen; een ask-treffer faalt', async () => {
  const doc = {
    'docs/framework.md': 'Plus `git commit`, `git push origin HEAD` en `pnpm pr:verify *` zonder prompt.\n',
  };
  const basis = {
    excluded: ['git commit *', 'git push origin HEAD', 'pnpm pr:verify *'],
    allow: ['Bash(git commit *)', 'Bash(git push origin HEAD)', 'Bash(pnpm pr:verify *)'],
  };

  expect(await found(doc, basis)).toStrictEqual([]);
  const fout = await found(doc, { ...basis, ask: ['Bash(pnpm pr:verify *)'] });

  expect(fout.map((v) => v.key)).toStrictEqual(['docs:zonder-prompt:docs/framework.md:pnpm pr:verify *']);
  expect(fout[0]?.message).toContain('staat in permissions.ask');
});

test('zonder-prompt/AC-2: een deny-treffer faalt, ook binnen de sandbox', async () => {
  const fout = await found({ 'AGENTS.md': '`docker compose up` zonder prompt.\n' }, { deny: ['Bash(docker *)'] });

  expect(fout[0]?.message).toContain('staat in permissions.deny');
});

test('zonder-prompt/AC-3: binnen de sandbox geen melding, behalve zonder autoAllowBashIfSandboxed', async () => {
  const doc = { 'docs/operations/x.md': '`git status --short` zonder prompt.\n' };

  expect(await found(doc, {})).toStrictEqual([]);
  expect((await found(doc, { autoAllow: false })).length).toBe(1);
});

test('zonder-prompt/AC-4: ADR telt alleen voorgesteld of geaccepteerd; spec en codeblok tellen niet', async () => {
  const adr = (status: string) => `# 0001\n\nStatus: ${status}\n\nDan draait \`gh api *\` zonder prompt.\n`;

  expect((await found({ 'docs/template/adr/0001-x.md': adr('geaccepteerd') }, GH)).length).toBe(1);
  expect((await found({ 'docs/adr/0001-x.md': adr('voorgesteld') }, GH)).length).toBe(1);
  expect(await found({ 'docs/template/adr/0002-x.md': adr('vervangen door 0001') }, GH)).toStrictEqual([]);
  expect(await found({ 'docs/template/specs/x.md': 'Dan `gh api *` zonder prompt.\n' }, GH)).toStrictEqual([]);
  const blok = { 'docs/framework.md': '```\n`gh api *` zonder prompt\n```\n' };

  expect(await found(blok, GH)).toStrictEqual([]);
  const lang = { 'docs/framework.md': '````\n```\n`gh api *` zonder prompt\n````\n' };

  expect(await found(lang, GH)).toStrictEqual([]);
});

test('zonder-prompt: codespan met dubbele backticks verbergt de claim erna niet', async () => {
  const doc = { 'docs/framework.md': 'Gebruik `` ` `` als teken. Dan draait `gh api *` zonder prompt.\n' };

  expect((await found(doc, GH)).length).toBe(1);
});

test('zonder-prompt: een commando tussen dubbele backticks telt ook als claim', async () => {
  const doc = { 'docs/framework.md': 'Dan draait ``gh api *`` zonder prompt.\n' };

  expect((await found(doc, GH)).map((v) => v.key)).toStrictEqual(['docs:zonder-prompt:docs/framework.md:gh api *']);
});

test('zonder-prompt: claim met wildcard tegen een smallere deny wordt letterlijk getoetst', async () => {
  const doc = { 'docs/framework.md': '`gh api *` zonder prompt.\n' };

  expect(await found(doc, { ...GH, allow: ['Bash(gh api *)'], deny: ['Bash(gh api *merge*)'] })).toStrictEqual([]);
});

test('zonder-prompt: zonder getrackte settings geen melding; zonder sandbox-sleutel telt alles als buiten', async () => {
  const root = repo({ 'docs/framework.md': '`gh api *` zonder prompt.\n' }, '{}');
  execFileSync('git', ['rm', '-q', '--cached', '.claude/settings.json'], { cwd: root });
  const zonder = (await docsViolations(root)).filter((v) => v.key.startsWith('docs:zonder-prompt'));

  expect(zonder).toStrictEqual([]);
  expect((await found({ 'docs/framework.md': '`git status --short` zonder prompt.\n' }, '{}')).length).toBe(1);
});

test.each([
  '`git commit *` en `gh api *` draaien buiten de sandbox, de eerste en `pr:verify` zonder prompt.',
  '`gh api *` volgens de regels; `git commit` zonder prompt.',
  'Het rolhek staat `gh api *` toe zonder prompt.',
  'Via hooks: `gh api *` zonder prompt.',
  '`gh api *` zonder prompttekens.',
  '`gh api *` draait zonder prompt.',
  'Gebruik `` ` `` als scheiding; met `gh api *` buiten de opsomming: `git commit` zonder prompt.',
  '`gh api *`\n\nzonder prompt na een witregel.',
  'Code `gh api * zonder prompt` telt niet.',
])('zonder-prompt/AC-5: geen claim in "%s"', async (zin) => {
  const opties = { excluded: ['gh api *', 'git commit *'], allow: ['Bash(git commit *)'] };

  expect(await found({ 'docs/framework.md': `${zin}\n` }, opties)).toStrictEqual([]);
});

test('zonder-prompt/AC-6: afgebroken claim meldt de regel van "zonder prompt"; kapotte JSON één melding', async () => {
  const fout = await found({ 'docs/framework.md': '# Kop\n\nEerst `gh api *`\nzonder prompt hier.\n' }, GH);

  expect(fout[0]?.message).toContain('docs/framework.md:4:');
  const kapot = await found({ 'docs/framework.md': 'x\n' }, '{ kapot');

  expect(kapot.map((v) => v.key)).toStrictEqual(['docs:zonder-prompt:settings']);
});

test('zonder-prompt/AC-7: de template zelf geeft geen melding', async () => {
  const root = path.resolve(import.meta.dirname, '../..');
  const violations = await docsViolations(root);

  expect(violations.filter((v) => v.key.startsWith('docs:zonder-prompt'))).toStrictEqual([]);
});
