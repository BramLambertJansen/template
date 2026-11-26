import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import {
  RULESET_ID,
  UPGRADE,
  checkLijst,
  endpointsVoor,
  faal,
  goedeAntwoorden,
  mainVorm,
  parameters,
  requiredChecks,
  ruimGhStubOp,
  tekst,
  zetGhStub,
  type Antwoorden,
  type Endpoints,
} from './helpers/gh-stub.ts';
import {
  draai,
  ghLog,
  git,
  leesResultaat,
  maakFixture,
  ruimOp,
  schrijvendeGhAanroepen,
  stap,
  type Fixture,
} from './nieuwe-app-kit.ts';

// Tests voor `repo-instellingen` van scripts/kit/nieuwe-app.mjs (spec nieuwe-app-script, bouwstap 2: AC-5 voor de
// `repo-instellingen`-delen, AC-9 en AC-10), geschreven vóór de bouw. Een fixture-repo met `origin`, `gh` als stub op PATH die per
// endpoint antwoordt en elke aanroep logt (test/scripts/helpers/gh-stub.ts); de ruleset-antwoorden zijn de payload die
// scripts/github-ruleset.sh echt schrijft. `git diff origin/main -- scripts/kit/pr-merge.mjs` leeg is bewijs in de PR (AC-10),
// geen test: een testwerkmap heeft geen `origin/main` om tegen te vergelijken.
afterEach(async () => {
  await ruimOp();
  ruimGhStubOp();
});

const REPO = 'a/b';
const ORIGIN = 'https://github.com/a/b.git';
const ID = String(RULESET_ID);
const LIJST_PAD = `repos/${REPO}/rulesets`;
const DETAIL_PAD = `repos/${REPO}/rulesets/${ID}`;
const REPO_PAD = `repos/${REPO}`;
const ACTIONS_PAD = `repos/${REPO}/actions/permissions`;

interface Opzet {
  wijzig?: (a: Antwoorden) => void;
  extra?: Endpoints;
  origin?: string;
  /** Het aantal ouders van `main` en van `main~1` op GitHub; goed is 1 boven 2 (hernoem-commit boven koppel-merge). */
  main?: [number, number];
}

function opzet(opties: Opzet = {}): Fixture {
  const fx = maakFixture({
    extra: { '.claude/decisions.json': `${JSON.stringify({ version: 1, requiredChecks: requiredChecks() })}\n` },
  });
  git(fx.repo, 'remote', 'add', 'origin', opties.origin ?? ORIGIN);
  const antwoorden = goedeAntwoorden();
  opties.wijzig?.(antwoorden);
  const [ouders, ouders1] = opties.main ?? [1, 2];
  zetGhStub(fx, endpointsVoor(REPO, antwoorden, { ...mainVorm(REPO, ouders, ouders1), ...opties.extra }));
  return fx;
}

/** De velden (`-f`/`-F`/`--field`/`--raw-field` sleutel=waarde) van één gh-aanroep, als tekst. */
function velden(args: string[]): Record<string, string> {
  const uit: Record<string, string> = {};
  args.forEach((arg, i) => {
    const waarde = ['-f', '-F', '--field', '--raw-field'].includes(arg) ? args[i + 1] : undefined;
    const [sleutel = '', ...rest] = (waarde ?? '').split('=');
    if (waarde !== undefined) uit[sleutel] = rest.join('=');
  });
  return uit;
}

function eindpunt(args: string[]): string {
  return (
    args.find((arg, i) => i > 0 && args[0] === 'api' && !arg.startsWith('-') && !['PUT', 'POST'].includes(arg)) ?? ''
  );
}

/** `✗ <melding>` gevolgd door `  → <herstel>` op de volgende regel. */
function eisRegels(stdout: string, melding: string, herstel: string): void {
  const regels = stdout.split('\n');
  const i = regels.indexOf(`✗ ${melding}`);
  expect(i, `de uitvoer bevat de regel "✗ ${melding}":\n${stdout}`).toBeGreaterThanOrEqual(0);
  expect(regels[i + 1]).toBe(`  → ${herstel}`);
}

const VORM_MELDING = 'main op GitHub heeft nog niet de hernoem-commit boven de koppel-merge';
const VORM_HERSTEL = 'eerst de push door de eigenaar (docs/nieuwe-app.md, 6.1)';

