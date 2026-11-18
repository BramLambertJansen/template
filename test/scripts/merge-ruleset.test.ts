import { describe, expect, test } from 'vitest';
import { beoordeelMerge } from '../../scripts/kit/pr-merge.mjs';

// templateregime AC-14: het mergescript merget alleen als GitHub de grens van ADR 0089 punt 2 echt bewaakt voor wie het
// script draait: een `pull_request`-regel met `require_code_owner_review: true`, een ruleset waar de aanroeper niet langs
// kan (`current_user_can_bypass: "never"`) en een `CODEOWNERS` zonder fouten. De wereld `goed` is mergebaar; elke test
// verandert precies één antwoord. Elke aanroep naar een onbekend endpoint gooit, zoals een 404 of een netwerkfout.
const REPO = 'BramLambertJansen/template';
const HEAD = 'a'.repeat(40);
const MAIN = 'b'.repeat(40);
const ACTIONS = 15368;
const VEREIST = ['gate:fast', 'check-core'];
const RULESET = 27109225;
const b64 = (waarde: unknown) => Buffer.from(JSON.stringify(waarde)).toString('base64');

const REDEN_GEEN_REVIEW = 'de ruleset op main bewaakt geen review van een code-eigenaar: de eigenaar merget';
const REDEN_BYPASS = 'wie dit script draait kan de ruleset passeren: de eigenaar merget';
const REDEN_CODEOWNERS = '`CODEOWNERS` op main heeft fouten';
const REDEN_ONLEESBAAR = 'de ruleset of `CODEOWNERS` op main is niet te lezen: de eigenaar merget';

type Pagina = (pagina: number) => unknown;
type Wereld = Record<string, unknown>;

const isPagina = (waarde: unknown): waarde is Pagina => typeof waarde === 'function';

const RULES = `repos/${REPO}/rules/branches/main`;
const ruleset = (id: number) => `repos/${REPO}/rulesets/${String(id)}`;
const CODEOWNERS = `repos/${REPO}/codeowners/errors?ref=${MAIN}`;

function check(name: string, sha: string, extra: Record<string, unknown> = {}) {
  return { id: 1, name, head_sha: sha, status: 'completed', conclusion: 'success', app: { id: ACTIONS }, ...extra };
}

const pullRegel = (parameters: unknown, id = RULESET) => ({
  type: 'pull_request',
  ruleset_id: id,
  ruleset_source_type: 'Repository',
  ruleset_source: REPO,
  ...(parameters === undefined ? {} : { parameters }),
});
const GOEDE_REGEL = pullRegel({ require_code_owner_review: true, required_approving_review_count: 1 });
const rulesetAntwoord = (bypass: unknown) => ({
  name: 'main',
  enforcement: 'active',
  bypass_actors: [],
  ...(bypass === undefined ? {} : { current_user_can_bypass: bypass }),
});

