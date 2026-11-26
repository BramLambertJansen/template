// Alleen-lezende controle van de ruleset `main` en de repo-instellingen op GitHub (spec
// docs/template/specs/nieuwe-app-script.md, werking 7, OV-8): het begin van scripts/check-github.mjs uit roadmap ST-01.
// `controleerRuleset` toetst tegen de payload van scripts/github-ruleset.sh (ADR 0093 punt 2), `controleerInstellingen`
// tegen playbook 6.2 (docs/nieuwe-app.md). Beide geven een lijst `{ code, details }` (leeg = gelijk); `details` zijn namen
// (veld, regeltype, checknaam of endpoint), nooit een waarde uit een antwoord. Geen eigen teksten: de aanroeper maakt die.
// `gh` is geïnjecteerd met de vorm van `voer()` in scripts/kit/nieuwe-app.mjs, `(args) => { ok, stdout, stderr }`, en wordt
// alleen aangeroepen als `api <endpoint>`; nooit een exceptie bij een gh-fout of ongeldige JSON. Alleen `node:`-modules
// (hier geen), zodat scripts/kit/nieuwe-app.mjs het los kan laden. Getest in test/scripts/ruleset-controle.test.ts.

/**
 * @typedef {{ ok: boolean, stdout: string, stderr: string }} GhUitvoer
 * @typedef {(args: string[]) => GhUitvoer} Gh
 * @typedef {{ code: string, details: string[] }} Bevinding
 * @typedef {Record<string, unknown>} Obj
 * @typedef {{ afwijkend: string[], ontbreekt: string[] }} Toets
 */

const GITHUB_ACTIONS = 15368;
const REGELTYPES = ['deletion', 'non_fast_forward', 'pull_request', 'required_status_checks'];
/** De parameters van de regel `pull_request` zoals scripts/github-ruleset.sh ze zet; `allowed_merge_methods` apart. */
const PULL_REQUEST = /** @type {const} */ ([
  ['required_approving_review_count', 0],
  ['dismiss_stale_reviews_on_push', true],
  ['require_code_owner_review', false],
  ['require_last_push_approval', false],
  ['required_review_thread_resolution', true],
]);
const MERGE_INSTELLINGEN = /** @type {const} */ ([
  ['allow_merge_commit', true],
  ['allow_squash_merge', true],
  ['allow_rebase_merge', false],
  ['allow_auto_merge', false],
  ['delete_branch_on_merge', true],
]);
const WORKFLOW_INSTELLINGEN = /** @type {const} */ ([
  ['default_workflow_permissions', 'read'],
  ['can_approve_pull_request_reviews', false],
]);
const ACTIONS_INSTELLINGEN = /** @type {const} */ ([
  ['enabled', true],
  ['allowed_actions', 'all'],
]);

// --- hulpjes ---------------------------------------------------------------------------------------------------------------

/** @param {unknown} waarde @returns {waarde is Obj} */
function isObj(waarde) {
  return typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde);
}

/** @param {Obj} o @param {string} naam */
function heeft(o, naam) {
  return Object.hasOwn(o, naam);
}

/**
 * `gh api <endpoint>` als JSON; `undefined` bij een gh-fout of geen JSON.
 * @param {Gh} gh @param {string} endpoint @returns {{ json: unknown, uit: GhUitvoer }}
 */
function haal(gh, endpoint) {
  /** @type {GhUitvoer} */
  let uit;
  try {
    uit = gh(['api', endpoint]);
  } catch {
    return { json: undefined, uit: { ok: false, stdout: '', stderr: '' } };
  }
  if (!uit.ok) return { json: undefined, uit };
  try {
    return { json: JSON.parse(uit.stdout), uit };
  } catch {
    return { json: undefined, uit };
  }
}

/** @returns {Toets} */
function leeg() {
  return { afwijkend: [], ontbreekt: [] };
}

