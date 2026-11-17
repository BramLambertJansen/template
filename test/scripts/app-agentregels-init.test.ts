import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { planAppInit } from '../../scripts/kit/app-init.mjs';
import { ROOT, draai, git, nieuweMap, schrijf } from './app-padtabel-fixture';
import { STUB, TEMPLATE_BESTANDEN, skelet } from './app-agentregels-kit';

// app-agentregels/AC-1 (docs/template/specs/app-agentregels.md): `planAppInit` op een templatekopie levert een rij voor
// `docs/app.md` met precies het skelet uit het Ontwerp en de opgegeven naam in de kop; `--dry-run` noemt het pad en schrijft
// niets.
const dirs: string[] = [];
const options = { slug: 'urenregistratie', name: 'Urenregistratie', sha: 'abc1234' };
// De modules die het script als CLI nodig heeft.
const MODULES = [
  'scripts/kit/app-init.mjs',
  'scripts/kit/codeowners.mjs',
  'rails/hooks/lib/padtabel.mjs',
  'src/core/shared/template-version.ts',
];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function kopie(): string {
  const dir = nieuweMap('app-agentregels-init-', dirs);
  schrijf(dir, { ...TEMPLATE_BESTANDEN });
  return dir;
}

/** Een gekoppelde app-repo vlak voor app:init: de template-invoer, het script zelf en de ref template/main. */
function repo(): string {
  const dir = kopie();
  for (const file of MODULES) {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    cpSync(path.join(ROOT, file), path.join(dir, file));
  }
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'template');
  git(dir, 'update-ref', 'refs/remotes/template/main', 'HEAD');
  return dir;
}

function cli(dir: string, ...args: string[]) {
  return draai(dir, [process.execPath, 'scripts/kit/app-init.mjs', 'urenregistratie', 'Urenregistratie', ...args]);
}

const rij = (plan: { pad: string; inhoud: string }[]) => plan.filter((change) => change.pad === 'docs/app.md');

describe('app-agentregels/AC-1 app:init schrijft het skelet van docs/app.md', () => {
  test('app-agentregels/AC-1: het plan heeft één rij voor docs/app.md met precies het skelet en de app-naam in de kop', () => {
    const plan = planAppInit(kopie(), options);

    expect(rij(plan)).toStrictEqual([{ pad: 'docs/app.md', inhoud: skelet('Urenregistratie') }]);
  });

  test('app-agentregels/AC-1: de opgegeven naam staat letterlijk in de kop, ook met een quote of een ampersand', () => {
    const plan = planAppInit(kopie(), { ...options, name: "Jan's Uren & Co" });

    expect(rij(plan).map((change) => change.inhoud.split('\n')[0])).toStrictEqual(["# Jan's Uren & Co"]);
    expect(rij(plan).map((change) => change.inhoud)).toStrictEqual([skelet("Jan's Uren & Co")]);
  });

  test('app-agentregels/AC-1: het skelet hangt niet af van wat er al in docs/app.md staat (ook zonder het bestand)', () => {
    const dir = kopie();
    rmSync(path.join(dir, 'docs/app.md'));

    expect(rij(planAppInit(dir, options))).toStrictEqual([{ pad: 'docs/app.md', inhoud: skelet('Urenregistratie') }]);
  });

  test('app-agentregels/AC-1: --dry-run noemt docs/app.md in de vorm van de andere bestanden en schrijft niets', () => {
    const dir = repo();

    const uit = cli(dir, '--dry-run');

    expect(uit.status, `${uit.stdout}\n${uit.stderr}`).toBe(0);
    expect(uit.stdout.split('\n')).toContain('(dry-run) ✓ docs/app.md');
    expect(uit.stdout.split('\n')).toContain('(dry-run) ✓ package.json');
    expect(git(dir, 'status', '--porcelain')).toBe('');
    expect(readFileSync(path.join(dir, 'docs/app.md'), 'utf8')).toBe(STUB);
  });

  test('app-agentregels/AC-1: zonder --dry-run herschrijft de CLI de stub met het skelet', () => {
    const dir = repo();

    const uit = cli(dir);

    expect(uit.status, `${uit.stdout}\n${uit.stderr}`).toBe(0);
    expect(uit.stdout.split('\n')).toContain('✓ docs/app.md');
    expect(readFileSync(path.join(dir, 'docs/app.md'), 'utf8')).toBe(skelet('Urenregistratie'));
  });
});
