import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { padNiveau, samengevoegd } from '../../rails/hooks/lib/padtabel.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import * as runner from '../../rails/hooks/lib/runner-authority.mjs';

// spec ci-log (docs/template/specs/ci-log.md, ADR 0102), tests vóór de bouw: AC-7 het rolhek op `pnpm pr:log <nr>` (ctx-veld
// `kitTrusted`, los van `mergeTrusted`), AC-8 de ankertoets in runner-authority.mjs, AC-9 de configuratie. De vorm volgt
// test/hooks/rolhek-gesprekken-sluiten.test.ts.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

interface Opties {
  agent?: string;
  kitTrusted?: boolean;
  mergeTrusted?: boolean;
  cwd?: string;
}

function beslis(command: string, opties: Opties = {}) {
  return decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: opties.agent ?? '' },
    {
      root: '/repo',
      cwd: opties.cwd ?? '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
      mergeTrusted: opties.mergeTrusted ?? true,
      kitTrusted: opties.kitTrusted ?? true,
    },
  );
}

function verdict(command: string, opties: Opties = {}) {
  const decision = beslis(command, opties);
  if (decision.deny.length > 0) return { uitslag: 'deny', reden: decision.deny.join('; ') };
  if (decision.ask.length > 0) return { uitslag: 'ask', reden: decision.ask.join('; ') };
  return { uitslag: decision.allow === true ? 'allow' : 'context', reden: '' };
}

const REDEN_BASIS =
  'pnpm pr:log alleen vanuit de repo-root, met scripts, rails en hostbestanden (package.json, .npmrc, …) gelijk aan het anker (ADR 0102)';
const REDEN_SUBAGENT = 'De CI-log via pnpm pr:log leest alleen de hoofdsessie (ADR 0102)';
const REDEN_VORM = 'Het logscript draait alleen als precies `pnpm pr:log <nummer>` (ADR 0102)';

describe('ci-log/AC-7 rolhek op pnpm pr:log', () => {
  test.each(['pnpm pr:log 12', '  pnpm  pr:log 7 '])(
    'ci-log/AC-7: hoofdsessie, kitTrusted waar, vanuit de repo-root: allow (%s)',
    (command) => {
      expect(verdict(command).uitslag).toBe('allow');
    },
  );

  test('ci-log/AC-7: kitTrusted waar en mergeTrusted onwaar (modus eigenaar): nog steeds allow', () => {
    expect(verdict('pnpm pr:log 12', { kitTrusted: true, mergeTrusted: false }).uitslag).toBe('allow');
  });

  test('ci-log/AC-7: hoofdsessie, kitTrusted onwaar: deny met de basismelding', () => {
    const uitslag = verdict('pnpm pr:log 12', { kitTrusted: false });
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(REDEN_BASIS);
  });

  test('ci-log/AC-7: buiten de repo-root: deny met de basismelding', () => {
    const uitslag = verdict('pnpm pr:log 12', { cwd: '/repo/src' });
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(REDEN_BASIS);
  });

  test.each(['developer', 'tester', 'architect', 'reviewer', 'docs', 'onbekend'])(
    'ci-log/AC-7: subagent %s: deny met de subagentmelding',
    (agent) => {
      const uitslag = verdict('pnpm pr:log 12', { agent });
      expect(uitslag.uitslag).toBe('deny');
      expect(uitslag.reden).toContain(REDEN_SUBAGENT);
    },
  );

  test.each([
    'pnpm pr:log',
    'pnpm pr:log 12 --x',
    'pnpm pr:log 12 && ls',
    'pnpm pr:log 12; ls',
    'node scripts/kit/pr-log.mjs 12',
    'pnpm run pr:log 12',
  ])('ci-log/AC-7: andere vorm: deny met de vormmelding (%s)', (command) => {
    const uitslag = verdict(command);
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(REDEN_VORM);
  });

  test.each(['cat scripts/kit/pr-log.mjs', 'git add test/scripts/pr-login.ts'])(
    'ci-log/AC-7: lezen en een andere bestandsnaam blijven vrij (%s)',
    (command) => {
      expect(verdict(command).uitslag).not.toBe('deny');
    },
  );

  test('ci-log/AC-7: met de netwerkvorm pnpm pr:log * weigert alleen de eigen regel, één keer', () => {
    const decision = decide(
      { tool_name: 'Bash', tool_input: { command: 'pnpm pr:log 12 --x' }, agent_type: '' },
      {
        root: '/repo',
        cwd: '/repo',
        config,
        read: () => null,
        committed: () => false,
        isDir: () => false,
        branch: 'feat/x',
        mergeTrusted: true,
        kitTrusted: true,
        netwerkvormen: ['pnpm pr:log *'],
      },
    );
    expect(decision.deny).toStrictEqual([REDEN_VORM]);
  });

  test('ci-log/AC-7: het samenvoegscript met mergeTrusted onwaar en kitTrusted waar blijft deny', () => {
    const uitslag = verdict(['pnpm', 'pr:merge', '12'].join(' '), { mergeTrusted: false, kitTrusted: true });
    expect(uitslag.uitslag).toBe('deny');
  });
});