function goed(): Wereld {
  return {
    [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
    [`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`]: { content: b64({ merge: 'niet-kritiek' }) },
    [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
    [`repos/${REPO}/pulls/7`]: {
      state: 'open',
      draft: false,
      base: { ref: 'main' },
      head: { sha: HEAD, repo: { full_name: REPO } },
      additions: 10,
      deletions: 2,
    },
    [`repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: VEREIST.map((n) => check(n, HEAD)) },
    [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [check('gate:fast', MAIN)] },
    [RULES]: [{ type: 'non_fast_forward', ruleset_id: RULESET }, GOEDE_REGEL],
    [ruleset(RULESET)]: rulesetAntwoord('never'),
    [CODEOWNERS]: { errors: [] },
  };
}

/** Een nep-API: onbekend endpoint gooit; een functie als waarde krijgt het paginanummer; `aanroepen` onthoudt alles. */
function api(wereld: Wereld, aanroepen: string[] = []) {
  return (endpoint: string) => {
    aanroepen.push(endpoint);
    const pagina = Number(/[?&]page=(\d+)/.exec(endpoint)?.[1] ?? '1');
    const sleutel = endpoint.replace(/[?&]per_page=100/, '').replace(/[?&]page=\d+/, '');
    if (!(sleutel in wereld)) throw new Error(`HTTP 404: ${sleutel}`);
    const waarde = wereld[sleutel];
    if (waarde instanceof Error) throw waarde;
    return isPagina(waarde) ? waarde(pagina) : waarde;
  };
}

function beoordeel(aanpassing: (w: Wereld) => void = () => {}) {
  const wereld = goed();
  aanpassing(wereld);
  return beoordeelMerge(api(wereld), { repo: REPO, nummer: 7, head: HEAD }).redenen;
}

const zet = (sleutel: string, waarde: unknown) => (w: Wereld) => {
  w[sleutel] = waarde;
};

describe('templateregime/AC-14 ruleset bewaakt de review van een code-eigenaar', () => {
  test('templateregime/AC-14: ruleset met code-owner-review, geen bypass en schone CODEOWNERS: geen reden', () => {
    expect(beoordeel()).toEqual([]);
  });

  test('templateregime/AC-14: de rules-API wordt voor main gelezen, met de SHA van main voor CODEOWNERS', () => {
    const aanroepen: string[] = [];
    beoordeelMerge(api(goed(), aanroepen), { repo: REPO, nummer: 7, head: HEAD });
    expect(aanroepen.some((e) => e.startsWith(RULES))).toBe(true);
    expect(aanroepen.some((e) => e.startsWith(ruleset(RULESET)))).toBe(true);
    expect(aanroepen.some((e) => e.startsWith(CODEOWNERS))).toBe(true);
  });

  describe('punt 1: een pull_request-regel met require_code_owner_review gelijk aan true', () => {
    test.each([
      ['een lege lijst regels (repo zonder ruleset)', []],
      ['alleen regels van een ander type', [{ type: 'non_fast_forward', ruleset_id: RULESET }]],
      ['een pull_request-regel met false', [pullRegel({ require_code_owner_review: false })]],
      ['een pull_request-regel zonder parameters', [pullRegel(undefined)]],
      ['een pull_request-regel met een lege parameters', [pullRegel({})]],
      ['require_code_owner_review als tekst "true"', [pullRegel({ require_code_owner_review: 'true' })]],
    ])('templateregime/AC-14: %s: de eigenaar merget', (_naam, regels) => {
      expect(beoordeel(zet(RULES, regels))).toEqual([REDEN_GEEN_REVIEW]);
    });

    test('templateregime/AC-14: meerdere regels waarvan één goed: geen reden', () => {
      const regels = [
        { type: 'non_fast_forward', ruleset_id: 1 },
        pullRegel({ require_code_owner_review: false }, 111),
        pullRegel(undefined, 222),
        GOEDE_REGEL,
      ];
      const wereld = (w: Wereld) => {
        w[RULES] = regels;
        w[ruleset(111)] = rulesetAntwoord('always');
        w[ruleset(222)] = rulesetAntwoord('always');
      };
      expect(beoordeel(wereld)).toEqual([]);
    });

    test('templateregime/AC-14: een goede regel op de tweede pagina telt mee (paginering)', () => {
      const vol = Array.from({ length: 100 }, () => ({ type: 'non_fast_forward', ruleset_id: 1 }));
      const paginas: Pagina = (pagina) => (pagina === 1 ? vol : [GOEDE_REGEL]);
      expect(beoordeel(zet(RULES, paginas))).toEqual([]);
    });

    test('templateregime/AC-14: een slechte regel op de eerste en een goede op de tweede pagina: geen reden', () => {
      const vol = Array.from({ length: 99 }, () => ({ type: 'non_fast_forward', ruleset_id: 1 }));
      const paginas: Pagina = (pagina) =>
        pagina === 1 ? [...vol, pullRegel({ require_code_owner_review: false }, 111)] : [GOEDE_REGEL];
      const wereld = (w: Wereld) => {
        w[RULES] = paginas;
        w[ruleset(111)] = rulesetAntwoord('never');
      };
      expect(beoordeel(wereld)).toEqual([]);
    });
  });

  describe('punt 2: current_user_can_bypass gelijk aan "never"', () => {
    test.each([['always'], ['pull_requests_only'], ['exempt']])(
      'templateregime/AC-14: current_user_can_bypass %j: wie het script draait kan passeren',
      (bypass) => {
        expect(beoordeel(zet(ruleset(RULESET), rulesetAntwoord(bypass)))).toEqual([REDEN_BYPASS]);
      },
    );

    test('templateregime/AC-14: twee rulesets met review-regel, één zonder bypass: genoeg, geen reden', () => {
      const wereld = (w: Wereld) => {
        w[RULES] = [
          pullRegel({ require_code_owner_review: true }, 1),
          pullRegel({ require_code_owner_review: true }, 2),
        ];
        w[ruleset(1)] = rulesetAntwoord('always');
        w[ruleset(2)] = rulesetAntwoord('never');
      };
      expect(beoordeel(wereld)).toEqual([]);
    });

    test('templateregime/AC-14: twee rulesets met review-regel, beide met bypass: de eigenaar merget', () => {
      const wereld = (w: Wereld) => {
        w[RULES] = [
          pullRegel({ require_code_owner_review: true }, 1),
          pullRegel({ require_code_owner_review: true }, 2),
        ];
        w[ruleset(1)] = rulesetAntwoord('always');
        w[ruleset(2)] = rulesetAntwoord('pull_requests_only');
      };
      expect(beoordeel(wereld)).toEqual([REDEN_BYPASS]);
    });

    test('templateregime/AC-14: het veld current_user_can_bypass ontbreekt: niet te lezen', () => {
      expect(beoordeel(zet(ruleset(RULESET), rulesetAntwoord(undefined)))).toEqual([REDEN_ONLEESBAAR]);
    });

    test.each([[null], ['kapot'], [[]]])('templateregime/AC-14: ruleset-antwoord %j: niet te lezen', (antwoord) => {
      expect(beoordeel(zet(ruleset(RULESET), antwoord))).toEqual([REDEN_ONLEESBAAR]);
    });
  });

  describe('punt 3: CODEOWNERS op main zonder fouten', () => {
    test('templateregime/AC-14: codeowners/errors met fouten: CODEOWNERS heeft fouten', () => {
      const fouten = { errors: [{ line: 3, column: 1, kind: 'Invalid owner', message: 'Unknown owner' }] };
      expect(beoordeel(zet(CODEOWNERS, fouten))).toEqual([REDEN_CODEOWNERS]);
    });

    test('templateregime/AC-14: antwoord zonder errors-lijst: niet te lezen', () => {
      expect(beoordeel(zet(CODEOWNERS, {}))).toEqual([REDEN_ONLEESBAAR]);
    });

    test('templateregime/AC-14: errors is geen lijst: niet te lezen', () => {
      expect(beoordeel(zet(CODEOWNERS, { errors: 'geen' }))).toEqual([REDEN_ONLEESBAAR]);
    });
  });

  describe('niet te lezen: fail-closed zonder exceptie naar buiten', () => {
    test.each([
      ['rules/branches/main', RULES],
      [`rulesets/${String(RULESET)}`, ruleset(RULESET)],
      ['codeowners/errors (geen CODEOWNERS op main: 404)', CODEOWNERS],
    ])('templateregime/AC-14: 404 op %s: niet te lezen, geen exceptie', (_naam, sleutel) => {
      const wereld = goed();
      Reflect.deleteProperty(wereld, sleutel);
      const redenen = beoordeelMerge(api(wereld), { repo: REPO, nummer: 7, head: HEAD }).redenen;
      expect(redenen).toEqual([REDEN_ONLEESBAAR]);
    });

    test.each([
      ['rules/branches/main', RULES],
      [`rulesets/${String(RULESET)}`, ruleset(RULESET)],
      ['codeowners/errors', CODEOWNERS],
    ])('templateregime/AC-14: een gooiende API op %s: niet te lezen, geen exceptie', (_naam, sleutel) => {
      const wereld = goed();
      wereld[sleutel] = new Error('netwerk weg');
      expect(() => beoordeelMerge(api(wereld), { repo: REPO, nummer: 7, head: HEAD })).not.toThrow();
      expect(beoordeel(zet(sleutel, new Error('netwerk weg')))).toEqual([REDEN_ONLEESBAAR]);
    });

    test.each([[null], [{}], ['kapot'], [{ regels: [] }]])(
      'templateregime/AC-14: rules-antwoord %j heeft een ongeldige vorm: niet te lezen',
      (antwoord) => {
        expect(beoordeel(zet(RULES, antwoord))).toEqual([REDEN_ONLEESBAAR]);
      },
    );

    test('templateregime/AC-14: een pull_request-regel zonder ruleset_id: niet te lezen, geen merge', () => {
      const regel = { type: 'pull_request', parameters: { require_code_owner_review: true } };
      expect(beoordeel(zet(RULES, [regel]))).toEqual([REDEN_ONLEESBAAR]);
    });

    test('templateregime/AC-14: klassieke branch protection zonder ruleset (rules-API leeg): weigert', () => {
      expect(beoordeel(zet(RULES, []))).toContain(REDEN_GEEN_REVIEW);
    });
  });

  describe('volgorde en samenloop met de bestaande redenen', () => {
    test.each([
      ['modus eigenaar', { merge: 'eigenaar' }],
      ['modus ontbreekt', {}],
    ])('templateregime/AC-14: %s stopt eerst: de nieuwe endpoints worden niet aangeroepen', (_naam, gates) => {
      const wereld = goed();
      wereld[`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`] = { content: b64(gates) };
      const aanroepen: string[] = [];
      const { redenen } = beoordeelMerge(api(wereld, aanroepen), { repo: REPO, nummer: 7, head: HEAD });
      expect(redenen).toEqual(['de modus op main is niet "niet-kritiek": de eigenaar merget']);
      expect(aanroepen.filter((e) => /rules\/branches|rulesets|codeowners/.test(e))).toEqual([]);
    });

    test('templateregime/AC-14: de modus eigenaar geeft geen ruleset-redenen ook als de ruleset ontbreekt', () => {
      const wereld = goed();
      wereld[`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`] = { content: b64({ merge: 'eigenaar' }) };
      Reflect.deleteProperty(wereld, RULES);
      expect(beoordeelMerge(api(wereld), { repo: REPO, nummer: 7, head: HEAD }).redenen).toHaveLength(1);
    });

    test('templateregime/AC-14: geen vroege return: rode check en ontbrekende review-regel staan naast elkaar', () => {
      const wereld = (w: Wereld) => {
        w[`repos/${REPO}/commits/${HEAD}/check-runs`] = {
          check_runs: [check('gate:fast', HEAD, { conclusion: 'failure' }), check('check-core', HEAD)],
        };
        w[RULES] = [];
      };
      const redenen = beoordeel(wereld);
      expect(redenen.join('\n')).toMatch(/verplichte checks niet groen/);
      expect(redenen).toContain(REDEN_GEEN_REVIEW);
    });

    test('templateregime/AC-14: geen vroege return: gesloten PR, bypass en CODEOWNERS-fouten staan naast elkaar', () => {
      const wereld = (w: Wereld) => {
        w[`repos/${REPO}/pulls/7`] = {
          state: 'closed',
          draft: false,
          base: { ref: 'main' },
          head: { sha: HEAD, repo: { full_name: REPO } },
        };
        w[ruleset(RULESET)] = rulesetAntwoord('always');
        w[CODEOWNERS] = { errors: [{ line: 1 }] };
      };
      const redenen = beoordeel(wereld);
      expect(redenen.join('\n')).toMatch(/niet open/);
      expect(redenen).toContain(REDEN_BYPASS);
      expect(redenen).toContain(REDEN_CODEOWNERS);
    });

    test('templateregime/AC-14: een groene werkelijkheid met een rode main houdt ook de main-reden', () => {
      const wereld = (w: Wereld) => {
        w[`repos/${REPO}/commits/${MAIN}/check-runs`] = {
          check_runs: [check('gate:fast', MAIN, { conclusion: 'failure' })],
        };
        w[CODEOWNERS] = { errors: [{ line: 1 }] };
      };
      const redenen = beoordeel(wereld);
      expect(redenen.join('\n')).toMatch(/main is niet groen/);
      expect(redenen).toContain(REDEN_CODEOWNERS);
    });

    test('templateregime/AC-14: bypass en CODEOWNERS-fouten tegelijk: beide redenen, in die volgorde', () => {
      const wereld = (w: Wereld) => {
        w[RULES] = [pullRegel({ require_code_owner_review: true })];
        w[ruleset(RULESET)] = rulesetAntwoord('always');
        w[CODEOWNERS] = { errors: [{ line: 1 }] };
      };
      expect(beoordeel(wereld)).toEqual([REDEN_BYPASS, REDEN_CODEOWNERS]);
    });
  });
});