/**
 * Vergelijk vaste velden van een object; een ontbrekend veld telt als onleesbaar, niet als afwijking.
 * @param {Obj} o @param {ReadonlyArray<readonly [string, unknown]>} verwacht @param {string} [voor] voorvoegsel van de naam
 * @returns {Toets}
 */
function velden(o, verwacht, voor = '') {
  const toets = leeg();
  for (const [naam, waarde] of verwacht) {
    if (!heeft(o, naam)) toets.ontbreekt.push(`${voor}${naam}`);
    else if (o[naam] !== waarde) toets.afwijkend.push(`${voor}${naam}`);
  }
  return toets;
}

/** @param {unknown} waarde @param {readonly string[]} verwacht precies deze tekst, als verzameling */
function zelfdeVerzameling(waarde, verwacht) {
  if (!Array.isArray(waarde) || waarde.length !== verwacht.length) return false;
  return verwacht.every((naam) => waarde.includes(naam));
}

/** @param {string} code @param {string[]} details @returns {Bevinding[]} */
function bevinding(code, details) {
  return details.length === 0 ? [] : [{ code, details }];
}

/**
 * Bevindingen per code plus één `…_ONLEESBAAR` voor alle ontbrekende velden.
 * @param {ReadonlyArray<readonly [string, Toets]>} toetsen @param {string} onleesbaar @returns {Bevinding[]}
 */
function verzamel(toetsen, onleesbaar) {
  const uit = toetsen.flatMap(([code, toets]) => bevinding(code, toets.afwijkend));
  return [
    ...uit,
    ...bevinding(
      onleesbaar,
      toetsen.flatMap(([, toets]) => toets.ontbreekt),
    ),
  ];
}

// --- ruleset: de lijst en het detail ---------------------------------------------------------------------------------------

/**
 * Het id van de repo-ruleset `main` uit de lijst, of een bevinding. Org-rulesets tellen niet.
 * @param {Gh} gh @param {string} repo @returns {{ id: unknown } | { bevindingen: Bevinding[] }}
 */
function zoekRuleset(gh, repo) {
  const pad = `repos/${repo}/rulesets`;
  const { json, uit } = haal(gh, pad);
  if (!uit.ok && `${uit.stdout}\n${uit.stderr}`.includes('Upgrade to GitHub Pro'))
    return { bevindingen: [{ code: 'RULESETS_NIET_BESCHIKBAAR', details: [] }] };
  if (!Array.isArray(json) || !json.every(isObj))
    return { bevindingen: [{ code: 'RULESET_ONLEESBAAR', details: [pad] }] };
  const ontbreekt = ['name', 'source_type'].filter((naam) => json.some((item) => !heeft(item, naam)));
  if (ontbreekt.length > 0) return { bevindingen: [{ code: 'RULESET_ONLEESBAAR', details: ontbreekt }] };
  const gevonden = json.find((item) => item['name'] === 'main' && item['source_type'] === 'Repository');
  if (gevonden === undefined) return { bevindingen: [{ code: 'GEEN_RULESET', details: [] }] };
  if (!heeft(gevonden, 'id')) return { bevindingen: [{ code: 'RULESET_ONLEESBAAR', details: ['id'] }] };
  return { id: gevonden['id'] };
}

/** @param {Obj} detail @returns {Toets} */
function toetsActief(detail) {
  const toets = velden(detail, [
    ['enforcement', 'active'],
    ['target', 'branch'],
  ]);
  const conditions = detail['conditions'];
  if (!isObj(conditions)) {
    toets.ontbreekt.push('conditions');
    return toets;
  }
  const refName = conditions['ref_name'];
  if (!isObj(refName) || !heeft(refName, 'include') || !heeft(refName, 'exclude'))
    toets.ontbreekt.push('conditions.ref_name');
  else if (!zelfdeVerzameling(refName['include'], ['~DEFAULT_BRANCH']) || !zelfdeVerzameling(refName['exclude'], []))
    toets.afwijkend.push('conditions.ref_name');
  return toets;
}