describe('nieuwe-app-script/AC-9: repo-instellingen weigert zonder schrijven', () => {
  test.each([
    { naam: 'schrijvende modus', extra: ['--beschrijving', 'x'] },
    { naam: '--controleer', extra: ['--controleer'] },
  ])(
    'nieuwe-app-script/AC-9 $naam: een andere origin geeft exitcode 1, de tekst en geen schrijvende gh-aanroep',
    ({ extra }) => {
      const fx = opzet({ origin: 'https://github.com/x/y.git' });
      const r = draai(fx, ['repo-instellingen', '--repo', REPO, ...extra]);

      expect(r.status, r.uit).toBe(1);
      eisRegels(r.stdout, `--repo ${REPO} is niet de origin van deze werkmap`, 'draai vanuit ~/code/b');
      expect(schrijvendeGhAanroepen(fx), 'geen schrijvende gh-aanroep').toStrictEqual([]);
    },
  );

  test.each([
    { naam: 'main heeft twee ouders (geen hernoem-commit)', ouders: 2, ouders1: 2 },
    { naam: 'main~1 heeft één ouder (geen koppel-merge)', ouders: 1, ouders1: 1 },
  ])('nieuwe-app-script/AC-9 $naam: exitcode 1 met de tekst en geen schrijvende gh-aanroep', ({ ouders, ouders1 }) => {
    const fx = opzet({ main: [ouders, ouders1] });
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--beschrijving', 'x']);

    expect(r.status, r.uit).toBe(1);
    eisRegels(r.stdout, VORM_MELDING, VORM_HERSTEL);
    expect(schrijvendeGhAanroepen(fx), 'geen schrijvende gh-aanroep').toStrictEqual([]);
  });

  test('nieuwe-app-script/AC-9 met --controleer en dezelfde main geen vormfout', () => {
    const fx = opzet({ main: [2, 2] });
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);

    expect(r.uit).not.toContain(VORM_MELDING);
    expect(r.status, r.uit).toBe(0);
    expect(schrijvendeGhAanroepen(fx)).toStrictEqual([]);
  });

  test('nieuwe-app-script/AC-9 juiste origin en main-vorm met --beschrijving x: één repo edit en twee PUT-aanroepen met de velden uit werking 7', () => {
    const fx = opzet();
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--beschrijving', 'x']);
    expect(r.status, r.uit).toBe(0);

    const schrijvend = schrijvendeGhAanroepen(fx);
    const edits = schrijvend.filter((args) => args[0] === 'repo' && args[1] === 'edit');
    expect(edits, 'precies één repo edit').toHaveLength(1);
    const edit = edits[0] ?? [];
    expect(edit.slice(0, 3)).toStrictEqual(['repo', 'edit', REPO]);
    for (const vlag of [
      '--enable-merge-commit',
      '--enable-squash-merge',
      '--enable-rebase-merge=false',
      '--delete-branch-on-merge',
      '--enable-auto-merge=false',
    ])
      expect(edit, `repo edit heeft ${vlag}`).toContain(vlag);
    const beschrijving = edit.includes('--description') ? edit[edit.indexOf('--description') + 1] : undefined;
    expect(beschrijving ?? edit.find((arg) => arg.startsWith('--description='))?.slice('--description='.length)).toBe(
      'x',
    );

    const puts = schrijvend.filter((args) => args[0] === 'api');
    expect(puts, 'precies twee schrijvende api-aanroepen').toHaveLength(2);
    for (const args of puts)
      expect(args, `${args.join(' ')} is een PUT`).toEqual(expect.arrayContaining(['-X', 'PUT']));
    const workflow = puts.find((args) => eindpunt(args) === `repos/${REPO}/actions/permissions/workflow`);
    const actions = puts.find((args) => eindpunt(args) === ACTIONS_PAD);
    expect(workflow, 'PUT op actions/permissions/workflow').toBeDefined();
    expect(actions, 'PUT op actions/permissions').toBeDefined();
    expect(velden(workflow ?? [])).toStrictEqual({
      default_workflow_permissions: 'read',
      can_approve_pull_request_reviews: 'false',
    });
    expect(velden(actions ?? [])).toStrictEqual({
      enabled: 'true',
      allowed_actions: 'all',
      sha_pinning_required: 'true',
    });
    expect(schrijvend, 'verder niets schrijvends').toHaveLength(3);
  });

  test('nieuwe-app-script/AC-9 zonder --beschrijving geeft repo edit geen --description', () => {
    const fx = opzet();
    const r = draai(fx, ['repo-instellingen', '--repo', REPO]);
    expect(r.status, r.uit).toBe(0);
    const edits = schrijvendeGhAanroepen(fx).filter((args) => args[0] === 'repo' && args[1] === 'edit');
    expect(edits).toHaveLength(1);
    expect(edits[0]?.some((arg) => arg.startsWith('--description'))).toBe(false);
  });

  test('nieuwe-app-script/AC-9 repo-instellingen bestaat: geen "bestaat nog niet (bouwstap 2)" meer en geen gebruiksfout', () => {
    const fx = opzet();
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);
    expect(r.status, r.uit).not.toBe(2);
    expect(r.uit).not.toContain('bestaat nog niet');
  });
});

