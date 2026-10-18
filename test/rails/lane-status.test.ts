import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { draaiChecker, git, maakRepo, opruimen, read, write, type Fixture } from '../hooks/follow-up-kit';

// ADR 0029 punt 3 en 7: een statusovergang in de PR zelf is geldig in de feature-lane en in de framework-lane, mits de
// commit die de statusregel zette alleen statusregels wijzigt (a), er geen inhoud na de status komt (b) en de committer
// GitHub web-flow is (c). Echte tijdelijke repositories; de checker draait zoals guard.yml hem draait, met main als basis.
afterEach(opruimen);

const MINI = 'docs/specs/demo.md';
const ADR = 'docs/adr/0099-demo.md';
const WEB = 'src/web/features/demo/page.tsx';
const ROUTE = 'src/api/routes/demo.ts';
const TEST = 'src/api/routes/demo.test.ts';

function spec(naam: string, status: string, mini: boolean): string {
  const sjabloon = mini ? 'sjabloon: mini\n' : '';
  return `---\nstatus: ${status}\nnamespace: ${naam}\n${sjabloon}---\n\n# Spec ${naam}\n\n## Hergebruik en UX\n\nBestaande kit.\n`;
}

const adr = (status: string): string => `# 0099 — Demo\n\nStatus: ${status}\n\n## Besluit\n\nIets.\n`;

function commitAls(root: string, message: string, committer: 'agent' | 'web-flow'): string {
  git(root, ['add', '-A']);
  const naam = committer === 'web-flow' ? 'GitHub' : 'Test';
  const mail = committer === 'web-flow' ? 'noreply@github.com' : 'test@example.test';
  execFileSync('git', ['commit', '-q', '-m', message], {
    cwd: root,
    stdio: 'ignore',
    env: {
      ...process.env,
      GIT_COMMITTER_NAME: naam,
      GIT_COMMITTER_EMAIL: mail,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.test',
    },
  });
  return git(root, ['rev-parse', 'HEAD']);
}

function nieuw(): Fixture {
  const fixture = maakRepo({ specs: [], mandaat: [], roadmap: [] });
  write(fixture.root, 'src/api/routes/oud.test.ts', "test('oud', () => {});\n");
  git(fixture.root, ['add', '-A']);
  git(fixture.root, ['commit', '-q', '-m', 'test: bestaande test']);
  const base = git(fixture.root, ['rev-parse', 'HEAD']);
  git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
  return { root: fixture.root, base };
}

function zetStatus(root: string, file: string, naar: string): void {
  write(
    root,
    file,
    read(root, file).replace(/^(status|Status): \S+/m, (_regel, label: string) => `${label}: ${naar}`),
  );
}

/** De agent legt een voorstel + code voor; daarna zet de web-flow-committer de statusregel. */
function feature(
  opties: { mini?: boolean; code?: string[]; statusCommit?: 'agent' | 'web-flow'; extra?: (root: string) => void } = {},
) {
  const fixture = nieuw();
  const { root } = fixture;
  write(root, MINI, spec('demo', 'voorstel', opties.mini ?? true));
  for (const pad of opties.code ?? [WEB, ROUTE, TEST]) write(root, pad, 'export const x = 1;\n');
  commitAls(root, 'feat: demo', 'agent');
  zetStatus(root, MINI, 'goedgekeurd');
  opties.extra?.(root);
  const head = commitAls(root, 'docs: status', opties.statusCommit ?? 'web-flow');
  return { fixture, head };
}