/** @param {Obj} detail @returns {Toets} */
function toetsBypass(detail) {
  const toets = velden(detail, [['current_user_can_bypass', 'never']]);
  const actors = detail['bypass_actors'];
  if (!Array.isArray(actors)) toets.ontbreekt.push('bypass_actors');
  else if (actors.length > 0) toets.afwijkend.push('bypass_actors');
  return toets;
}

/**
 * De regels per type; `undefined` als `rules` ontbreekt of geen lijst van regels is.
 * @param {Obj} detail @returns {Map<string, Obj> | undefined}
 */
function regels(detail) {
  const lijst = detail['rules'];
  if (!Array.isArray(lijst) || !lijst.every((r) => isObj(r) && typeof r['type'] === 'string')) return undefined;
  return new Map(lijst.map((r) => [String(r['type']), r]));
}

/**
 * De parameters van een regel; een ontbrekend `parameters` staat in `toets.ontbreekt`.
 * @param {Obj} regel @param {string} type @param {Toets} toets @returns {Obj | undefined}
 */
function parametersVan(regel, type, toets) {
  const parameters = regel['parameters'];
  if (isObj(parameters)) return parameters;
  toets.ontbreekt.push(`${type}.parameters`);
  return undefined;
}

/** @param {Map<string, Obj>} perType @returns {Toets} */
function toetsRegels(perType) {
  const toets = leeg();
  toets.afwijkend.push(...REGELTYPES.slice(0, 3).filter((type) => !perType.has(type)));
  toets.afwijkend.push(...[...perType.keys()].filter((type) => !REGELTYPES.includes(type)));
  const regel = perType.get('pull_request');
  const parameters = regel === undefined ? undefined : parametersVan(regel, 'pull_request', toets);
  if (parameters === undefined) return toets;
  const pr = velden(parameters, PULL_REQUEST, 'pull_request.');
  toets.afwijkend.push(...pr.afwijkend);
  toets.ontbreekt.push(...pr.ontbreekt);
  if (!heeft(parameters, 'allowed_merge_methods')) toets.ontbreekt.push('pull_request.allowed_merge_methods');
  else if (!zelfdeVerzameling(parameters['allowed_merge_methods'], ['merge', 'squash']))
    toets.afwijkend.push('pull_request.allowed_merge_methods');
  return toets;
}

/**
 * De checknamen die ontbreken, extra zijn of een ander `integration_id` hebben.
 * @param {unknown[]} checks @param {readonly string[]} requiredChecks @returns {Toets}
 */
function toetsCheckNamen(checks, requiredChecks) {
  const toets = leeg();
  if (!checks.every((check) => isObj(check) && typeof check['context'] === 'string')) {
    toets.ontbreekt.push('required_status_checks.required_status_checks');
    return toets;
  }
  const lijst = checks.filter(isObj);
  const namen = lijst.map((check) => String(check['context']));
  toets.afwijkend.push(...requiredChecks.filter((naam) => !namen.includes(naam)));
  toets.afwijkend.push(...namen.filter((naam) => !requiredChecks.includes(naam)));
  const bron = lijst.filter(
    (check) => check['integration_id'] !== GITHUB_ACTIONS && requiredChecks.includes(String(check['context'])),
  );
  toets.afwijkend.push(...bron.map((check) => String(check['context'])));
  return toets;
}

/** @param {Map<string, Obj>} perType @param {readonly string[]} requiredChecks @returns {Toets} */
function toetsChecks(perType, requiredChecks) {
  const toets = leeg();
  const regel = perType.get('required_status_checks');
  if (regel === undefined) return { afwijkend: ['required_status_checks'], ontbreekt: [] };
  const parameters = parametersVan(regel, 'required_status_checks', toets);
  if (parameters === undefined) return toets;
  const strikt = velden(parameters, [['strict_required_status_checks_policy', false]], 'required_status_checks.');
  toets.ontbreekt.push(...strikt.ontbreekt);
  if (strikt.afwijkend.length > 0) toets.afwijkend.push('strict_required_status_checks_policy');
  const checks = parameters['required_status_checks'];
  if (!Array.isArray(checks)) toets.ontbreekt.push('required_status_checks.required_status_checks');
  else {
    const namen = toetsCheckNamen(checks, requiredChecks);
    toets.afwijkend.push(...namen.afwijkend);
    toets.ontbreekt.push(...namen.ontbreekt);
  }
  return toets;
}

