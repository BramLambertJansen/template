import { describe, expect, test } from 'vitest';
import { checkedCommit } from '../../rails/hooks/lib/built-evidence.mjs';
import { parseCheckRun, parsePullRequest } from '../../scripts/kit/github-evidence.mjs';

// GEWIJZIGD (spec gebouwd-zonder-nummer, ADR 0095): `canRecordBuilt` en de gevallen daarvan zijn weg met `pnpm docs:status`;
// de typen komen nu uit de parsers die blijven.
type CheckRun = ReturnType<typeof parseCheckRun>;
type PullRequest = ReturnType<typeof parsePullRequest>;

// Autoritatieve feiten als invoer voor pure validators; deze tests vervangen geen GitHub- of applicatiecontrole.
const REPOSITORY = 'BramLambertJansen/template';
const BRANCH = 'feat/built-evidence';
const VALIDATED_SHA = 'a'.repeat(40);
const CURRENT_SHA = 'b'.repeat(40);
const REQUIRED = { names: ['gate:fast', 'gate:slow'], sha: VALIDATED_SHA };

function check(overrides: Partial<CheckRun> = {}): CheckRun {
  return {
    id: 101,
    name: 'gate:fast',
    headSha: VALIDATED_SHA,
    status: 'completed',
    conclusion: 'success',
    appId: 15368,
    ...overrides,
  };
}

function pullRequest(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    number: 123,
    repository: REPOSITORY,
    branch: BRANCH,
    headSha: CURRENT_SHA,
    state: 'open',
    merged: false,
    mergeSha: null,
    baseBranch: 'main',
    ...overrides,
  };
}

function evidence(): { checks: CheckRun[] } {
  return { checks: [check(), check({ id: 102, name: 'gate:slow' })] };
}

function rawPullRequest(overrides: Record<string, unknown> = {}) {
  return {
    number: 123,
    base: { ref: 'main', repo: { full_name: REPOSITORY } },
    head: { repo: { full_name: REPOSITORY }, ref: BRANCH, sha: CURRENT_SHA },
    state: 'open',
    merged: false,
    ...overrides,
  };
}

function rawCheckRun(overrides: Record<string, unknown> = {}) {
  return {
    id: 101,
    name: 'gate:fast',
    head_sha: VALIDATED_SHA,
    status: 'completed',
    conclusion: 'success',
    app: { id: 15368 },
    ...overrides,
  };
}