describe('nieuwe-app-script/AC-5: repo-instellingen --dry-run wijzigt niets', () => {
  test('nieuwe-app-script/AC-5 repo-instellingen --dry-run laat HEAD, remotes, refs/remotes en .env.local gelijk en roept gh niet schrijvend aan', () => {
    const fx = opzet();
    const envLocal = path.join(fx.repo, '.env.local');
    writeFileSync(envLocal, 'PG_PORT=54322\nAPI_PORT=8787\n');
    const voor = {
      head: git(fx.repo, 'rev-parse', 'HEAD'),
      remotes: git(fx.repo, 'remote', '-v'),
      refs: git(fx.repo, 'for-each-ref', 'refs/remotes'),
      env: readFileSync(envLocal, 'utf8'),
    };

    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--beschrijving', 'x', '--dry-run']);

    expect(r.status, r.uit).toBe(0);
    expect(r.stdout).toMatch(/^\(dry-run\) /m);
    expect({
      head: git(fx.repo, 'rev-parse', 'HEAD'),
      remotes: git(fx.repo, 'remote', '-v'),
      refs: git(fx.repo, 'for-each-ref', 'refs/remotes'),
      env: readFileSync(envLocal, 'utf8'),
    }).toStrictEqual(voor);
    const aanroepen = ghLog(fx).map((args) => args.join(' '));
    expect(
      aanroepen.filter((regel) => /-X (PUT|POST)|\bPOST\b|repo edit/.test(regel)),
      'geen PUT, POST of repo edit',
    ).toStrictEqual([]);
    expect(schrijvendeGhAanroepen(fx)).toStrictEqual([]);
    expect(leesResultaat(fx.repo, 'repo-instellingen').dryRun).toBe(true);
  });

  test('nieuwe-app-script/AC-5 repo-instellingen --dry-run met een andere origin weigert ook, zonder schrijvende gh-aanroep', () => {
    const fx = opzet({ origin: 'https://github.com/x/y.git' });
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--dry-run']);
    expect(r.status, r.uit).toBe(1);
    expect(schrijvendeGhAanroepen(fx)).toStrictEqual([]);
  });
});

interface Code {
  code: string;
  /** Het stap-id (de code in kleine letters, `-` voor `_`). */
  id: string;
  melding: string;
  herstel: string;
  /** De ruleset-stap of de instellingen-stap is de andere functie, die ok blijft. */
  anderId: 'ruleset' | 'instellingen';
  opzet: Opzet;
}

const RULESET_HERSTEL = `de eigenaar draait scripts/github-ruleset.sh ${REPO} opnieuw (docs/nieuwe-app.md, 6.2)`;
const INSTELLINGEN_HERSTEL = `node scripts/kit/nieuwe-app.mjs repo-instellingen --repo ${REPO}`;
const LEES_HERSTEL = 'controleer gh auth status en draai opnieuw; blijft het, vraag de eigenaar';