/**
 * Bevindingen uit het detail van de ruleset (`repos/<repo>/rulesets/<id>`).
 * @param {Obj} detail @param {readonly string[]} requiredChecks @returns {Bevinding[]}
 */
function toetsDetail(detail, requiredChecks) {
  const perType = regels(detail);
  /** @type {Array<[string, Toets]>} */
  const toetsen = [
    ['RULESET_NIET_ACTIEF', toetsActief(detail)],
    ['BYPASS', toetsBypass(detail)],
  ];
  if (perType === undefined) toetsen.push(['REGELS', { afwijkend: [], ontbreekt: ['rules'] }]);
  else toetsen.push(['REGELS', toetsRegels(perType)], ['CHECKS', toetsChecks(perType, requiredChecks)]);
  return verzamel(toetsen, 'RULESET_ONLEESBAAR');
}

/**
 * De ruleset `main` van de repo tegen de payload van scripts/github-ruleset.sh.
 * @param {Gh} gh @param {{ repo: string, requiredChecks: readonly string[] }} opties @returns {Bevinding[]}
 */
export function controleerRuleset(gh, { repo, requiredChecks }) {
  const gezocht = zoekRuleset(gh, repo);
  if ('bevindingen' in gezocht) return gezocht.bevindingen;
  const pad = `repos/${repo}/rulesets/${String(gezocht.id)}`;
  const { json } = haal(gh, pad);
  if (!isObj(json)) return [{ code: 'RULESET_ONLEESBAAR', details: [pad] }];
  return toetsDetail(json, requiredChecks);
}

// --- instellingen (playbook 6.2) -------------------------------------------------------------------------------------------

/** ACTIONS; een ontbrekend `sha_pinning_required` is SHA_PINNING_ONBEKEND, geen afwijking. @param {Obj} actions @returns {Toets} */
function toetsActions(actions) {
  const toets = velden(actions, ACTIONS_INSTELLINGEN);
  if (heeft(actions, 'sha_pinning_required') && actions['sha_pinning_required'] !== true)
    toets.afwijkend.push('sha_pinning_required');
  return toets;
}

/**
 * De repo-instellingen tegen playbook 6.2: merge-methoden, workflow-rechten en Actions.
 * @param {Gh} gh @param {{ repo: string }} opties @returns {Bevinding[]}
 */
export function controleerInstellingen(gh, { repo }) {
  const paden = [`repos/${repo}`, `repos/${repo}/actions/permissions/workflow`, `repos/${repo}/actions/permissions`];
  const [repoJson, workflow, actions] = paden.map((pad) => haal(gh, pad).json);
  const onleesbaar = paden.filter((_pad, i) => !isObj([repoJson, workflow, actions][i]));
  /** @type {Array<[string, Toets]>} */
  const toetsen = [['INSTELLINGEN_ONLEESBAAR', { afwijkend: [], ontbreekt: onleesbaar }]];
  if (isObj(repoJson)) toetsen.push(['MERGE_METHODEN', velden(repoJson, MERGE_INSTELLINGEN)]);
  if (isObj(workflow)) toetsen.push(['WORKFLOW_RECHTEN', velden(workflow, WORKFLOW_INSTELLINGEN)]);
  const shaOnbekend = isObj(actions) && !heeft(actions, 'sha_pinning_required');
  if (isObj(actions)) toetsen.push(['ACTIONS', toetsActions(actions)]);
  const uit = verzamel(toetsen, 'INSTELLINGEN_ONLEESBAAR');
  return shaOnbekend ? [...uit, { code: 'SHA_PINNING_ONBEKEND', details: [] }] : uit;
}
