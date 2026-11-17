import { readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { planAppInit } from '../../scripts/kit/app-init.mjs';
import { draai, git, nieuweMap, schrijf } from './app-padtabel-fixture';
import { IN_TE_VULLEN, STUB, TEMPLATE_BESTANDEN, skelet } from './app-agentregels-kit';

// app-agentregels/AC-4 (docs/template/specs/app-agentregels.md): een app begint met de uitvoer van `app:init` en vult daarna
// `docs/app.md` in. De template wijzigt `CLAUDE.md`, `AGENTS.md` en een bestand onder `.claude/rules/`, en de app doet
// `git merge template/main`: geen conflict, `docs/app.md` ongewijzigd, de drie templatebestanden met de nieuwe inhoud. De
// app-geschiedenis heeft de templatecommit met de stub als voorouder (een kloon), zoals na de koppeling.
const dirs: string[] = [];
const options = { slug: 'urenregistratie', name: 'Urenregistratie', sha: 'abc1234' };
const AGENTREGELS = ['CLAUDE.md', 'AGENTS.md', '.claude/rules/api.md'];
const OUD: Record<string, string> = {
  'CLAUDE.md': '@AGENTS.md\n@docs/app.md\n\nAanvullingen voor Claude Code.\n',
  'AGENTS.md': '# AGENTS.md\n\n## Regels\n\n- Regel één.\n',
  '.claude/rules/api.md': '# API\n\n- Route via defineRoute.\n',
};
const NIEUW: Record<string, string> = {
  'CLAUDE.md': '@AGENTS.md\n@docs/app.md\n\nAanvullingen voor Claude Code.\n\n## Zuinig met context\n\n- Nieuw.\n',
  'AGENTS.md': '# AGENTS.md\n\n## Regels\n\n- Regel één, aangescherpt.\n- Regel twee.\n',
  '.claude/rules/api.md': '# API\n\n- Route via defineRoute of definePartnerRoute.\n',
};
const INGEVULD = skelet('Urenregistratie').replace(IN_TE_VULLEN, 'Urenregistratie voor een bureau van tien mensen.');

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const lees = (dir: string, rel: string) => readFileSync(path.join(dir, rel), 'utf8');

interface Samenvoeging {
  app: string;
  naInit: string;
  merge: { status: number | null; stderr: string; stdout: string };
  ongemerged: string[];
}

/** Template (basis, daarna de agentregels gewijzigd) en app (app:init, docs/app.md ingevuld), dan de merge in de app. */
function bouw(): Samenvoeging {
  const template = nieuweMap('app-agentregels-template-', dirs);
  git(template, 'init', '-q', '-b', 'main');
  schrijf(template, { ...TEMPLATE_BESTANDEN, ...OUD });
  git(template, 'add', '-A');
  git(template, 'commit', '-q', '-m', 'template: basis');

  const app = path.join(nieuweMap('app-agentregels-app-', dirs), 'app');
  git(template, 'clone', '-q', '-o', 'template', template, app);
  schrijf(app, Object.fromEntries(planAppInit(app, options).map(({ pad, inhoud }) => [pad, inhoud])));
  const naInit = lees(app, 'docs/app.md');
  git(app, 'add', '-A');
  git(app, 'commit', '-q', '-m', 'chore: rename to urenregistratie');
  schrijf(app, { 'docs/app.md': INGEVULD });
  git(app, 'commit', '-q', '-am', 'docs: describe the app');

  schrijf(template, NIEUW);
  git(template, 'commit', '-q', '-am', 'template: agentregels');
  git(app, 'fetch', '-q', 'template');
  const merge = draai(app, ['git', 'merge', '--no-edit', 'template/main']);
  const ongemerged = git(app, 'diff', '--name-only', '--diff-filter=U').split('\n').filter(Boolean);
  return { app, naInit, merge, ongemerged };
}

describe('app-agentregels/AC-4 een template-update in een app met een ingevulde docs/app.md', () => {
  test('app-agentregels/AC-4: de app begint met het skelet van app:init, niet met de stub', () => {
    const { naInit } = bouw();

    expect(INGEVULD).not.toBe(skelet('Urenregistratie'));
    expect(naInit).not.toBe(STUB);
    expect(naInit).toBe(skelet('Urenregistratie'));
  });

  test('app-agentregels/AC-4: git merge template/main geeft geen conflict', () => {
    const { app, merge, ongemerged } = bouw();

    expect(merge.status, `${merge.stdout}\n${merge.stderr}`).toBe(0);
    expect(ongemerged).toStrictEqual([]);
    expect(git(app, 'status', '--porcelain')).toBe('');
    expect(git(app, 'rev-list', '--parents', '-n', '1', 'HEAD').split(' ')).toHaveLength(3);
  });

  test('app-agentregels/AC-4: docs/app.md is na de merge ongewijzigd', () => {
    const { app } = bouw();

    expect(lees(app, 'docs/app.md')).toBe(INGEVULD);
    expect(git(app, 'diff', '--name-only', 'HEAD~1', 'HEAD').split('\n').toSorted()).toStrictEqual(
      [...AGENTREGELS].toSorted(),
    );
  });

  test.each(AGENTREGELS)('app-agentregels/AC-4: %s heeft na de merge de nieuwe inhoud van de template', (bestand) => {
    const { app } = bouw();

    expect(NIEUW[bestand]).not.toBe(OUD[bestand]);
    expect(lees(app, bestand)).toBe(NIEUW[bestand]);
  });
});