const CODES: { naam: string; c: Code }[] = [
  {
    naam: 'een rulesetlijst die faalt met "Upgrade to GitHub Pro"',
    c: {
      code: 'RULESETS_NIET_BESCHIKBAAR',
      id: 'rulesets-niet-beschikbaar',
      melding: `GitHub geeft geen rulesets op ${REPO}: een private repo vraagt GitHub Pro of Team`,
      herstel: `de eigenaar kiest Pro, een organisatie met Team, of public; daarna draait hij scripts/github-ruleset.sh ${REPO} (docs/nieuwe-app.md, 6.2)`,
      anderId: 'instellingen',
      opzet: { extra: { [LIJST_PAD]: faal(UPGRADE) } },
    },
  },
  {
    naam: 'geen ruleset main',
    c: {
      code: 'GEEN_RULESET',
      id: 'geen-ruleset',
      melding: `geen ruleset main op ${REPO}`,
      herstel: `de eigenaar draait scripts/github-ruleset.sh ${REPO} (docs/nieuwe-app.md, 6.2)`,
      anderId: 'instellingen',
      opzet: {
        wijzig: (a) => {
          a.lijst = [];
        },
      },
    },
  },
  {
    naam: 'enforcement disabled',
    c: {
      code: 'RULESET_NIET_ACTIEF',
      id: 'ruleset-niet-actief',
      melding: 'ruleset main is niet actief op de standaardbranch: enforcement',
      herstel: RULESET_HERSTEL,
      anderId: 'instellingen',
      opzet: {
        wijzig: (a) => {
          a.detail['enforcement'] = 'disabled';
        },
      },
    },
  },
  {
    naam: 'een niet-lege bypass_actors',
    c: {
      code: 'BYPASS',
      id: 'bypass',
      melding: 'ruleset main heeft een bypass: bypass_actors',
      herstel: RULESET_HERSTEL,
      anderId: 'instellingen',
      opzet: {
        wijzig: (a) => {
          a.detail['bypass_actors'] = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
        },
      },
    },
  },
  {
    naam: 'current_user_can_bypass always',
    c: {
      code: 'BYPASS',
      id: 'bypass',
      melding: 'ruleset main heeft een bypass: current_user_can_bypass',
      herstel: RULESET_HERSTEL,
      anderId: 'instellingen',
      opzet: {
        wijzig: (a) => {
          a.detail['current_user_can_bypass'] = 'always';
        },
      },
    },
  },
  {
    naam: 'require_code_owner_review waar',
    c: {
      code: 'REGELS',
      id: 'regels',
      melding: 'regels van ruleset main wijken af: pull_request.require_code_owner_review',
      herstel: RULESET_HERSTEL,
      anderId: 'instellingen',
      opzet: {
        wijzig: (a) => {
          parameters(a, 'pull_request')['require_code_owner_review'] = true;
        },
      },
    },
  },
  {
    naam: 'een checklijst met een naam minder dan requiredChecks',
    c: {
      code: 'CHECKS',
      id: 'checks',
      melding: 'verplichte checks op main wijken af van requiredChecks: osv-scanner',
      herstel: RULESET_HERSTEL,
      anderId: 'instellingen',
      opzet: {
        wijzig: (a) => {
          parameters(a, 'required_status_checks')['required_status_checks'] = checkLijst(a).filter(
            (check) => check['context'] !== 'osv-scanner',
          );
        },
      },
    },
  },
  {
    naam: 'een checklijst met een naam meer dan requiredChecks',
    c: {
      code: 'CHECKS',
      id: 'checks',
      melding: 'verplichte checks op main wijken af van requiredChecks: extra-check',
      herstel: RULESET_HERSTEL,
      anderId: 'instellingen',
      opzet: {
        wijzig: (a) => {
          parameters(a, 'required_status_checks')['required_status_checks'] = [
            ...checkLijst(a),
            { context: 'extra-check', integration_id: 15368 },
          ];
        },
      },
    },
  },
  {
    naam: 'een onleesbare rules-API',
    c: {
      code: 'RULESET_ONLEESBAAR',
      id: 'ruleset-onleesbaar',
      melding: `ruleset main niet te lezen: ${DETAIL_PAD}`,
      herstel: LEES_HERSTEL,
      anderId: 'instellingen',
      opzet: { extra: { [DETAIL_PAD]: faal('gh: Not Found (HTTP 404)') } },
    },
  },
  {
    naam: 'allow_rebase_merge waar',
    c: {
      code: 'MERGE_METHODEN',
      id: 'merge-methoden',
      melding: 'merge-instellingen wijken af: allow_rebase_merge',
      herstel: INSTELLINGEN_HERSTEL,
      anderId: 'ruleset',
      opzet: {
        wijzig: (a) => {
          a.repo['allow_rebase_merge'] = true;
        },
      },
    },
  },
  {
    naam: 'default_workflow_permissions write',
    c: {
      code: 'WORKFLOW_RECHTEN',
      id: 'workflow-rechten',
      melding: 'workflow-rechten wijken af: default_workflow_permissions',
      herstel: INSTELLINGEN_HERSTEL,
      anderId: 'ruleset',
      opzet: {
        wijzig: (a) => {
          a.workflow['default_workflow_permissions'] = 'write';
        },
      },
    },
  },
  {
    naam: 'allowed_actions selected',
    c: {
      code: 'ACTIONS',
      id: 'actions',
      melding: 'Actions-instellingen wijken af: allowed_actions',
      herstel: INSTELLINGEN_HERSTEL,
      anderId: 'ruleset',
      opzet: {
        wijzig: (a) => {
          a.actions['allowed_actions'] = 'selected';
        },
      },
    },
  },
  {
    naam: 'geen sha_pinning_required',
    c: {
      code: 'SHA_PINNING_ONBEKEND',
      id: 'sha-pinning-onbekend',
      melding: 'sha_pinning_required onbekend',
      herstel: 'Settings → Actions → General → Require actions to be pinned to a full-length commit SHA',
      anderId: 'ruleset',
      opzet: {
        wijzig: (a) => {
          Reflect.deleteProperty(a.actions, 'sha_pinning_required');
        },
      },
    },
  },
  {
    naam: 'een falende actions/permissions',
    c: {
      code: 'INSTELLINGEN_ONLEESBAAR',
      id: 'instellingen-onleesbaar',
      melding: `repo-instellingen niet te lezen: ${ACTIONS_PAD}`,
      herstel: LEES_HERSTEL,
      anderId: 'ruleset',
      opzet: { extra: { [ACTIONS_PAD]: faal('gh: boom (HTTP 500)') } },
    },
  },
];

