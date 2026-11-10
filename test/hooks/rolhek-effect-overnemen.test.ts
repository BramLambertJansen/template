import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import * as effectHooks from '../../rails/hooks/lib/effect-hooks.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import * as prVerify from '../../scripts/kit/pr-verify.mjs';
import { expectAbsent } from '../support/absence';
import { MIN, REVIEWER, roep, schrijf, start, stopAgent, wereld } from './effect-sandbox-kit';

// docs/specs/rolhek-effect.md AC-13 (leerpunt #638, OV-7): een uitweg die klopt. (t1) één geëxporteerde tekst `UITWEG`;
// (t2) de volledige `decide` voor `pnpm rolhek:overnemen <.git-pad>`: ask voor de hoofdsessie, deny in alle andere gevallen.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const ctx = {
  root: '/repo',
  cwd: '/repo',
  config,
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/x',
};

type Uitslag = { deny: string[]; ask: string[] };

function beslis(command: string, agent?: string): Uitslag {
  const d = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(agent === undefined ? {} : { agent_type: agent }) },
    ctx,
  );
  return { deny: d.deny, ask: d.ask };
}

/** De geëxporteerde tekst; een assertie als hij er nog niet is. */
function uitweg(): string {
  const tekst: unknown = Reflect.get(effectHooks, 'UITWEG');
  expect(typeof tekst).toBe('string');
  return typeof tekst === 'string' ? tekst : '';
}

describe('rolhek-effect/AC-13 (t1): één uitweg-tekst', () => {
  test('rolhek-effect/AC-13 UITWEG noemt de hoofdsessie, de eigenaar, de controle, de subagent en --alles', () => {
    const tekst = uitweg();
    expect(tekst).toContain('De hook zet niets terug');
    expect(tekst).toContain('pnpm rolhek:overnemen <pad>');
    expect(tekst).toContain('hoofdsessie');
    expect(tekst).toMatch(/akkoord|vraagt de eigenaar/);
    expect(tekst).toContain('subagent');
    expect(tekst).toContain('docs/operations/agent-doorloop.md');
    expect(tekst).toContain('.git/');
    expect(tekst).toContain('--alles');
    expect(tekst.indexOf('--alles')).toBeGreaterThan(tekst.indexOf('pnpm rolhek:overnemen <pad>'));
  });

  test('rolhek-effect/AC-13 UITWEG zegt niet meer dat de eigenaar de wijziging zelf overneemt', () => {
    const tekst = uitweg();
    expectAbsent(tekst, /laat de eigenaar|eigenaar (?:moet|kan) (?:het|de wijziging)[^.]*(?:zelf|overnemen)/i, {
      recognizes: [
        'of laat de eigenaar de wijziging overnemen met `pnpm rolhek:overnemen <pad>`',
        'Laat de eigenaar het zelf draaien',
        'de eigenaar moet de wijziging zelf overnemen',
      ],
      allows: ['de hoofdsessie start pnpm rolhek:overnemen <pad>; het rolhek vraagt de eigenaar om akkoord'],
    });
  });

  test(
    'rolhek-effect/AC-13 verifyEffect gooit bij een open overtreding een fout met UITWEG',
    () => {
      const { a } = wereld();
      schrijf(a, '.env', 'A=1\n');
      start(a, REVIEWER);
      stopAgent(a, REVIEWER);
      schrijf(a, '.env', 'B=2\n');
      expect(() => roep(prVerify, 'verifyEffect', a)).toThrow(uitweg());
    },
    MIN,
  );

  test('rolhek-effect/AC-13 de ask-tekst van rolhek:overnemen zegt dat de hoofdsessie het startte en de eigenaar akkoord geeft', () => {
    const ask = beslis('pnpm rolhek:overnemen src/a.ts').ask.join(' ');
    expect(ask).toContain('rolhek:overnemen');
    expect(ask).toContain('hoofdsessie');
    expect(ask).toContain('akkoord');
  });
});

