import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';
import {
  RULESET_ID,
  ROOT,
  UPGRADE,
  endpointsVoor,
  faal,
  ghFunctie,
  goedeAntwoorden,
  json,
  lijst,
  checkLijst,
  obj,
  parameters,
  requiredChecks,
  tekst,
  type Antwoorden,
  type Endpoints,
  type GhFunctie,
} from './helpers/gh-stub.ts';

// Tests voor scripts/kit/ruleset-controle.mjs (spec nieuwe-app-script, bouwstap 2, AC-19), geschreven vóór de bouw. De module is
// een alleen-lezende controle met een geïnjecteerde `gh`; de verwachte ruleset is de payload die `scripts/github-ruleset.sh`
// echt schrijft (via de helper), geen kopie. De module wordt dynamisch geladen: ontbreekt ze, dan falen de tests op een
// assertie met een duidelijke melding in plaats van op een importfout.
const MODULE = path.join(ROOT, 'scripts/kit/ruleset-controle.mjs');
const MIST =
  'scripts/kit/ruleset-controle.mjs bestaat niet: de developer bouwt het (spec nieuwe-app-script, bouwstap 2)';
const REPO = 'a/b';
const ID = String(RULESET_ID);
const LIJST_PAD = `repos/${REPO}/rulesets`;
const DETAIL_PAD = `repos/${REPO}/rulesets/${ID}`;
const REPO_PAD = `repos/${REPO}`;
const WORKFLOW_PAD = `repos/${REPO}/actions/permissions/workflow`;
const ACTIONS_PAD = `repos/${REPO}/actions/permissions`;

const Bevindingen = z.array(z.object({ code: z.string(), details: z.array(z.string()) }));
type Bevindingen = z.infer<typeof Bevindingen>;

interface Module {
  controleerRuleset: (gh: GhFunctie, opties: { repo: string; requiredChecks: string[] }) => unknown;
  controleerInstellingen: (gh: GhFunctie, opties: { repo: string }) => unknown;
}

async function laad(): Promise<Module> {
  expect(existsSync(MODULE), MIST).toBe(true);
  const mod: unknown = await import(pathToFileURL(MODULE).href);
  return unsafeCast<Module>(
    mod,
    'dynamische import; de vorm staat in Module en wordt per aanroep met zod gecontroleerd',
  );
}

interface Run {
  bevindingen: Bevindingen;
  log: string[][];
}

// `await` werkt zowel op een synchrone als op een asynchrone module (de spec laat dat open).
async function ruleset(endpoints: Endpoints, checks: string[] = requiredChecks()): Promise<Run> {
  const log: string[][] = [];
  const mod = await laad();
  const uit = await mod.controleerRuleset(ghFunctie(endpoints, log), { repo: REPO, requiredChecks: checks });
  return { bevindingen: Bevindingen.parse(uit), log };
}

async function instellingen(endpoints: Endpoints): Promise<Run> {
  const log: string[][] = [];
  const mod = await laad();
  const uit = await mod.controleerInstellingen(ghFunctie(endpoints, log), { repo: REPO });
  return { bevindingen: Bevindingen.parse(uit), log };
}

/** Eindpunten van een gezonde repo, na een wijziging van de antwoorden. */
function met(wijzig: (a: Antwoorden) => void, extra: Endpoints = {}): Endpoints {
  const a = goedeAntwoorden();
  wijzig(a);
  return endpointsVoor(REPO, a, extra);
}

function zonderRegel(a: Antwoorden, type: string): void {
  a.detail['rules'] = lijst(a.detail['rules'])
    .map(obj)
    .filter((kandidaat) => kandidaat['type'] !== type);
}

interface Geval {
  naam: string;
  code: string;
  /** De eindpunten met één afwijking. */
  bouw: () => Endpoints;
  /** Exact de details (volgorde vrij); weglaten als de spec de naam niet vastlegt, met `bevat` als ondergrens. */
  details?: string[];
  /** De details zijn precies één naam die deze tekst bevat (de spec noemt "het endpoint of de veldnaam"). */
  bevat?: string;
}