describe('nieuwe-app-script/AC-10: repo-instellingen --controleer', () => {
  test.each(CODES)('nieuwe-app-script/AC-10 $naam geeft $c.code met de ✗- en →-regel en een fout-stap', ({ c }) => {
    const fx = opzet(c.opzet);
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);

    expect(r.status, r.uit).toBe(1);
    eisRegels(r.stdout, c.melding, c.herstel);
    expect(r.stdout).toMatch(
      /^✗ nieuwe-app repo-instellingen: 1 fout\(en\) → \.template\/nieuwe-app-repo-instellingen\.json$/m,
    );
    expect(r.uit).not.toContain('de eigenaar merget');
    expect(r.uit).not.toContain('--bypass-beheerder');
    expect(schrijvendeGhAanroepen(fx), 'geen schrijvende gh-aanroep bij --controleer').toStrictEqual([]);
    expect(ghLog(fx).filter((args) => args[0] === 'repo' && args[1] === 'edit')).toHaveLength(0);

    const resultaat = leesResultaat(fx.repo, 'repo-instellingen');
    expect(resultaat.uitslag).toBe('fout');
    expect(resultaat.stappen.filter((s) => s.status === 'fout').map((s) => s.id)).toStrictEqual([c.id]);
    expect(stap(resultaat, c.id).melding).toBe(c.melding);
    expect(stap(resultaat, c.id).herstel).toBe(c.herstel);
    expect(stap(resultaat, c.anderId).status, `de stap ${c.anderId} is ok: de andere functie vond niets`).toBe('ok');
  });

  test('nieuwe-app-script/AC-10 het resultaatbestand staat onder .template/ in de git-root', () => {
    const fx = opzet({ extra: { [LIJST_PAD]: faal(UPGRADE) } });
    draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer'], { cwd: path.join(fx.repo, 'db', 'migrations') });
    expect(stap(leesResultaat(fx.repo, 'repo-instellingen'), 'rulesets-niet-beschikbaar').status).toBe('fout');
    expect(readdirSync(path.join(fx.repo, 'db', 'migrations'))).not.toContain('.template');
  });

  test('nieuwe-app-script/AC-10 een ruleset gelijk aan github-ruleset.sh en instellingen gelijk aan 6.2: exitcode 0 met de stappen ruleset en instellingen ok', () => {
    const fx = opzet();
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);

    expect(r.status, r.uit).toBe(0);
    expect(r.stdout).toContain('✓ ruleset main gelijk aan scripts/github-ruleset.sh');
    expect(r.stdout).toContain('✓ repo-instellingen gelijk aan docs/nieuwe-app.md 6.2');
    expect(r.stdout).toMatch(
      /^nieuwe-app repo-instellingen: ok \(\d+ stappen\) → \.template\/nieuwe-app-repo-instellingen\.json$/m,
    );
    const resultaat = leesResultaat(fx.repo, 'repo-instellingen');
    expect(resultaat.uitslag).toBe('ok');
    expect(stap(resultaat, 'ruleset').status).toBe('ok');
    expect(stap(resultaat, 'instellingen').status).toBe('ok');
    expect(schrijvendeGhAanroepen(fx)).toStrictEqual([]);
  });

  test('nieuwe-app-script/AC-10 ook als main meer commits heeft dan de hernoem-commit en de koppel-merge: exitcode 0', () => {
    const fx = opzet({ main: [1, 1] });
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);
    expect(r.status, r.uit).toBe(0);
    expect(r.uit).not.toContain(VORM_MELDING);
  });

  test('nieuwe-app-script/AC-10 --controleer leest alleen: elke gh-aanroep begint met api en bevat geen schrijvende vlag', () => {
    const fx = opzet();
    draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);
    const log = ghLog(fx);
    expect(log.length, 'gh is aangeroepen').toBeGreaterThan(0);
    for (const args of log) {
      expect(args[0], `gh ${args.join(' ')}`).toBe('api');
      expect(args.filter((arg) => ['-X', '--method', '--input', '-f', '-F', '--field'].includes(arg))).toStrictEqual(
        [],
      );
    }
    // Beide functies draaien altijd: de lijst, de ruleset en de drie instellingenendpoints zijn gelezen.
    const gelezen = log.map(eindpunt);
    for (const pad of [LIJST_PAD, DETAIL_PAD, REPO_PAD, `${REPO_PAD}/actions/permissions/workflow`, ACTIONS_PAD])
      expect(gelezen, `${pad} is gelezen`).toContain(pad);
  });

  test('nieuwe-app-script/AC-10 beide functies draaien altijd: een ruleset- en een instellingenafwijking geven twee fout-stappen', () => {
    const fx = opzet({
      wijzig: (a) => {
        a.detail['enforcement'] = 'disabled';
        a.repo['allow_rebase_merge'] = true;
      },
    });
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toMatch(/^✗ nieuwe-app repo-instellingen: 2 fout\(en\) → /m);
    const resultaat = leesResultaat(fx.repo, 'repo-instellingen');
    expect(
      resultaat.stappen
        .filter((s) => s.status === 'fout')
        .map((s) => s.id)
        .toSorted(),
    ).toStrictEqual(['merge-methoden', 'ruleset-niet-actief']);
  });

  test('nieuwe-app-script/AC-10 een org-ruleset main naast de repo-ruleset telt niet mee', () => {
    const fx = opzet({
      wijzig: (a) => {
        a.lijst = [{ id: 7, name: 'main', source_type: 'Organization' }, ...a.lijst];
      },
    });
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);
    expect(r.status, r.uit).toBe(0);
  });

  test('nieuwe-app-script/AC-10 een private repo zonder Pro in stdout in plaats van stderr geeft dezelfde code', () => {
    const fx = opzet({ extra: { [LIJST_PAD]: { stdout: UPGRADE, stderr: '', exit: 1 } } });
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);
    expect(r.status, r.uit).toBe(1);
    expect(r.stdout).toContain(`✗ GitHub geeft geen rulesets op ${REPO}: een private repo vraagt GitHub Pro of Team`);
  });

  test('nieuwe-app-script/AC-10 een rulesetlijst die geen JSON geeft is RULESET_ONLEESBAAR met de lijst als endpoint', () => {
    const fx = opzet({ extra: { [LIJST_PAD]: tekst('geen json') } });
    const r = draai(fx, ['repo-instellingen', '--repo', REPO, '--controleer']);
    expect(r.status, r.uit).toBe(1);
    eisRegels(r.stdout, `ruleset main niet te lezen: ${LIJST_PAD}`, LEES_HERSTEL);
    expect(leesResultaat(fx.repo, 'repo-instellingen').uitslag).toBe('fout');
  });
});
