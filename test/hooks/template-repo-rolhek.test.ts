import { describe, expect, test } from 'vitest';
import { openRefusal } from '../../rails/hooks/lib/built-evidence.mjs';
import { documentInfo } from '../../rails/hooks/lib/document-state.mjs';
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

// AC-5 ---------------------------------------------------------------------------------------------------------------

// `approvedBefore` is niet geëxporteerd; `openRefusal` is de aanroeper met `uiApproval`: false = geen weigering = akkoord.
const SPEC = 'docs/specs/toast-fix.md';
const PR = 130;
const MINI = [
  '---',
  'status: goedgekeurd',
  'namespace: toast-fix',
  'sjabloon: mini',
  'scope: functionele-ui',
  '---',
  '',
  '# Toastfix',
  '',
  '## Hergebruik en UX',
  '',
  'Bestaande toast. De versie verandert.',
  '',
].join('\n');
const GEBOUWD = MINI.replace('status: goedgekeurd', `status: gebouwd # #${String(PR)}`);
const DIGEST = documentInfo(SPEC, MINI)?.digest;
const GATES_PAD = '.claude/gates.json';

const gatesMetTemplate = (repository: string) => JSON.stringify({ template: { repository } });

interface Bronnen {
  repository?: string;
  trusted?: string | null;
  working?: string | null;
  uiApproval?: string | null | undefined;
}

function weigert(bronnen: Bronnen): boolean {
  const { repository = TEMPLATE, trusted = null, working = null } = bronnen;
  // `uiApproval: undefined` is expres "ontbreekt"; alleen een weggelaten sleutel krijgt de digest van de goedgekeurde spec.
  const uiApproval = 'uiApproval' in bronnen ? bronnen.uiApproval : DIGEST;
  const authority = {
    registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
    repository,
    branch: 'feat/toast-fix',
    // Alleen het gates-bestand is te lezen; de spec zelf staat niet op main (een UI-akkoord, geen besluitrecord).
    trusted: (file: string) => (file === GATES_PAD ? trusted : null),
    working: (file: string) => (file === GATES_PAD ? working : null),
    safe: () => true,
  };
  return openRefusal(
    { file: SPEC, text: GEBOUWD },
    {
      pr: {
        number: PR,
        repository,
        branch: 'feat/toast-fix',
        headSha: 'a'.repeat(40),
        state: 'open',
        merged: false,
        mergeSha: null,
        baseBranch: 'main',
      },
      code: true,
      uiApproval,
    },
    authority,
  );
}

describe('template-repo/AC-5: approvedBefore toetst authority.repository aan template.repository uit de vertrouwde bron', () => {
  test('template-repo/AC-5: gelijk aan template.repository in de vertrouwde gates.json → akkoord', () => {
    expect(weigert({ trusted: gatesMetTemplate(TEMPLATE) })).toBe(false);
  });

  test('template-repo/AC-5: de template zelf (onderhoud en template) → akkoord', () => {
    const trusted = JSON.stringify({ onderhoud: { repository: TEMPLATE }, template: { repository: TEMPLATE } });

    expect(weigert({ trusted })).toBe(false);
  });

  test('template-repo/AC-5: een fork volgt zijn eigen template.repository', () => {
    expect(weigert({ repository: 'acme/vork', trusted: gatesMetTemplate('acme/vork') })).toBe(false);
  });

  test('template-repo/AC-5: een andere repository dan template.repository → geen akkoord', () => {
    expect(weigert({ repository: ANDER, trusted: gatesMetTemplate(TEMPLATE) })).toBe(true);
  });

  test('template-repo/AC-5: hoofdletters tellen (de vergelijking is exact)', () => {
    expect(weigert({ repository: TEMPLATE.toUpperCase(), trusted: gatesMetTemplate(TEMPLATE) })).toBe(true);
  });

  test('template-repo/AC-5: de sleutel staat alleen in de werkmap, niet in de vertrouwde bron → geen akkoord', () => {
    expect(weigert({ trusted: JSON.stringify({ paden: {} }), working: gatesMetTemplate(TEMPLATE) })).toBe(true);
    expect(weigert({ trusted: null, working: gatesMetTemplate(TEMPLATE) })).toBe(true);
  });

  test('template-repo/AC-5: de werkmap zegt de repository, de vertrouwde bron een andere → geen akkoord', () => {
    expect(weigert({ trusted: gatesMetTemplate(ANDER), working: gatesMetTemplate(TEMPLATE) })).toBe(true);
  });

  test.each([
    { naam: 'onleesbaar (geen JSON)', trusted: '{ dit is geen json' },
    { naam: 'zonder template-sleutel', trusted: JSON.stringify({ onderhoud: { repository: TEMPLATE } }) },
    { naam: 'template in een verkeerde vorm', trusted: JSON.stringify({ template: TEMPLATE }) },
    { naam: 'template met een extra sleutel', trusted: JSON.stringify({ template: { repository: TEMPLATE, x: 1 } }) },
    { naam: 'template.repository geen tekst', trusted: JSON.stringify({ template: { repository: 7 } }) },
    { naam: 'afwezig (null)', trusted: null },
  ])(
    'template-repo/AC-5: een vertrouwde gates.json die $naam is → telt als niet de template, geen akkoord',
    ({ trusted }) => {
      expect(weigert({ trusted })).toBe(true);
    },
  );

  test('template-repo/AC-5: zonder UI-akkoordbewijs (digest) geeft de juiste repository nog geen akkoord', () => {
    expect(weigert({ trusted: gatesMetTemplate(TEMPLATE), uiApproval: null })).toBe(true);
    expect(weigert({ trusted: gatesMetTemplate(TEMPLATE), uiApproval: undefined })).toBe(true);
  });
});