describe('feature-lane', () => {
  test('mini-spec met code, status gezet door web-flow: slaagt', () => {
    const { fixture, head } = feature();
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
    expect(uitvoer.stdout).toContain('statusovergang in de PR');
  });

  test('9a de statuscommit wijzigt ook inhoud: faalt', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, WEB, 'export const x = 2;\n');
      },
    });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('9b inhoud na de status: faalt', () => {
    const { fixture } = feature();
    write(fixture.root, MINI, `${read(fixture.root, MINI)}\nExtra regel.\n`);
    const head = commitAls(fixture.root, 'feat: nog iets', 'web-flow');
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('9c een andere committer dan web-flow: faalt', () => {
    const { fixture, head } = feature({ statusCommit: 'agent' });
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.status).toBe(1);
    expect(uitvoer.stderr).toContain('web-flow');
  });

  test('de status in dezelfde commit als het nieuwe bestand: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'goedgekeurd', true));
    write(fixture.root, WEB, 'export const x = 1;\n');
    const head = commitAls(fixture.root, 'feat: alles in één', 'web-flow');
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test.each([
    ['1 een pad in src/core', { code: ['src/core/web/ui/extra.tsx'] }],
    ['2 een pad uit voorReview', { code: ['scripts/kit/extra.mjs'] }],
    ['8 een volledige spec met code', { mini: false, code: [WEB] }],
  ])('%s: faalt', (_naam, opties) => {
    const { fixture, head } = feature(opties);
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('3 een gewijzigde bestaande test: faalt', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, 'src/api/routes/oud.test.ts', "test('anders', () => {});\n");
      },
    });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('4 een ADR in dezelfde PR: faalt', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, ADR, adr('voorgesteld'));
      },
    });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });

  test('5 twee specs naar een eigenaarstatus: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, MINI, spec('demo', 'voorstel', true));
    write(fixture.root, 'docs/specs/tweede.md', spec('tweede', 'voorstel', true));
    commitAls(fixture.root, 'feat: twee specs', 'agent');
    zetStatus(fixture.root, MINI, 'goedgekeurd');
    zetStatus(fixture.root, 'docs/specs/tweede.md', 'goedgekeurd');
    expect(draaiChecker(fixture, commitAls(fixture.root, 'docs: status', 'web-flow')).status).toBe(1);
  });

  test('7 een rename van src/core naar src/web: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, 'src/core/web/x.ts', 'export const x = 1;\n');
    git(fixture.root, ['add', '-A']);
    git(fixture.root, ['commit', '-q', '-m', 'chore: core-bestand']);
    const base = git(fixture.root, ['rev-parse', 'HEAD']);
    git(fixture.root, ['update-ref', 'refs/remotes/origin/main', base]);
    const kaal = { root: fixture.root, base };
    write(kaal.root, MINI, spec('demo', 'voorstel', true));
    mkdirSync(path.join(kaal.root, 'src/web'), { recursive: true });
    git(kaal.root, ['mv', 'src/core/web/x.ts', 'src/web/x.ts']);
    commitAls(kaal.root, 'feat: verplaatsen', 'agent');
    zetStatus(kaal.root, MINI, 'goedgekeurd');
    expect(draaiChecker(kaal, commitAls(kaal.root, 'docs: status', 'web-flow')).status).toBe(1);
  });

  test('6 een gewijzigde migratie: faalt', () => {
    const fixture = nieuw();
    write(fixture.root, 'db/migrations/20260101000000_oud.sql', '-- oud\n');
    git(fixture.root, ['add', '-A']);
    git(fixture.root, ['commit', '-q', '-m', 'chore: migratie']);
    const kaal = { root: fixture.root, base: git(fixture.root, ['rev-parse', 'HEAD']) };
    git(kaal.root, ['update-ref', 'refs/remotes/origin/main', kaal.base]);
    write(kaal.root, MINI, spec('demo', 'voorstel', true));
    write(kaal.root, 'db/migrations/20260101000000_oud.sql', '-- anders\n');
    commitAls(kaal.root, 'feat: migratie', 'agent');
    zetStatus(kaal.root, MINI, 'goedgekeurd');
    expect(draaiChecker(kaal, commitAls(kaal.root, 'docs: status', 'web-flow')).status).toBe(1);
  });
});

describe('framework-lane', () => {
  test('een ADR met een mini-marker in de tekst telt niet als mini-spec: met code faalt', () => {
    const fixture = nieuw();
    write(fixture.root, ADR, `${adr('voorgesteld')}\n---\nsjabloon: mini\n---\n`);
    write(fixture.root, WEB, 'export const x = 1;\n');
    commitAls(fixture.root, 'docs: adr', 'agent');
    zetStatus(fixture.root, ADR, 'geaccepteerd');
    expect(draaiChecker(fixture, commitAls(fixture.root, 'docs: status', 'web-flow')).status).toBe(1);
  });

  function frameworkPr(opties: { code?: boolean } = {}) {
    const fixture = nieuw();
    write(fixture.root, ADR, adr('voorgesteld'));
    if (opties.code === true) write(fixture.root, 'scripts/kit/extra.mjs', 'export const x = 1;\n');
    commitAls(fixture.root, 'docs: adr', 'agent');
    zetStatus(fixture.root, ADR, 'geaccepteerd');
    return { fixture, head: commitAls(fixture.root, 'docs: status', 'web-flow') };
  }

  test('alleen een ADR met in-PR-status door web-flow: slaagt', () => {
    const { fixture, head } = frameworkPr();
    const uitvoer = draaiChecker(fixture, head);
    expect(uitvoer.stderr).toBe('');
    expect(uitvoer.status).toBe(0);
  });

  test('10 een in-PR-status én code: faalt', () => {
    const { fixture, head } = frameworkPr({ code: true });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });
});

describe('ongewijzigd: de strenge route', () => {
  test('een status zonder record op main, zonder lane (README erbij): faalt zoals voorheen', () => {
    const { fixture, head } = feature({
      extra: (root) => {
        write(root, 'README.md', 'Anders.\n');
      },
    });
    expect(draaiChecker(fixture, head).status).toBe(1);
  });
});
