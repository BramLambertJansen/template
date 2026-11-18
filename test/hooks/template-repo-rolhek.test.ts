import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { appGates, gatesMet } from '../rails/template-repo-kit';

// Spec template-repo (docs/template/specs/template-repo.md) AC-3 t/m AC-5: het rolhek en `approvedBefore` lezen de repo van de
// template uit `template.repository` in de configuratie, niet meer uit een constante. Vorm als test/hooks/rolhek-leerpunt.test.ts
// en test/rails/functional-ui-akkoord.test.ts. De repo's hier zijn verzonnen (geen waarde uit de echte gates.json).
const TEMPLATE = 'acme/sjabloon';
const ANDER = 'iemand/anders';
const ROOT = '/repo';

type Config = ReturnType<typeof loadConfig>;

function ctxMet(config: Config, authority?: Parameters<typeof decide>[1]['authority']) {
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
    ...(authority === undefined ? {} : { authority }),
  };
}

const bash = (command: string, agent?: string) => ({
  tool_name: 'Bash',
  tool_input: { command },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

const BODY = '--title "Leerpunt: Herhaald handwerk: x" --body "### Soort"';
const leerpunt = (repo: string, label = 'leerpunt') => `gh issue create --repo ${repo} --label ${label} ${BODY}`;

// AC-3 ---------------------------------------------------------------------------------------------------------------

const GEEN_TEMPLATE =
  'gh issue create buiten de leerpuntvorm: template.repository ontbreekt in .claude/gates.json (ADR 0059)';

describe('template-repo/AC-3: het leerpuntdoel is template.repository', () => {
  const app = loadConfig(appGates(TEMPLATE));

  test('template-repo/AC-3: een app (template.repository = x, zonder onderhoud) → leerpunt voor x is geen ask en geen deny', () => {
    expect(decide(bash(leerpunt(TEMPLATE)), ctxMet(app))).toMatchObject({ deny: [], ask: [] });
  });

  test.each([
    { naam: '-R in plaats van --repo', command: `gh issue create -R ${TEMPLATE} --label leerpunt ${BODY}` },
    { naam: 'repo in hoofdletters (hoofdletterongevoelig)', command: leerpunt(TEMPLATE.toUpperCase()) },
    { naam: 'label vóór repo', command: `gh issue create --label leerpunt --repo ${TEMPLATE} ${BODY}` },
  ])('template-repo/AC-3: een app, $naam → geen ask en geen deny', ({ command }) => {
    expect(decide(bash(command), ctxMet(app))).toMatchObject({ deny: [], ask: [] });
  });

  test('template-repo/AC-3: een app, een andere repo → ask met de repo in de reden', () => {
    const decision = decide(bash(leerpunt(ANDER)), ctxMet(app));

    expect(decision.deny).toStrictEqual([]);
    expect(decision.ask.join('\n')).toContain(`--repo moet precies één keer ${TEMPLATE} zijn`);
  });

  test('template-repo/AC-3: een app, een ander label dan leerpunt → ask', () => {
    expect(decide(bash(leerpunt(TEMPLATE, 'bug')), ctxMet(app)).ask.length).toBeGreaterThan(0);
  });

  test('template-repo/AC-3: een fork: het doel volgt template.repository van de fork', () => {
    const fork = loadConfig(appGates('acme/vork'));

    expect(decide(bash(leerpunt('acme/vork')), ctxMet(fork))).toMatchObject({ deny: [], ask: [] });
    expect(decide(bash(leerpunt(TEMPLATE)), ctxMet(fork)).ask.length).toBeGreaterThan(0);
  });

  test('template-repo/AC-3: de template zelf (onderhoud en template gelijk) → leerpunt voor x is geen ask', () => {
    const template = loadConfig(gatesMet({ template: { repository: TEMPLATE }, onderhoud: { repository: TEMPLATE } }));

    expect(decide(bash(leerpunt(TEMPLATE)), ctxMet(template))).toMatchObject({ deny: [], ask: [] });
  });

  test('template-repo/AC-3: template.repository leidt, ook als onderhoud een andere waarde heeft', () => {
    const config = loadConfig(
      gatesMet({ template: { repository: TEMPLATE }, onderhoud: { repository: 'acme/onderhoud' } }),
    );

    expect(decide(bash(leerpunt(TEMPLATE)), ctxMet(config))).toMatchObject({ deny: [], ask: [] });
    expect(decide(bash(leerpunt('acme/onderhoud')), ctxMet(config)).ask.length).toBeGreaterThan(0);
  });

  test('template-repo/AC-3: zonder template is elk gh issue create van de hoofdsessie ask, met de reden uit de spec', () => {
    const zonder = loadConfig(appGates(undefined));

    expect(decide(bash(leerpunt(TEMPLATE)), ctxMet(zonder)).ask).toStrictEqual([GEEN_TEMPLATE]);
    expect(decide(bash(leerpunt(ANDER)), ctxMet(zonder)).ask).toStrictEqual([GEEN_TEMPLATE]);
  });

  test('template-repo/AC-3: zonder template valt het rolhek niet terug op onderhoud.repository', () => {
    const zonder = loadConfig(gatesMet({ template: undefined, onderhoud: { repository: TEMPLATE } }));
    const decision = decide(bash(leerpunt(TEMPLATE)), ctxMet(zonder));

    expect(decision.deny).toStrictEqual([]);
    expect(decision.ask).toStrictEqual([GEEN_TEMPLATE]);
  });

  test('template-repo/AC-3: zonder template blijft een subagent deny op gh issue create', () => {
    const zonder = loadConfig(appGates(undefined));

    for (const agent of ['developer', 'tester', 'reviewer', 'architect', 'docs']) {
      expect(decide(bash(leerpunt(TEMPLATE), agent), ctxMet(zonder)).deny.length, agent).toBeGreaterThan(0);
    }
  });
});

// AC-4 ---------------------------------------------------------------------------------------------------------------

const FILE = 'src/core/web/ui/toast.tsx';
const MELDING = 'functionele UI (ADR 0056)';
const files: Record<string, string> = { [FILE]: 'export const version = 1;\n' };

function schrijf(config: Config, origin: string) {
  return decide(
    {
      agent_type: 'developer',
      tool_name: 'Write',
      tool_input: { file_path: `${ROOT}/${FILE}`, content: 'export const version = 2;\n' },
    },
    ctxMet(config, {
      registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
      repository: origin,
      branch: 'fix/toasts',
      trusted: (file) => files[file] ?? null,
      working: (file) => files[file] ?? null,
      safe: () => true,
    }),
  );
}

describe('template-repo/AC-4: de core-UI-melding vergelijkt origin met template.repository', () => {
  test('template-repo/AC-4: origin gelijk aan template.repository (een app of fork) → de melding, zonder ask of deny', () => {
    const result = schrijf(loadConfig(appGates(TEMPLATE)), TEMPLATE);

    expect(result.ask).toStrictEqual([]);
    expect(result.deny).toStrictEqual([]);
    expect(result.context.join('\n')).toContain(MELDING);
    expect(result.context.join('\n')).toContain('scope worden in CI');
  });

  test('template-repo/AC-4: de template zelf (onderhoud en template gelijk) geeft dezelfde uitkomst', () => {
    const config = loadConfig(gatesMet({ template: { repository: TEMPLATE }, onderhoud: { repository: TEMPLATE } }));

    expect(schrijf(config, TEMPLATE).context.join('\n')).toContain(MELDING);
  });

  test('template-repo/AC-4: een andere origin → de melding niet, maar wel de gewone beschermd-pad-melding', () => {
    const result = schrijf(loadConfig(appGates(TEMPLATE)), ANDER);

    expect(result.context.join('\n')).not.toContain(MELDING);
    expect(result.context.join('\n')).toContain('beschermd pad');
    expect(result.ask).toStrictEqual([]);
    expect(result.deny).toStrictEqual([]);
  });

  test('template-repo/AC-4: een ontbrekende sleutel → de melding niet (ontbrekend telt als ongelijk)', () => {
    const result = schrijf(loadConfig(appGates(undefined)), TEMPLATE);

    expect(result.context.join('\n')).not.toContain(MELDING);
  });

  test('template-repo/AC-4: hoofdletters tellen (de vergelijking is exact)', () => {
    const result = schrijf(loadConfig(appGates(TEMPLATE)), TEMPLATE.toUpperCase());

    expect(result.context.join('\n')).not.toContain(MELDING);
  });

  test('template-repo/AC-4: zonder authority geen melding', () => {
    const zonder = decide(
      {
        agent_type: 'developer',
        tool_name: 'Write',
        tool_input: { file_path: `${ROOT}/${FILE}`, content: 'export const version = 2;\n' },
      },
      ctxMet(loadConfig(appGates(TEMPLATE))),
    );

    expect(zonder.context.join('\n')).not.toContain(MELDING);
  });
});

// GEWIJZIGD (spec gebouwd-zonder-nummer, ADR 0095): template-repo/AC-5 is vervallen; `approvedBefore` en `openRefusal` zijn weg
// met `pnpm docs:status`, en daarmee de gevallen die ze toetsten.
