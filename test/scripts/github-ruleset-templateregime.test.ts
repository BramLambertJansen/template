import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

type Uitvoer = { status: number | null; stderr: string; aanroepen: string[]; payload: unknown };

const GH = `
echo "gh $*" >> "$STUB_DIR/log"
if [[ " $* " == *" --input - "* ]]; then cat > "$STUB_DIR/payload.json"; echo '{"id":42}'; exit 0; fi
if [[ "$GH_MODE" == bestaat ]]; then echo 42; fi
`;

function run(args: string[], mode = ''): Uitvoer {
  const dir = mkdtempSync(path.join(tmpdir(), 'github-ruleset-regime-'));
  dirs.push(dir);
  writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env bash\n${GH}`);
  chmodSync(path.join(dir, 'gh'), 0o755);
  writeFileSync(path.join(dir, 'log'), '');
  const result = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { HOME: dir, PATH: `${dir}:/usr/bin:/bin`, STUB_DIR: dir, GH_MODE: mode },
  });
  let payload: unknown;
  try {
    payload = JSON.parse(readFileSync(path.join(dir, 'payload.json'), 'utf8'));
  } catch {
    payload = null;
  }
  const aanroepen = readFileSync(path.join(dir, 'log'), 'utf8').split('\n').filter(Boolean);
  return { status: result.status, stderr: result.stderr, aanroepen, payload };
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

const BEHEERDER = [{ actor_id: 5, actor_type: 'RepositoryRole', bypass_mode: 'pull_request' }];

describe('templateregime/AC-2 de reviewregels van de ruleset', () => {
  test('templateregime/AC-2 zonder --bypass-beheerder: code-eigenaar-review, nul goedkeuringen, geen bijgewerkte branch, lege bypass_actors', () => {
    const { status, payload } = run(['eigenaar/app']);

    expect(status).toBe(0);
    expect(regelParameters(payload, 'pull_request')).toMatchObject({
      require_code_owner_review: true,
      required_approving_review_count: 0,
      dismiss_stale_reviews_on_push: true,
    });
    expect(regelParameters(payload, 'required_status_checks')).toMatchObject({
      strict_required_status_checks_policy: false,
    });
    expect(veld(payload, 'bypass_actors')).toStrictEqual([]);
  });

  test('templateregime/AC-2 de verplichte checks zijn precies requiredChecks, allemaal van GitHub Actions', () => {
    const { status, payload } = run(['eigenaar/app']);

    expect(status).toBe(0);
    expect(requiredChecks()).toEqual(
      expect.arrayContaining(['check-core', 'leerpunt-bewijs', 'codeql (javascript-typescript)', 'document-status']),
    );
    expect(checks(payload).toSorted((a, b) => a.context.localeCompare(b.context))).toStrictEqual(
      requiredChecks()
        .toSorted((a, b) => a.localeCompare(b))
        .map((context) => ({ context, integration_id: GITHUB_ACTIONS })),
    );
    // Samen met de reviewregel, zodat deze test pas groen is als de hele pull_request-regel klopt.
    expect(veld(regelParameters(payload, 'pull_request'), 'require_code_owner_review')).toBe(true);
  });
});

describe('templateregime/AC-2 de bypass van de beheerder', () => {
  test('templateregime/AC-2 met --bypass-beheerder: precies één actor, de beheerdersrol met bypass_mode pull_request', () => {
    const { status, payload, aanroepen } = run(['eigenaar/app', '--bypass-beheerder']);

    expect(status).toBe(0);
    expect(aanroepen.at(-1)).toBe('gh api -X POST repos/eigenaar/app/rulesets --input -');
    expect(veld(payload, 'bypass_actors')).toStrictEqual(BEHEERDER);
  });

  test('templateregime/AC-2 met --bypass-beheerder blijft de rest van de ruleset gelijk, en staat er nooit een App in', () => {
    const met = run(['eigenaar/app', '--bypass-beheerder']);
    const zonder = run(['eigenaar/app']);

    expect(met.status).toBe(0);
    expect(JSON.stringify(met.payload)).not.toContain('Integration');
    expect(JSON.stringify(zonder.payload)).not.toContain('Integration');
    expect(regelParameters(met.payload, 'pull_request')).toMatchObject({
      require_code_owner_review: true,
      required_approving_review_count: 0,
      dismiss_stale_reviews_on_push: true,
    });
    expect({ ...(isRecord(met.payload) ? met.payload : {}), bypass_actors: [] }).toStrictEqual(zonder.payload);
  });

  test('templateregime/AC-2 de bypass werkt ook bij een bestaande ruleset (PUT) en in combinatie met --zonder-codeql, in beide volgordes', () => {
    const bijwerken = run(['eigenaar/app', '--bypass-beheerder'], 'bestaat');
    const eerstCodeql = run(['eigenaar/app', '--zonder-codeql', '--bypass-beheerder']);
    const eerstBypass = run(['eigenaar/app', '--bypass-beheerder', '--zonder-codeql']);

    expect(bijwerken.aanroepen.at(-1)).toBe('gh api -X PUT repos/eigenaar/app/rulesets/42 --input -');
    expect(veld(bijwerken.payload, 'bypass_actors')).toStrictEqual(BEHEERDER);
    for (const uitvoer of [eerstCodeql, eerstBypass]) {
      expect(uitvoer.status).toBe(0);
      expect(veld(uitvoer.payload, 'bypass_actors')).toStrictEqual(BEHEERDER);
      expect(checks(uitvoer.payload).map((check) => check.context)).not.toContain('codeql (actions)');
    }
  });

  test('templateregime/AC-2 --zonder-codeql zonder de bypass-optie laat bypass_actors leeg en houdt de code-eigenaar-review', () => {
    const { status, payload } = run(['eigenaar/app', '--zonder-codeql']);

    expect(status).toBe(0);
    expect(veld(payload, 'bypass_actors')).toStrictEqual([]);
    expect(veld(regelParameters(payload, 'pull_request'), 'require_code_owner_review')).toBe(true);
  });
});