function eisGeval(run: Run, geval: Geval): void {
  expect(
    run.bevindingen.map((bevinding) => bevinding.code),
    `precies de code ${geval.code}, één keer`,
  ).toStrictEqual([geval.code]);
  const details = run.bevindingen[0]?.details ?? [];
  if (geval.details !== undefined) expect(details.toSorted()).toStrictEqual(geval.details.toSorted());
  if (geval.bevat !== undefined) {
    expect(details, `details bevat één naam met ${geval.bevat}`).toHaveLength(1);
    expect(details[0]).toContain(geval.bevat);
  }
}

describe('nieuwe-app-script/AC-19: controleerRuleset', () => {
  test('nieuwe-app-script/AC-19 een ruleset gelijk aan de payload van scripts/github-ruleset.sh geeft een lege lijst', async () => {
    const { bevindingen } = await ruleset(met(() => undefined));
    expect(bevindingen).toStrictEqual([]);
  });

  test('nieuwe-app-script/AC-19 de gezonde ruleset bevat echt de checks uit requiredChecks (de verwachting is de echte payload)', () => {
    const a = goedeAntwoorden();
    const namen = checkLijst(a).map((check) => check['context']);
    expect(namen).toStrictEqual(requiredChecks());
    expect(checkLijst(a).every((check) => check['integration_id'] === 15368)).toBe(true);
  });

  const SCHRAAL: Geval[] = [
    {
      naam: 'rulesetlijst faalt met "Upgrade to GitHub Pro" in stderr',
      code: 'RULESETS_NIET_BESCHIKBAAR',
      details: [],
      bouw: () => met(() => undefined, { [LIJST_PAD]: faal(UPGRADE) }),
    },
    {
      naam: 'rulesetlijst faalt met "Upgrade to GitHub Pro" in stdout',
      code: 'RULESETS_NIET_BESCHIKBAAR',
      details: [],
      bouw: () => met(() => undefined, { [LIJST_PAD]: { stdout: UPGRADE, stderr: '', exit: 1 } }),
    },
    {
      naam: 'geen enkele ruleset',
      code: 'GEEN_RULESET',
      details: [],
      bouw: () =>
        met((a) => {
          a.lijst = [];
        }),
    },
    {
      naam: 'alleen een ruleset met een andere naam',
      code: 'GEEN_RULESET',
      details: [],
      bouw: () =>
        met((a) => {
          a.lijst = [{ id: RULESET_ID, name: 'develop', source_type: 'Repository' }];
        }),
    },
    {
      naam: 'alleen een org-ruleset main (source_type Organization)',
      code: 'GEEN_RULESET',
      details: [],
      bouw: () =>
        met((a) => {
          a.lijst = [{ id: 7, name: 'main', source_type: 'Organization' }];
        }),
    },
  ];

  const NIET_ACTIEF: Geval[] = [
    {
      naam: 'enforcement disabled',
      code: 'RULESET_NIET_ACTIEF',
      details: ['enforcement'],
      bouw: () =>
        met((a) => {
          a.detail['enforcement'] = 'disabled';
        }),
    },
    {
      naam: 'target tag',
      code: 'RULESET_NIET_ACTIEF',
      details: ['target'],
      bouw: () =>
        met((a) => {
          a.detail['target'] = 'tag';
        }),
    },
    {
      naam: 'conditions.ref_name include wijkt af',
      code: 'RULESET_NIET_ACTIEF',
      bevat: 'ref_name',
      bouw: () =>
        met((a) => {
          obj(obj(a.detail['conditions'])['ref_name'])['include'] = ['refs/heads/main'];
        }),
    },
    {
      naam: 'conditions.ref_name exclude is niet leeg',
      code: 'RULESET_NIET_ACTIEF',
      bevat: 'ref_name',
      bouw: () =>
        met((a) => {
          obj(obj(a.detail['conditions'])['ref_name'])['exclude'] = ['refs/heads/x'];
        }),
    },
  ];

  const BYPASS: Geval[] = [
    {
      naam: 'bypass_actors is niet leeg',
      code: 'BYPASS',
      details: ['bypass_actors'],
      bouw: () =>
        met((a) => {
          a.detail['bypass_actors'] = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
        }),
    },
    {
      naam: 'current_user_can_bypass always',
      code: 'BYPASS',
      details: ['current_user_can_bypass'],
      bouw: () =>
        met((a) => {
          a.detail['current_user_can_bypass'] = 'always';
        }),
    },
    {
      naam: 'current_user_can_bypass pull_requests_only',
      code: 'BYPASS',
      details: ['current_user_can_bypass'],
      bouw: () =>
        met((a) => {
          a.detail['current_user_can_bypass'] = 'pull_requests_only';
        }),
    },
  ];

  const REGELS: Geval[] = [
    ...['deletion', 'non_fast_forward', 'pull_request'].map((type): Geval => ({
      naam: `de regel ${type} ontbreekt`,
      code: 'REGELS',
      details: [type],
      bouw: () =>
        met((a) => {
          zonderRegel(a, type);
        }),
    })),
    {
      naam: 'een regeltype naast de vier',
      code: 'REGELS',
      details: ['required_linear_history'],
      bouw: () =>
        met((a) => {
          lijst(a.detail['rules']).push({ type: 'required_linear_history' });
        }),
    },
    ...[
      ['required_approving_review_count', 1],
      ['dismiss_stale_reviews_on_push', false],
      ['require_code_owner_review', true],
      ['require_last_push_approval', true],
      ['required_review_thread_resolution', false],
      ['allowed_merge_methods', ['merge', 'squash', 'rebase']],
      ['allowed_merge_methods', ['merge']],
    ].map(([naam = '', waarde]): Geval => ({
      naam: `pull_request.${String(naam)} wijkt af`,
      code: 'REGELS',
      details: [`pull_request.${String(naam)}`],
      bouw: () =>
        met((a) => {
          parameters(a, 'pull_request')[String(naam)] = waarde;
        }),
    })),
  ];

  const CHECKS: Geval[] = [
    {
      naam: 'een verplichte check minder dan requiredChecks',
      code: 'CHECKS',
      details: ['osv-scanner'],
      bouw: () =>
        met((a) => {
          parameters(a, 'required_status_checks')['required_status_checks'] = checkLijst(a).filter(
            (check) => check['context'] !== 'osv-scanner',
          );
        }),
    },
    {
      naam: 'een verplichte check meer dan requiredChecks',
      code: 'CHECKS',
      details: ['extra-check'],
      bouw: () =>
        met((a) => {
          parameters(a, 'required_status_checks')['required_status_checks'] = [
            ...checkLijst(a),
            { context: 'extra-check', integration_id: 15368 },
          ];
        }),
    },
    {
      naam: 'een check met een ander integration_id',
      code: 'CHECKS',
      details: ['gate:fast'],
      bouw: () =>
        met((a) => {
          const eerste = checkLijst(a).find((check) => check['context'] === 'gate:fast');
          if (eerste === undefined) throw new Error('gate:fast ontbreekt in de payload');
          eerste['integration_id'] = 1;
        }),
    },
    {
      naam: 'strict_required_status_checks_policy waar',
      code: 'CHECKS',
      details: ['strict_required_status_checks_policy'],
      bouw: () =>
        met((a) => {
          parameters(a, 'required_status_checks')['strict_required_status_checks_policy'] = true;
        }),
    },
    {
      naam: 'de regel required_status_checks ontbreekt',
      code: 'CHECKS',
      details: ['required_status_checks'],
      bouw: () =>
        met((a) => {
          zonderRegel(a, 'required_status_checks');
        }),
    },
  ];

  const ONLEESBAAR: Geval[] = [
    {
      naam: 'de rulesetlijst faalt met een andere gh-fout',
      code: 'RULESET_ONLEESBAAR',
      details: [LIJST_PAD],
      bouw: () => met(() => undefined, { [LIJST_PAD]: faal('gh: Bad credentials (HTTP 401)') }),
    },
    {
      naam: 'de rulesetlijst is geen JSON',
      code: 'RULESET_ONLEESBAAR',
      details: [LIJST_PAD],
      bouw: () => met(() => undefined, { [LIJST_PAD]: tekst('<html>geen json</html>') }),
    },
    {
      naam: 'de rules-API van de ruleset faalt',
      code: 'RULESET_ONLEESBAAR',
      details: [DETAIL_PAD],
      bouw: () => met(() => undefined, { [DETAIL_PAD]: faal('gh: Not Found (HTTP 404)') }),
    },
    {
      naam: 'de rules-API van de ruleset geeft geen JSON',
      code: 'RULESET_ONLEESBAAR',
      details: [DETAIL_PAD],
      bouw: () => met(() => undefined, { [DETAIL_PAD]: tekst('geen json') }),
    },
    {
      naam: 'een lijstitem zonder source_type',
      code: 'RULESET_ONLEESBAAR',
      bevat: '',
      bouw: () =>
        met((a) => {
          a.lijst = [{ id: RULESET_ID, name: 'main' }];
        }),
    },
    ...['enforcement', 'target', 'conditions', 'bypass_actors', 'current_user_can_bypass', 'rules'].map(
      (veld): Geval => ({
        naam: `het top-level veld ${veld} ontbreekt`,
        code: 'RULESET_ONLEESBAAR',
        bevat: veld,
        bouw: () =>
          met((a) => {
            Reflect.deleteProperty(a.detail, veld);
          }),
      }),
    ),
    ...[
      'required_approving_review_count',
      'dismiss_stale_reviews_on_push',
      'require_code_owner_review',
      'require_last_push_approval',
      'required_review_thread_resolution',
      'allowed_merge_methods',
    ].map((veld): Geval => ({
      naam: `pull_request.${veld} ontbreekt in een aanwezige regel (geen REGELS)`,
      code: 'RULESET_ONLEESBAAR',
      bevat: veld,
      bouw: () =>
        met((a) => {
          Reflect.deleteProperty(parameters(a, 'pull_request'), veld);
        }),
    })),
    ...['strict_required_status_checks_policy', 'required_status_checks'].map((veld): Geval => ({
      naam: `${veld} ontbreekt in de aanwezige regel required_status_checks (geen CHECKS)`,
      code: 'RULESET_ONLEESBAAR',
      bevat: veld,
      bouw: () =>
        met((a) => {
          Reflect.deleteProperty(parameters(a, 'required_status_checks'), veld);
        }),
    })),
  ];

  describe.each([
    { groep: 'RULESETS_NIET_BESCHIKBAAR en GEEN_RULESET', gevallen: SCHRAAL },
    { groep: 'RULESET_NIET_ACTIEF', gevallen: NIET_ACTIEF },
    { groep: 'BYPASS', gevallen: BYPASS },
    { groep: 'REGELS', gevallen: REGELS },
    { groep: 'CHECKS', gevallen: CHECKS },
    { groep: 'RULESET_ONLEESBAAR en de voorrangsregel', gevallen: ONLEESBAAR },
  ])('$groep', ({ gevallen }) => {
    test.each(gevallen)('nieuwe-app-script/AC-19 $naam geeft precies $code', async (geval) => {
      eisGeval(await ruleset(geval.bouw()), geval);
    });
  });

  test('nieuwe-app-script/AC-19 een extra ruleset main van een organisatie en extra velden veranderen de uitkomst niet', async () => {
    const endpoints = met((a) => {
      a.lijst = [{ id: 7, name: 'main', source_type: 'Organization' }, ...a.lijst];
      parameters(a, 'required_status_checks')['do_not_enforce_on_create'] = true;
      parameters(a, 'pull_request')['required_reviewers'] = [];
    });
    const { bevindingen } = await ruleset(endpoints);
    expect(bevindingen).toStrictEqual([]);
  });

  test('nieuwe-app-script/AC-19 een org-ruleset main waarvan het detail ontbreekt wordt niet eens opgehaald', async () => {
    const endpoints = met((a) => {
      a.lijst = [{ id: 7, name: 'main', source_type: 'Organization' }, ...a.lijst];
    });
    const { bevindingen, log } = await ruleset(endpoints);
    expect(bevindingen).toStrictEqual([]);
    expect(
      log.map((args) => args[1]),
      'alleen de lijst en de repo-ruleset',
    ).toStrictEqual([LIJST_PAD, DETAIL_PAD]);
  });

  test('nieuwe-app-script/AC-19 twee afwijkingen in verschillende codes geven beide codes, elk één keer', async () => {
    const endpoints = met((a) => {
      a.detail['enforcement'] = 'disabled';
      a.detail['bypass_actors'] = [{ actor_id: 5 }];
    });
    const { bevindingen } = await ruleset(endpoints);
    expect(bevindingen.map((bevinding) => bevinding.code).toSorted()).toStrictEqual(['BYPASS', 'RULESET_NIET_ACTIEF']);
  });

  test('nieuwe-app-script/AC-19 een andere lijst requiredChecks geeft CHECKS met de ontbrekende naam', async () => {
    const { bevindingen } = await ruleset(
      met(() => undefined),
      [...requiredChecks(), 'nieuwe-check'],
    );
    expect(bevindingen).toStrictEqual([{ code: 'CHECKS', details: ['nieuwe-check'] }]);
  });

  test('nieuwe-app-script/AC-19 geen details bevat een waarde uit een antwoord', async () => {
    const MERK = 'GEHEIME-WAARDE-98765';
    const endpoints = met((a) => {
      a.detail['enforcement'] = MERK;
      a.detail['target'] = MERK;
      a.detail['current_user_can_bypass'] = MERK;
      parameters(a, 'pull_request')['required_approving_review_count'] = 98765;
      parameters(a, 'pull_request')['allowed_merge_methods'] = [MERK];
      parameters(a, 'required_status_checks')['strict_required_status_checks_policy'] = MERK;
      const eerste = checkLijst(a)[0];
      if (eerste !== undefined) eerste['integration_id'] = 98765;
    });
    const { bevindingen } = await ruleset(endpoints);
    expect(bevindingen.length, 'er zijn bevindingen').toBeGreaterThan(0);
    expect(JSON.stringify(bevindingen)).not.toContain('98765');
    expect(JSON.stringify(bevindingen)).not.toContain(MERK);
  });
});

