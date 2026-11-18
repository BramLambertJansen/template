import { spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// templateregime/AC-2 (docs/specs/templateregime.md, ADR 0089 punt 2): scripts/github-ruleset.sh eist review van een code-eigenaar
// met nul vereiste goedkeuringen, trekt een goedkeuring in bij een nieuwe push, eist geen bijgewerkte branch en eist precies
// `requiredChecks`. Zonder `--bypass-beheerder` is `bypass_actors` leeg; met de optie staat er precies één actor: de
// beheerdersrol (RepositoryRole 5, bypass_mode pull_request), nooit een App (Integration).
// Zelfde vorm als test/scripts/github-ruleset.test.ts: `gh` is een stub die de payload van `--input -` bewaart; er gaat niets
// naar GitHub.
const ROOT = path.join(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts/github-ruleset.sh');
const GITHUB_ACTIONS = 15368;
const dirs: string[] = [];

type Uitvoer = { status: number | null; stdout: string; stderr: string; aanroepen: string[]; payload: unknown };

// GEWIJZIGD (templateregime/AC-3, ADR 0089 punt 3): de stub kent ook `gh api repos/<repo>/codeowners/errors`, het endpoint dat
// het script na het zetten van de ruleset opvraagt. CODEOWNERS_MODE: leeg (`{"errors":[]}`), fouten (een Unknown owner),
// mislukt (de aanroep faalt met exit 1) of rommel (uitvoer die geen JSON is).
const GH = `
echo "gh $*" >> "$STUB_DIR/log"
if [[ " $* " == *"/codeowners/errors"* ]]; then
  case "$CODEOWNERS_MODE" in
    fouten) echo '{"errors":[{"kind":"Unknown owner","path":".github/CODEOWNERS","line":5}]}' ;;
    mislukt) echo 'gh: Not Found (HTTP 404)' >&2; exit 1 ;;
    rommel) echo 'dit is geen json' ;;
    *) echo '{"errors":[]}' ;;
  esac
  exit 0
fi
if [[ " $* " == *" --input - "* ]]; then cat > "$STUB_DIR/payload.json"; echo '{"id":42}'; exit 0; fi
if [[ "$GH_MODE" == bestaat ]]; then echo 42; fi
`;

type Opties = { codeowners?: string; register?: string | null };

// `register`: de inhoud van een tijdelijke .claude/decisions.json (null: het bestand ontbreekt). Het script leest die relatief aan zichzelf
// (`$(dirname "${BASH_SOURCE[0]}")/../.claude/decisions.json`), dus draait het dan als kopie in <dir>/scripts/.
function run(args: string[], mode = '', opties: Opties = {}): Uitvoer {
  const dir = mkdtempSync(path.join(tmpdir(), 'github-ruleset-regime-'));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env bash\n${GH}`);
  chmodSync(path.join(dir, 'gh'), 0o755);
  writeFileSync(path.join(dir, 'log'), '');
  let script = SCRIPT;
  if (opties.register !== undefined) {
    script = path.join(dir, 'scripts/github-ruleset.sh');
    mkdirSync(path.join(dir, 'scripts'));
    mkdirSync(path.join(dir, '.claude'));
    copyFileSync(SCRIPT, script);
    if (opties.register !== null) writeFileSync(path.join(dir, '.claude/decisions.json'), opties.register);
  }
  const result = spawnSync('bash', [script, ...args], {
    encoding: 'utf8',
    env: {
      HOME: dir,
      PATH: `${dir}:/usr/bin:/bin`,
      STUB_DIR: dir,
      GH_MODE: mode,
      CODEOWNERS_MODE: opties.codeowners ?? '',
    },
  });
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(path.join(dir, 'payload.json'), 'utf8'));
  } catch {
    payload = null;
  }
  const aanroepen = readFileSync(path.join(dir, 'log'), 'utf8').split('\n').filter(Boolean);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, aanroepen, payload };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function veld(value: unknown, sleutel: string): unknown {
  return isRecord(value) ? value[sleutel] : undefined;
}

function regelParameters(payload: unknown, type: string): unknown {
  const regels = veld(payload, 'rules');
  const regel: unknown = Array.isArray(regels)
    ? regels.find((kandidaat) => veld(kandidaat, 'type') === type)
    : undefined;
  return veld(regel, 'parameters');
}

function checks(payload: unknown): { context: string; integration_id: unknown }[] {
  const lijst = veld(regelParameters(payload, 'required_status_checks'), 'required_status_checks');
  if (!Array.isArray(lijst)) return [];
  return lijst.map((check) => ({
    context: String(veld(check, 'context')),
    integration_id: veld(check, 'integration_id'),
  }));
}

function requiredChecks(): string[] {
  const register: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/decisions.json'), 'utf8'));
  const lijst = veld(register, 'requiredChecks');
  return Array.isArray(lijst) ? lijst.map(String) : [];
}

// GEWIJZIGD (agent-samenvoegen AC-5, ADR 0093; eigenaarakkoord via die spec, R-TEST-02): `require_code_owner_review` is `false`,
// `bypass_actors` is altijd leeg, de optie `--bypass-beheerder` bestaat niet meer en de controle op fouten in CODEOWNERS na het
// zetten van de ruleset vervalt. De overige regels van de payload blijven gelijk.
describe('templateregime/AC-2 de reviewregels van de ruleset', () => {
  test('agent-samenvoegen/AC-5 templateregime/AC-2 de ruleset eist geen review van een code-eigenaar: require_code_owner_review false, nul goedkeuringen, geen bijgewerkte branch, lege bypass_actors', () => {
    const { status, payload } = run(['eigenaar/app']);

    expect(status).toBe(0);
    expect(regelParameters(payload, 'pull_request')).toMatchObject({
      require_code_owner_review: false,
      required_approving_review_count: 0,
      dismiss_stale_reviews_on_push: true,
      require_last_push_approval: false,
      required_review_thread_resolution: true,
      allowed_merge_methods: ['merge', 'squash'],
    });
    expect(regelParameters(payload, 'required_status_checks')).toMatchObject({
      strict_required_status_checks_policy: false,
    });
    expect(veld(payload, 'bypass_actors')).toStrictEqual([]);
  });

  test('templateregime/AC-2 de verplichte checks zijn precies requiredChecks, allemaal van GitHub Actions', () => {
    const { status, payload } = run(['eigenaar/app']);

    expect(status).toBe(0);
    // GEWIJZIGD (templateregime AC-7, ADR 0089 punt 5): `document-status` is geen verplichte check meer.
    expect(requiredChecks()).toEqual(
      expect.arrayContaining(['check-core', 'leerpunt-bewijs', 'codeql (javascript-typescript)']),
    );
    expect(requiredChecks()).not.toContain('document-status');
    expect(checks(payload).toSorted((a, b) => a.context.localeCompare(b.context))).toStrictEqual(
      requiredChecks()
        .toSorted((a, b) => a.localeCompare(b))
        .map((context) => ({ context, integration_id: GITHUB_ACTIONS })),
    );
    // Samen met de reviewregel, zodat deze test pas groen is als de hele pull_request-regel klopt.
    expect(veld(regelParameters(payload, 'pull_request'), 'require_code_owner_review')).toBe(false);
  });
});

// GEWIJZIGD (agent-samenvoegen AC-5, ADR 0093): de optie `--bypass-beheerder` bestaat niet meer; de vier gevallen over de bypass
// van de beheerder zijn omgezet naar wat er nu geldt: exit 2 met de gebruiksregel, en altijd een lege `bypass_actors`.
describe('templateregime/AC-2 de bypass van de beheerder', () => {
  const GEBRUIK = 'Gebruik: scripts/github-ruleset.sh <owner>/<repo> [--zonder-codeql]';

  test('agent-samenvoegen/AC-5 templateregime/AC-2 met --bypass-beheerder: exit 2 met de gebruiksregel, zonder de optie, en geen aanroep van gh', () => {
    const { status, stderr, aanroepen, payload } = run(['eigenaar/app', '--bypass-beheerder']);

    expect(status).toBe(2);
    expect(stderr).toContain(GEBRUIK);
    expect(stderr).not.toContain('bypass-beheerder');
    expect(aanroepen).toStrictEqual([]);
    expect(payload).toBeNull();
  });

  test('agent-samenvoegen/AC-5 templateregime/AC-2 de payload heeft een lege bypass_actors en er staat nooit een App in, ook bij --zonder-codeql', () => {
    for (const args of [['eigenaar/app'], ['eigenaar/app', '--zonder-codeql']]) {
      const { status, payload } = run(args);

      expect(status).toBe(0);
      expect(veld(payload, 'bypass_actors')).toStrictEqual([]);
      expect(JSON.stringify(payload)).not.toContain('Integration');
      expect(JSON.stringify(payload)).not.toContain('RepositoryRole');
    }
  });

  test('agent-samenvoegen/AC-5 templateregime/AC-2 --bypass-beheerder geeft ook exit 2 bij een bestaande ruleset en in combinatie met --zonder-codeql, in beide volgordes', () => {
    const uitvoeren = [
      run(['eigenaar/app', '--bypass-beheerder'], 'bestaat'),
      run(['eigenaar/app', '--zonder-codeql', '--bypass-beheerder']),
      run(['eigenaar/app', '--bypass-beheerder', '--zonder-codeql']),
    ];

    for (const uitvoer of uitvoeren) {
      expect(uitvoer.status).toBe(2);
      expect(uitvoer.stderr).toContain(GEBRUIK);
      expect(uitvoer.aanroepen).toStrictEqual([]);
    }
  });

  test('agent-samenvoegen/AC-5 templateregime/AC-2 --zonder-codeql laat bypass_actors leeg, zet geen code-eigenaar-review en houdt de overige regels', () => {
    const { status, payload } = run(['eigenaar/app', '--zonder-codeql']);

    expect(status).toBe(0);
    expect(veld(payload, 'bypass_actors')).toStrictEqual([]);
    expect(veld(regelParameters(payload, 'pull_request'), 'require_code_owner_review')).toBe(false);
    expect(regelParameters(payload, 'pull_request')).toMatchObject({
      required_approving_review_count: 0,
      dismiss_stale_reviews_on_push: true,
      allowed_merge_methods: ['merge', 'squash'],
    });
  });
});

// Nieuw (templateregime/AC-2, ADR 0089 punt 2): de stoppaden van het lezen van `requiredChecks`. Het script leest
// .claude/decisions.json en stopt, zonder iets naar GitHub te schrijven, als de lijst niet te lezen of niet bruikbaar is.
describe('templateregime/AC-2 het script stopt bij een onbruikbare requiredChecks', () => {
  const schrijft = (aanroepen: string[]) => aanroepen.filter((aanroep) => /-X (POST|PUT)/.test(aanroep));

  const GEVALLEN: [string, string | null, RegExp][] = [
    ['geen JSON', '{ dit is geen json', /requiredChecks ontbreekt/],
    ['het bestand ontbreekt', null, /niet te lezen/],
    ['zonder requiredChecks', JSON.stringify({ version: 1 }), /requiredChecks ontbreekt/],
    ['een lege lijst', JSON.stringify({ requiredChecks: [] }), /requiredChecks .* is leeg/],
    [
      'een checknaam met een aanhalingsteken',
      JSON.stringify({ requiredChecks: ['gate"fast'] }),
      /onverwachte checknaam/,
    ],
    ['een checknaam met een regeleinde', JSON.stringify({ requiredChecks: ['gate\nfast'] }), /onverwachte checknaam/],
    // Een letterlijk regeleinde in de bestandstekst (geen JSON-escape): `tr` maakt er een spatie van, die in een checknaam
    // niet mag.
    ['een checknaam met een letterlijk regeleinde', '{ "requiredChecks": ["gate\nfast"] }', /onverwachte checknaam/],
  ];

  test.each(GEVALLEN)('templateregime/AC-2 %s: exitcode niet 0 en geen POST of PUT', (_naam, register, melding) => {
    const { status, stderr, aanroepen } = run(['eigenaar/app'], '', { register });

    expect(status).not.toBe(0);
    expect(stderr).toMatch(melding);
    expect(schrijft(aanroepen)).toStrictEqual([]);
  });
});

// GEWIJZIGD (agent-samenvoegen AC-5, ADR 0093; eigenaarakkoord via die spec, R-TEST-02): de controle op fouten in CODEOWNERS na
// het zetten van de ruleset (templateregime AC-3, ADR 0089 punt 3) vervalt. De stub antwoordt nog met fouten, een mislukte
// aanroep of rommel: het script vraagt `codeowners/errors` niet meer op en eindigt dan ook niet rood.
describe('templateregime/AC-3 het script controleert CODEOWNERS niet meer bij GitHub', () => {
  const codeownersAanroepen = (aanroepen: string[]) =>
    aanroepen.filter((aanroep) => aanroep.includes('/codeowners/errors'));

  test('agent-samenvoegen/AC-5 templateregime/AC-3 een lege errors-lijst: exit 0, geen aanroep van codeowners/errors en geen melding over CODEOWNERS', () => {
    const { status, stdout, stderr, aanroepen } = run(['eigenaar/app']);

    expect(status).toBe(0);
    expect(aanroepen.filter((aanroep) => aanroep.includes('-X '))).toStrictEqual([
      'gh api -X POST repos/eigenaar/app/rulesets --input -',
    ]);
    expect(codeownersAanroepen(aanroepen)).toStrictEqual([]);
    expect(`${stdout}\n${stderr}`).not.toContain('CODEOWNERS');
  });

  test('agent-samenvoegen/AC-5 templateregime/AC-3 de laatste aanroep is het zetten van de ruleset, bij een bestaande ruleset de PUT', () => {
    const nieuw = run(['eigenaar/app']);
    const bijgewerkt = run(['eigenaar/app'], 'bestaat');

    expect(nieuw.aanroepen.at(-1)).toBe('gh api -X POST repos/eigenaar/app/rulesets --input -');
    expect(bijgewerkt.aanroepen.at(-1)).toBe('gh api -X PUT repos/eigenaar/app/rulesets/42 --input -');
  });

  test.each([
    ['errors niet leeg (Unknown owner)', 'fouten'],
    ['de aanroep zelf mislukt', 'mislukt'],
    ['de uitvoer geen JSON is', 'rommel'],
  ])('agent-samenvoegen/AC-5 templateregime/AC-3 %s: exit 0 en geen aanroep van codeowners/errors', (_naam, modus) => {
    const { status, stdout, stderr, aanroepen } = run(['eigenaar/app'], '', { codeowners: modus });

    expect(codeownersAanroepen(aanroepen)).toStrictEqual([]);
    expect(status).toBe(0);
    expect(`${stdout}\n${stderr}`).not.toContain('CODEOWNERS');
  });
});