describe('rolhek-effect/AC-13 (t2): de hoofdsessie neemt een .git-pad los over', () => {
  test.each([
    'pnpm rolhek:overnemen .git/config',
    'pnpm rolhek:overnemen .git/refs/heads/x .git/HEAD',
    'pnpm run rolhek:overnemen .git/config',
    'pnpm rolhek:overnemen --alles',
    'pnpm rolhek:overnemen src/a.ts',
  ])('rolhek-effect/AC-13 hoofdsessie: %s geeft alleen ask', (command) => {
    const uitslag = beslis(command);
    expect(uitslag.deny).toStrictEqual([]);
    expect(uitslag.ask.length).toBeGreaterThan(0);
  });
});

describe('rolhek-effect/AC-13 (t2): subagents houden deny', () => {
  const rollen = ['developer', 'tester', 'reviewer'];
  const commandos = [
    'pnpm rolhek:overnemen .git/config',
    'pnpm rolhek:overnemen .git/refs/heads/x .git/HEAD',
    'pnpm run rolhek:overnemen .git/config',
  ];
  test.each(rollen.flatMap((rol) => commandos.map((command) => ({ rol, command }))))(
    'rolhek-effect/AC-13 $rol: $command is deny',
    ({ rol, command }) => {
      expect(beslis(command, rol).deny.length).toBeGreaterThan(0);
    },
  );
});

describe('rolhek-effect/AC-13 (t2): voor de hoofdsessie blijft elke afwijking deny', () => {
  test.each([
    'pnpm rolhek:overnemen .git/config > .git/hooks/pre-commit',
    'pnpm rolhek:overnemen .git/config 2> .git/x',
    'pnpm rolhek:overnemen .git/config && echo x > .git/config',
    'pnpm rolhek:overnemen .git/config ; echo x > .git/config',
    'pnpm rolhek:overnemen .git/config | tee .git/config',
    'pnpm rolhek:overnemen .git/config || echo x > .git/config',
    'pnpm rolhek:overnemen .git/config\necho x > .git/config',
    'node scripts/kit/rolhek-overnemen.mjs .git/config',
    'pnpm test .git/config',
    'pnpm --dir .git/hooks rolhek:overnemen x',
    'pnpm -C .git run rolhek:overnemen x',
    'pnpm --config.modules-dir=.git/hooks rolhek:overnemen .git/config',
    'pnpm rolhek:overnemen --modules-dir=.git/hooks .git/config',
    'npm_config_modules_dir=.git/hooks pnpm rolhek:overnemen .git/config',
    'env pnpm rolhek:overnemen .git/config',
    'pnpm rolhek:overnemen .gi[t]/config',
    'pnpm rolhek:overnemen "$(touch .git/x)"',
    'pnpm rolhek:overnemen .git/../.git/config',
    'cd "$X" && pnpm rolhek:overnemen .git/config',
    './pnpm rolhek:overnemen .git/config',
    '/usr/bin/pnpm rolhek:overnemen .git/config',
    'pnpm() { cp x "$1"; }; pnpm rolhek:overnemen .git/hooks/pre-commit',
    'hash -p "$TMPDIR/e" pnpm; pnpm rolhek:overnemen .git/config',
    'alias pnpm=cp; pnpm rolhek:overnemen .git/config',
    'PATH=/tmp/x:$PATH; pnpm rolhek:overnemen .git/config',
  ])('rolhek-effect/AC-13 hoofdsessie: %j is deny', (command) => {
    expect(beslis(command).deny.length).toBeGreaterThan(0);
  });
});

// `../x/.git/config` en `.git/config` vanuit `src` wijzen buiten de `.git` van de repository: geen zelfladend pad van deze repo, dus geen deny, nu en na AC-13. Het
// script weigert het zelf (geen open overtreding met dat label); de vrijstelling verandert hier niets.
describe('rolhek-effect/AC-13 (t2): een pad buiten de repository gaat zoals nu', () => {
  test.each(['pnpm rolhek:overnemen ../x/.git/config', 'cd src && pnpm rolhek:overnemen .git/config'])(
    'rolhek-effect/AC-13 hoofdsessie: %j is alleen ask',
    (command) => {
      const besluit = beslis(command);
      expect(besluit.deny).toStrictEqual([]);
      expect(besluit.ask.join(' ')).toContain('rolhek:overnemen');
    },
  );
});