describe('nieuwe-app-script/AC-19: controleerInstellingen', () => {
  test('nieuwe-app-script/AC-19 instellingen gelijk aan playbook 6.2 geven een lege lijst', async () => {
    const { bevindingen } = await instellingen(met(() => undefined));
    expect(bevindingen).toStrictEqual([]);
  });

  const geval = (naam: string, code: string, ...rest: [bouw: () => Endpoints, extra?: Partial<Geval>]): Geval => ({
    naam,
    code,
    bouw: rest[0],
    ...rest[1],
  });
  const repoVeld = (veld: string, waarde: unknown): (() => Endpoints) => {
    return () =>
      met((a) => {
        a.repo[veld] = waarde;
      });
  };

  const INSTELLINGEN: Geval[] = [
    geval('allow_merge_commit onwaar', 'MERGE_METHODEN', repoVeld('allow_merge_commit', false), {
      details: ['allow_merge_commit'],
    }),
    geval('allow_squash_merge onwaar', 'MERGE_METHODEN', repoVeld('allow_squash_merge', false), {
      details: ['allow_squash_merge'],
    }),
    geval('allow_rebase_merge waar', 'MERGE_METHODEN', repoVeld('allow_rebase_merge', true), {
      details: ['allow_rebase_merge'],
    }),
    geval('allow_auto_merge waar', 'MERGE_METHODEN', repoVeld('allow_auto_merge', true), {
      details: ['allow_auto_merge'],
    }),
    geval('delete_branch_on_merge onwaar', 'MERGE_METHODEN', repoVeld('delete_branch_on_merge', false), {
      details: ['delete_branch_on_merge'],
    }),
    geval(
      'default_workflow_permissions write',
      'WORKFLOW_RECHTEN',
      () =>
        met((a) => {
          a.workflow['default_workflow_permissions'] = 'write';
        }),
      { details: ['default_workflow_permissions'] },
    ),
    geval(
      'can_approve_pull_request_reviews waar',
      'WORKFLOW_RECHTEN',
      () =>
        met((a) => {
          a.workflow['can_approve_pull_request_reviews'] = true;
        }),
      { details: ['can_approve_pull_request_reviews'] },
    ),
    geval(
      'enabled onwaar',
      'ACTIONS',
      () =>
        met((a) => {
          a.actions['enabled'] = false;
        }),
      { details: ['enabled'] },
    ),
    geval(
      'allowed_actions selected',
      'ACTIONS',
      () =>
        met((a) => {
          a.actions['allowed_actions'] = 'selected';
        }),
      { details: ['allowed_actions'] },
    ),
    geval(
      'sha_pinning_required onwaar',
      'ACTIONS',
      () =>
        met((a) => {
          a.actions['sha_pinning_required'] = false;
        }),
      { details: ['sha_pinning_required'] },
    ),
    geval(
      'sha_pinning_required ontbreekt: alleen SHA_PINNING_ONBEKEND',
      'SHA_PINNING_ONBEKEND',
      () =>
        met((a) => {
          Reflect.deleteProperty(a.actions, 'sha_pinning_required');
        }),
      { details: [] },
    ),
    geval(
      'repos/<repo> faalt',
      'INSTELLINGEN_ONLEESBAAR',
      () => met(() => undefined, { [REPO_PAD]: faal('gh: Not Found (HTTP 404)') }),
      {
        details: [REPO_PAD],
      },
    ),
    geval(
      'de workflow-permissies geven geen JSON',
      'INSTELLINGEN_ONLEESBAAR',
      () => met(() => undefined, { [WORKFLOW_PAD]: tekst('geen json') }),
      { details: [WORKFLOW_PAD] },
    ),
    geval(
      'actions/permissions faalt',
      'INSTELLINGEN_ONLEESBAAR',
      () => met(() => undefined, { [ACTIONS_PAD]: faal('gh: boom (HTTP 500)') }),
      {
        details: [ACTIONS_PAD],
      },
    ),
    ...['allow_merge_commit', 'allow_rebase_merge', 'delete_branch_on_merge'].map((veld) =>
      geval(
        `${veld} ontbreekt: INSTELLINGEN_ONLEESBAAR, geen MERGE_METHODEN`,
        'INSTELLINGEN_ONLEESBAAR',
        () =>
          met((a) => {
            Reflect.deleteProperty(a.repo, veld);
          }),
        { bevat: veld },
      ),
    ),
    geval(
      'default_workflow_permissions ontbreekt',
      'INSTELLINGEN_ONLEESBAAR',
      () =>
        met((a) => {
          Reflect.deleteProperty(a.workflow, 'default_workflow_permissions');
        }),
      { bevat: 'default_workflow_permissions' },
    ),
    geval(
      'allowed_actions ontbreekt',
      'INSTELLINGEN_ONLEESBAAR',
      () =>
        met((a) => {
          Reflect.deleteProperty(a.actions, 'allowed_actions');
        }),
      { bevat: 'allowed_actions' },
    ),
  ];

  test.each(INSTELLINGEN)('nieuwe-app-script/AC-19 $naam geeft precies $code', async (g) => {
    eisGeval(await instellingen(g.bouw()), g);
  });

  test('nieuwe-app-script/AC-19 afwijkingen in verschillende codes geven elk hun code, één keer', async () => {
    const endpoints = met((a) => {
      a.repo['allow_rebase_merge'] = true;
      a.workflow['default_workflow_permissions'] = 'write';
      a.actions['allowed_actions'] = 'selected';
    });
    const { bevindingen } = await instellingen(endpoints);
    expect(bevindingen.map((bevinding) => bevinding.code).toSorted()).toStrictEqual([
      'ACTIONS',
      'MERGE_METHODEN',
      'WORKFLOW_RECHTEN',
    ]);
  });

  test('nieuwe-app-script/AC-19 geen details bevat een waarde uit een antwoord', async () => {
    const MERK = 'GEHEIME-WAARDE-54321';
    const endpoints = met((a) => {
      a.repo['allow_rebase_merge'] = MERK;
      a.workflow['default_workflow_permissions'] = MERK;
      a.actions['allowed_actions'] = MERK;
    });
    const { bevindingen } = await instellingen(endpoints);
    expect(bevindingen.length, 'er zijn bevindingen').toBeGreaterThan(0);
    expect(JSON.stringify(bevindingen)).not.toContain(MERK);
  });
});