describe('ci-log/AC-8 ankertoets in runner-authority.mjs', () => {
  test('ci-log/AC-8: trustedKitScript bestaat', () => {
    expect(typeof runner.trustedKitScript).toBe('function');
  });

  test('ci-log/AC-8: trustedKitScript is nee zonder basis', () => {
    const kitScript: unknown = Reflect.get(runner, 'trustedKitScript');
    expect(typeof kitScript).toBe('function');
    expect(typeof kitScript === 'function' ? Reflect.apply(kitScript, undefined, ['/repo', null]) : undefined).toBe(
      false,
    );
  });

  test('ci-log/AC-8: trustedMerge is nee bij een andere modus (eigenaar), los van de bestanden', () => {
    const basis = {
      sha: 'a'.repeat(40),
      read: (bestand: string) => (bestand === '.claude/gates.json' ? JSON.stringify({ merge: 'eigenaar' }) : null),
      readOptional: () => null,
    };
    expect(runner.trustedMerge('/repo', basis)).toBe(false);
  });

  test('ci-log/AC-8: trustedMerge is nee zonder basis', () => {
    expect(runner.trustedMerge('/repo', null)).toBe(false);
  });
});

// AC-9: de configuratie.
function sectie(waarde: unknown): Record<string, unknown> {
  return typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde)
    ? Object.fromEntries(Object.entries(waarde))
    : {};
}

function teksten(waarde: unknown): string[] {
  return Array.isArray(waarde) ? waarde.filter((item): item is string => typeof item === 'string') : [];
}

describe('ci-log/AC-9 configuratie', () => {
  const settings = sectie(JSON.parse(readFileSync('.claude/settings.json', 'utf8')));

  // Spec-hertoets B-1: in ask, zoals pr:merge en pr:resolve; het rolhek geeft het vrij als de ankertoets klopt.
  test('ci-log/AC-9: .claude/settings.json heeft Bash(pnpm pr:log *) in permissions.ask en niet in allow', () => {
    const permissies = sectie(settings['permissions']);
    expect(teksten(permissies['ask'])).toContain('Bash(pnpm pr:log *)');
    expect(teksten(permissies['allow'])).not.toContain('Bash(pnpm pr:log *)');
  });

  test('ci-log/AC-9: .claude/settings.json heeft pnpm pr:log * in sandbox.excludedCommands', () => {
    expect(teksten(sectie(settings['sandbox'])['excludedCommands'])).toContain('pnpm pr:log *');
  });

  test('ci-log/AC-9: package.json heeft de scriptregel voor het logscript', () => {
    const scripts = sectie(sectie(JSON.parse(readFileSync('package.json', 'utf8')))['scripts']);
    expect(scripts['pr:log']).toBe('node scripts/kit/pr-log.mjs');
  });

  test('ci-log/AC-9: .claude/gates.json geeft scripts/kit/pr-log.mjs besluit besluit-pr', () => {
    const gates: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));
    expect(padNiveau('scripts/kit/pr-log.mjs', samengevoegd(gates, null)).besluit).toBe('besluit-pr');
    expect(sectie(sectie(gates)['paden'])['scripts/kit/pr-log.mjs']).toStrictEqual({ besluit: 'besluit-pr' });
  });
});