function withoutKey(value: object, key: string) {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

describe('checkedCommit: laatste verplichte GitHub Actions-checks op exact de gevalideerde SHA', () => {
  test('alle verplichte checks op dezelfde gevalideerde commit geven bewijs', () => {
    expect(checkedCommit(evidence().checks, REQUIRED)).toBe(true);
  });

  test('een aanvullende niet-verplichte check verandert het bewijs niet', () => {
    const checks = [...evidence().checks, check({ id: 500, name: 'extra-check', conclusion: 'failure', appId: 1 })];

    expect(checkedCommit(checks, REQUIRED)).toBe(true);
  });

  test('de nieuwste run op de juiste SHA kan een oudere rode run herstellen', () => {
    const checks = [check({ id: 99, conclusion: 'failure' }), ...evidence().checks];

    expect(checkedCommit(checks, REQUIRED)).toBe(true);
  });

  test.each([
    { name: 'nieuwere failure', latest: { id: 200, conclusion: 'failure' } },
    { name: 'nieuwere lopende run', latest: { id: 200, status: 'in_progress', conclusion: null } },
    { name: 'nieuwere queued run', latest: { id: 200, status: 'queued', conclusion: null } },
    { name: 'nieuwere geannuleerde run', latest: { id: 200, conclusion: 'cancelled' } },
  ])('$name trekt eerder groen bewijs in, ongeacht lijstvolgorde', ({ latest }) => {
    const newest = check(latest);
    const older = evidence().checks;

    expect(checkedCommit([...older, newest], REQUIRED)).toBe(false);
    expect(checkedCommit([newest, ...older], REQUIRED)).toBe(false);
  });

  test.each([
    { name: 'lege checklijst', checks: [] },
    { name: 'slow ontbreekt', checks: [check()] },
    { name: 'alleen gelijkende naam', checks: [check({ name: 'gate:fast-extra' }), check({ name: 'gate:slow' })] },
    {
      name: 'checks van actuele statuscommit',
      checks: evidence().checks.map((item) => ({ ...item, headSha: CURRENT_SHA })),
    },
    { name: 'slow op andere SHA', checks: [check(), check({ name: 'gate:slow', headSha: CURRENT_SHA })] },
    { name: 'fast niet afgerond', checks: [check({ status: 'in_progress' }), check({ name: 'gate:slow' })] },
    { name: 'fast zonder uitslag', checks: [check({ conclusion: null }), check({ name: 'gate:slow' })] },
    { name: 'fast skipped', checks: [check({ conclusion: 'skipped' }), check({ name: 'gate:slow' })] },
    { name: 'fast neutral', checks: [check({ conclusion: 'neutral' }), check({ name: 'gate:slow' })] },
    { name: 'vervalste gelijknamige app', checks: [check({ appId: 1 }), check({ name: 'gate:slow' })] },
  ])('$name levert geen bewijs', ({ checks }) => {
    expect(checkedCommit(checks, REQUIRED)).toBe(false);
  });

  test('een vervalste gelijknamige run wordt ook naast een echte groene run geweigerd', () => {
    const forged = check({ id: 50, appId: 1 });

    expect(checkedCommit([forged, ...evidence().checks], REQUIRED)).toBe(false);
    expect(checkedCommit([...evidence().checks, forged], REQUIRED)).toBe(false);
  });

  test('een latere run op een andere commit vervangt het bewijs van de gekozen commit niet', () => {
    const otherCommit = check({ id: 500, headSha: CURRENT_SHA, conclusion: 'failure' });

    expect(checkedCommit([...evidence().checks, otherCommit], REQUIRED)).toBe(true);
  });

  test.each(['', 'a'.repeat(39), 'a'.repeat(41), 'g'.repeat(40)])(
    'ongeldige gevalideerde SHA %s geeft geen bewijs',
    (sha) => {
      expect(checkedCommit(evidence().checks, { names: REQUIRED.names, sha })).toBe(false);
    },
  );

  test('een lege lijst verplichte checks kan geen groene validatie opleveren', () => {
    expect(checkedCommit(evidence().checks, { names: [], sha: VALIDATED_SHA })).toBe(false);
  });
});

describe('parsePullRequest: onbekende GitHub JSON omzetten naar verplichte PR-feiten', () => {
  test('de echte REST-veldstructuur levert de PR-identiteit op', () => {
    expect(parsePullRequest(rawPullRequest())).toStrictEqual(pullRequest());
  });

  // Gewijzigd door gebouwd-na-merge: een gemergde PR draagt zijn `merge_commit_sha` als `mergeSha`.
  test('de gemergde vlag blijft een expliciet booleanfeit', () => {
    const raw = rawPullRequest({ state: 'closed', merged: true, merge_commit_sha: 'c'.repeat(40) });
    expect(parsePullRequest(raw)).toStrictEqual(
      pullRequest({ state: 'closed', merged: true, mergeSha: 'c'.repeat(40) }),
    );
  });

  test.each([null, [], {}, 123, 'PR'])('onvolledige JSON %j wordt geweigerd', (raw) => {
    expect(() => parsePullRequest(raw)).toThrow();
  });

  test.each(['number', 'base', 'head', 'state', 'merged'])('ontbrekend PR-veld %s wordt geweigerd', (key) => {
    expect(() => parsePullRequest(withoutKey(rawPullRequest(), key))).toThrow();
  });

  test.each([
    { name: 'base.repo ontbreekt', raw: rawPullRequest({ base: {} }) },
    { name: 'base.repo.full_name ontbreekt', raw: rawPullRequest({ base: { ref: 'main', repo: {} } }) },
    { name: 'base.ref ontbreekt', raw: rawPullRequest({ base: { repo: { full_name: REPOSITORY } } }) },
    { name: 'base.ref als getal', raw: rawPullRequest({ base: { ref: 1, repo: { full_name: REPOSITORY } } }) },
    { name: 'head.repo ontbreekt', raw: rawPullRequest({ head: withoutKey(rawPullRequest().head, 'repo') }) },
    { name: 'head.repo.full_name ontbreekt', raw: rawPullRequest({ head: { ...rawPullRequest().head, repo: {} } }) },
    { name: 'head.ref ontbreekt', raw: rawPullRequest({ head: withoutKey(rawPullRequest().head, 'ref') }) },
    { name: 'head.sha ontbreekt', raw: rawPullRequest({ head: withoutKey(rawPullRequest().head, 'sha') }) },
    { name: 'PR-nummer als tekst', raw: rawPullRequest({ number: '123' }) },
    { name: 'PR-nummer nul', raw: rawPullRequest({ number: 0 }) },
    { name: 'negatief PR-nummer', raw: rawPullRequest({ number: -1 }) },
    { name: 'fractioneel PR-nummer', raw: rawPullRequest({ number: 1.5 }) },
    { name: 'state als getal', raw: rawPullRequest({ state: 1 }) },
    { name: 'branch als getal', raw: rawPullRequest({ head: { ...rawPullRequest().head, ref: 1 } }) },
    { name: 'SHA als getal', raw: rawPullRequest({ head: { ...rawPullRequest().head, sha: 1 } }) },
    { name: 'merged als tekst', raw: rawPullRequest({ merged: 'true' }) },
    { name: 'merged als null', raw: rawPullRequest({ merged: null }) },
  ])('$name wordt geweigerd', ({ raw }) => {
    expect(() => parsePullRequest(raw)).toThrow();
  });

  test('een fork-head kan geen bewijs voor de base-repository leveren', () => {
    const raw = rawPullRequest({ head: { ...rawPullRequest().head, repo: { full_name: 'other/template' } } });

    expect(() => parsePullRequest(raw)).toThrow();
  });
});

describe('parseCheckRun: onbekende GitHub JSON omzetten naar verplichte check-feiten', () => {
  test('de echte REST-veldstructuur behoudt SHA, app-identiteit en run-id', () => {
    expect(parseCheckRun(rawCheckRun())).toStrictEqual(check());
  });

  test('een nog lopende check met nullconclusie kan worden gelezen, maar is geen groen bewijs', () => {
    const running = parseCheckRun(rawCheckRun({ status: 'in_progress', conclusion: null }));

    expect(running).toStrictEqual(check({ status: 'in_progress', conclusion: null }));
    expect(checkedCommit([running, check({ name: 'gate:slow' })], REQUIRED)).toBe(false);
  });

  test.each([null, [], {}, 123, 'check'])('onvolledige JSON %j wordt geweigerd', (raw) => {
    expect(() => parseCheckRun(raw)).toThrow();
  });

  test.each(['id', 'name', 'head_sha', 'status', 'conclusion', 'app'])(
    'ontbrekend checkveld %s wordt geweigerd',
    (key) => {
      expect(() => parseCheckRun(withoutKey(rawCheckRun(), key))).toThrow();
    },
  );

  test.each([
    { name: 'app.id ontbreekt', raw: rawCheckRun({ app: {} }) },
    { name: 'app ontbreekt als object', raw: rawCheckRun({ app: null }) },
    { name: 'app.id als tekst', raw: rawCheckRun({ app: { id: '15368' } }) },
    { name: 'app.id nul', raw: rawCheckRun({ app: { id: 0 } }) },
    { name: 'id als tekst', raw: rawCheckRun({ id: '101' }) },
    { name: 'id nul', raw: rawCheckRun({ id: 0 }) },
    { name: 'negatieve id', raw: rawCheckRun({ id: -1 }) },
    { name: 'fractionele id', raw: rawCheckRun({ id: 1.5 }) },
    { name: 'naam als getal', raw: rawCheckRun({ name: 1 }) },
    { name: 'SHA als getal', raw: rawCheckRun({ head_sha: 1 }) },
    { name: 'status als getal', raw: rawCheckRun({ status: 1 }) },
    { name: 'conclusie als boolean', raw: rawCheckRun({ conclusion: true }) },
  ])('$name wordt geweigerd', ({ raw }) => {
    expect(() => parseCheckRun(raw)).toThrow();
  });

  test('een andere app-identiteit wordt behouden en door de bewijsvalidator geweigerd', () => {
    const forged = parseCheckRun(rawCheckRun({ app: { id: 1 } }));

    expect(forged.appId).toBe(1);
    expect(checkedCommit([forged, check({ name: 'gate:slow' })], REQUIRED)).toBe(false);
  });
});