describe('nieuwe-app-script/AC-19: alleen lezen, zonder exceptie, alleen node:-imports', () => {
  const ONGELDIG_VLAG = new Set(['-X', '--method', '--input', '-f', '-F', '--field']);

  function eisAlleenLezen(log: string[][]): void {
    expect(log.length, 'er is minstens één gh-aanroep').toBeGreaterThan(0);
    for (const args of log) {
      expect(args[0], `gh ${args.join(' ')} begint met api`).toBe('api');
      expect(
        args.filter((arg) => ONGELDIG_VLAG.has(arg) || arg.startsWith('--method=') || arg.startsWith('--field=')),
        `gh ${args.join(' ')} bevat een schrijvende vlag`,
      ).toStrictEqual([]);
    }
  }

  test('nieuwe-app-script/AC-19 elke gh-aanroep begint met api en bevat geen -X, --method, --input, -f, -F of --field', async () => {
    const gezond = met(() => undefined);
    const stuk = met((a) => {
      a.detail['enforcement'] = 'disabled';
      a.repo['allow_rebase_merge'] = true;
    });
    for (const endpoints of [gezond, stuk, {}]) {
      eisAlleenLezen((await ruleset(endpoints)).log);
      eisAlleenLezen((await instellingen(endpoints)).log);
    }
  });

  test('nieuwe-app-script/AC-19 een gh die faalt of geen JSON geeft levert een ONLEESBAAR-code en geen exceptie', async () => {
    const mod = await laad();
    const geenJson = (): ReturnType<GhFunctie> => ({ ok: true, stdout: 'geen json', stderr: '' });
    const faalt = (): ReturnType<GhFunctie> => ({ ok: false, stdout: '', stderr: 'netwerk weg' });
    for (const gh of [geenJson, faalt]) {
      const r = Bevindingen.parse(await mod.controleerRuleset(gh, { repo: REPO, requiredChecks: requiredChecks() }));
      expect(r.map((bevinding) => bevinding.code)).toStrictEqual(['RULESET_ONLEESBAAR']);
      expect(r[0]?.details).toStrictEqual([LIJST_PAD]);
      const i = Bevindingen.parse(await mod.controleerInstellingen(gh, { repo: REPO }));
      expect(i.map((bevinding) => bevinding.code)).toStrictEqual(['INSTELLINGEN_ONLEESBAAR']);
      expect(i[0]?.details.toSorted()).toStrictEqual([ACTIONS_PAD, REPO_PAD, WORKFLOW_PAD].toSorted());
    }
  });

  test('nieuwe-app-script/AC-19 de module heeft alleen statische imports met voorvoegsel node: en geen dynamische import()', () => {
    expect(existsSync(MODULE), MIST).toBe(true);
    const bron = readFileSync(MODULE, 'utf8');
    const imports = [
      ...[...bron.matchAll(/^\s*(?:import|export)\s[^;]*?\sfrom\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? ''),
      ...[...bron.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? ''),
    ];
    expect(imports.filter((naam) => !naam.startsWith('node:'))).toStrictEqual([]);
    expect([...bron.matchAll(/\bimport\s*\(/g)]).toHaveLength(0);
  });

  test('nieuwe-app-script/AC-19 de module exporteert controleerRuleset en controleerInstellingen', async () => {
    const mod = await laad();
    expect(typeof mod.controleerRuleset).toBe('function');
    expect(typeof mod.controleerInstellingen).toBe('function');
  });
});

// De helper zelf: json() levert een antwoord dat de module als JSON kan lezen.
test('nieuwe-app-script/AC-19 de helper bouwt een ruleset-antwoord met id en current_user_can_bypass never', () => {
  const a = goedeAntwoorden();
  expect(a.detail['id']).toBe(RULESET_ID);
  expect(a.detail['current_user_can_bypass']).toBe('never');
  expect(json(a.detail).exit).toBe(0);
});
