import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { echteGates, gatesMet, templateRepositoryVan } from '../rails/template-repo-kit';

// Spec leerlus-bewijs AC-11, ADR 0101 punt 5: de hoofdsessie mag `gh issue comment|edit|close` op de template-repo zonder
// vraag van het rolhek, in drie exacte vormen met `--repo`/`-R` precies één keer gelijk aan `template.repository`. Elke andere
// vorm is ask; een label-optie bij edit is deny voor elke rol; een subagent blijft deny. Het rolhek geeft zelf geen allow.
// Vorm als test/hooks/rolhek-leerpunt.test.ts (dat bestand wijzigt de hoofdsessie, niet de tester).
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));
const REPO = String(templateRepositoryVan(echteGates()));

function ctx(cfg = config) {
  return {
    root: ROOT,
    cwd: ROOT,
    config: cfg,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
  };
}

type Verdict = 'allow' | 'ask' | 'deny' | 'context';

function verdict(payload: unknown, cfg = config): Verdict {
  const decision = decide(payload, ctx(cfg));
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.context.length > 0 ? 'context' : 'allow';
}

const bash = (command: string, agent?: string) => ({
  tool_name: 'Bash',
  tool_input: { command },
  ...(agent === undefined ? {} : { agent_type: agent }),
});

const SUBAGENTS = ['developer', 'tester', 'reviewer', 'architect', 'docs', 'Explore'];

test('leerlus-bewijs/AC-11: gates.json heeft een template.repository (<owner>/<repo>)', () => {
  expect(REPO).toMatch(/^[\w.-]+\/[\w.-]+$/);
});

describe('hoofdsessie: geldige vormen → geen ask en geen deny', () => {
  test.each([
    { naam: 'comment --repo, --body-file', command: `gh issue comment --repo ${REPO} 5 --body-file f.md` },
    { naam: 'comment nummer vóór --repo, -F', command: `gh issue comment 5 --repo ${REPO} -F f.md` },
    { naam: 'comment -R', command: `gh issue comment -R ${REPO} 5 -F f.md` },
    { naam: 'comment --repo=<repo> en --body-file=', command: `gh issue comment --repo=${REPO} 5 --body-file=f.md` },
    { naam: 'comment repo in hoofdletters', command: `gh issue comment --repo ${REPO.toUpperCase()} 5 -F f.md` },
    { naam: 'comment geclusterd -Ff.md', command: `gh issue comment --repo ${REPO} 5 -Ff.md` },
    { naam: 'comment -R<repo> geclusterd', command: `gh issue comment -R${REPO} 5 -F f.md` },
    { naam: 'comment opties vóór issue (--repo)', command: `gh --repo ${REPO} issue comment 5 -F f.md` },
    { naam: 'comment opties vóór issue (-R)', command: `gh -R ${REPO} issue comment 5 -F f.md` },
    { naam: 'comment opties tussen issue en actie', command: `gh issue -R ${REPO} comment 5 -F f.md` },
    { naam: 'edit alleen --title', command: `gh issue edit --repo ${REPO} 5 --title "Nieuwe titel"` },
    { naam: 'edit alleen --body-file', command: `gh issue edit --repo ${REPO} 5 --body-file f.md` },
    { naam: 'edit -t en -F', command: `gh issue edit --repo ${REPO} 5 -t Titel -F f.md` },
    { naam: 'edit geclusterd -tTitel', command: `gh issue edit --repo ${REPO} 5 -tTitel` },
    { naam: 'edit --title=… --body-file=…', command: `gh issue edit -R ${REPO} 5 --title=Titel --body-file=f.md` },
    { naam: 'edit repo in hoofdletters', command: `gh issue edit --repo ${REPO.toUpperCase()} 5 -F f.md` },
    { naam: 'edit opties vóór issue', command: `gh -R ${REPO} issue edit 5 -F f.md` },
    { naam: 'close --duplicate-of', command: `gh issue close --repo ${REPO} 5 --duplicate-of 3` },
    { naam: 'close nummer vóór --repo', command: `gh issue close 5 --repo ${REPO} --duplicate-of 3` },
    { naam: 'close --duplicate-of=3', command: `gh issue close -R ${REPO} 5 --duplicate-of=3` },
    { naam: 'close repo in hoofdletters', command: `gh issue close --repo ${REPO.toUpperCase()} 5 --duplicate-of 3` },
    { naam: 'close opties vóór issue', command: `gh --repo ${REPO} issue close 5 --duplicate-of 3` },
  ])('leerlus-bewijs/AC-11: $naam', ({ command }) => {
    expect(decide(bash(command), ctx())).toMatchObject({ deny: [], ask: [] });
  });
});

describe('hoofdsessie: elke andere vorm → ask met een reden', () => {
  const C = `gh issue comment --repo ${REPO} 5`;
  const E = `gh issue edit --repo ${REPO} 5`;
  const X = `gh issue close --repo ${REPO} 5`;
  test.each([
    { naam: 'comment: andere repo', command: 'gh issue comment --repo iemand/anders 5 -F f.md' },
    { naam: 'comment: geen repo', command: 'gh issue comment 5 -F f.md' },
    { naam: 'comment: repo als URL', command: `gh issue comment --repo https://github.com/${REPO} 5 -F f.md` },
    { naam: 'comment: repo twee keer', command: `gh issue comment --repo ${REPO} -R ${REPO} 5 -F f.md` },
    { naam: 'edit: andere repo', command: 'gh issue edit --repo iemand/anders 5 -F f.md' },
    { naam: 'edit: geen repo', command: 'gh issue edit 5 -F f.md' },
    { naam: 'close: andere repo', command: 'gh issue close --repo iemand/anders 5 --duplicate-of 3' },
    { naam: 'close: geen repo', command: 'gh issue close 5 --duplicate-of 3' },
    { naam: 'GH_REPO= in het commando', command: `GH_REPO=iemand/anders ${C} -F f.md` },
    { naam: 'GH_HOST= in het commando', command: `GH_HOST=example.com ${C} -F f.md` },
    { naam: 'export GH_REPO', command: `export GH_REPO=iemand/anders && ${C} -F f.md` },
    { naam: 'comment: --body', command: `${C} --body "tekst"` },
    { naam: 'comment: -b', command: `${C} -b tekst` },
    { naam: 'comment: --body naast --body-file', command: `${C} -F f.md --body tekst` },
    { naam: 'comment: --editor', command: `${C} --editor` },
    { naam: 'comment: -e', command: `${C} -e` },
    { naam: 'comment: --web', command: `${C} --web` },
    { naam: 'comment: -w', command: `${C} -w` },
    { naam: 'comment: --edit-last', command: `${C} --edit-last -F f.md` },
    { naam: 'comment: --delete-last', command: `${C} --delete-last` },
    { naam: 'comment: --create-if-none', command: `${C} --edit-last --create-if-none -F f.md` },
    { naam: 'comment: zonder tekstbron', command: C },
    { naam: 'comment: --body-file - (stdin)', command: `${C} --body-file -` },
    { naam: 'comment: -F - (stdin)', command: `${C} -F -` },
    { naam: 'edit: --body', command: `${E} --body tekst` },
    { naam: 'edit: -b', command: `${E} -b tekst` },
    { naam: 'edit: --editor', command: `${E} -e` },
    { naam: 'edit: --web', command: `${E} --web` },
    { naam: 'edit: --body-file - (stdin)', command: `${E} --body-file -` },
    { naam: 'edit: zonder --title of --body-file', command: E },
    { naam: 'edit: onbekende optie', command: `${E} -F f.md --milestone v1` },
    { naam: 'close: zonder --duplicate-of', command: X },
    { naam: 'close: --reason', command: `${X} --reason "not planned"` },
    // GEWIJZIGD (leerlus-bewijs/AC-16, ADR 0109): de rij `close: -r` (`-r completed`) was ask; `--reason completed` in alle
    // schrijfwijzen is nu een geldige vorm (zie "sluiten als opgelost" onderaan). Een andere waarde bij -r blijft ask.
    { naam: 'close: -r met andere waarde', command: `${X} -r wontfix` },
    { naam: 'close: --comment', command: `${X} --comment x --duplicate-of 3` },
    { naam: 'close: -c', command: `${X} -c x --duplicate-of 3` },
    { naam: 'close: --duplicate-of met URL', command: `${X} --duplicate-of https://github.com/iemand/anders/issues/3` },
    { naam: 'close: --duplicate-of met niet-getal', command: `${X} --duplicate-of abc` },
    { naam: 'close: --duplicate-of met #nummer', command: `${X} --duplicate-of '#3'` },
    { naam: 'close: --duplicate-of zonder waarde', command: `${X} --duplicate-of` },
    {
      naam: 'nummer als URL (comment)',
      command: `gh issue comment --repo ${REPO} https://github.com/iemand/anders/issues/5 -F f.md`,
    },
    {
      naam: 'nummer als URL (edit)',
      command: `gh issue edit --repo ${REPO} https://github.com/iemand/anders/issues/5 -F f.md`,
    },
    {
      naam: 'nummer als URL (close)',
      command: `gh issue close --repo ${REPO} https://github.com/iemand/anders/issues/5 --duplicate-of 3`,
    },
    { naam: '-- (einde van de opties)', command: `${C} -F f.md -- 6` },
    { naam: 'geen nummer (comment)', command: `gh issue comment --repo ${REPO} -F f.md` },
    { naam: 'geen nummer (edit)', command: `gh issue edit --repo ${REPO} -F f.md` },
    { naam: 'geen nummer (close)', command: `gh issue close --repo ${REPO} --duplicate-of 3` },
    { naam: 'twee nummers (comment)', command: `${C} 6 -F f.md` },
    { naam: 'twee nummers (close)', command: `${X} 6 --duplicate-of 3` },
    { naam: 'onbekende optie (comment)', command: `${C} -F f.md --foo` },
    { naam: 'onbekende korte optie (close)', command: `${X} --duplicate-of 3 -z` },
  ])('leerlus-bewijs/AC-11: $naam', ({ command }) => {
    expect(verdict(bash(command))).toBe('ask');
    expect(decide(bash(command), ctx()).ask.join(' ').trim().length).toBeGreaterThan(10);
  });

  // De spec noemt commandosubstitutie onder "ask"; het rolhek weigert een variabel commandowoord naast een gh-subcommando nu
  // al met deny (eigenaarkeuze 2026-10-27, test/hooks/rolhek-leerpunt.test.ts). Beide zijn "geen vrije doorgang": de test
  // eist alleen dat de geldige vorm met substitutie nooit geen-ask-geen-deny wordt.
  test.each([
    { naam: '$( ) in de waarde', command: `${C} --body-file "$(mktemp)"` },
    { naam: 'backticks in de waarde', command: `${C} --body-file \`mktemp\`` },
  ])('leerlus-bewijs/AC-11: commandosubstitutie, $naam → ask of deny, nooit allow', ({ command }) => {
    expect(['ask', 'deny']).toContain(verdict(bash(command)));
  });

  test('leerlus-bewijs/AC-11: ontbreekt template.repository, dan is zelfs de juiste vorm ask', () => {
    const zonderRepo = loadConfig(gatesMet({ template: undefined }));
    expect(
      [
        `gh issue comment --repo ${REPO} 5 -F f.md`,
        `gh issue edit --repo ${REPO} 5 -F f.md`,
        `gh issue close --repo ${REPO} 5 --duplicate-of 3`,
      ].map((command) => verdict(bash(command), zonderRepo)),
    ).toStrictEqual(['ask', 'ask', 'ask']);
  });

  test('leerlus-bewijs/AC-11: template.repository bepaalt het doel, ook voor bijwerken', () => {
    const fork = loadConfig(gatesMet({ template: { repository: 'iemand/fork' } }));
    expect(verdict(bash('gh issue comment --repo iemand/fork 5 -F f.md'), fork)).not.toBe('ask');
    expect(verdict(bash(`gh issue comment --repo ${REPO} 5 -F f.md`), fork)).toBe('ask');
  });
});

describe('hoofdsessie: andere schrijfacties op een issue → ask', () => {
  test.each(['reopen', 'delete', 'transfer', 'lock', 'unlock', 'pin', 'unpin', 'develop'])(
    'leerlus-bewijs/AC-11: gh issue %s → ask, ook met de juiste repo en een nummer',
    (actie) => {
      expect(verdict(bash(`gh issue ${actie} --repo ${REPO} 5`))).toBe('ask');
      expect(verdict(bash(`gh issue ${actie} 5`))).toBe('ask');
    },
  );
});

describe('label-optie bij edit → deny voor elke rol', () => {
  const LABELS = [
    `gh issue edit --repo ${REPO} 5 --add-label leerpunt`,
    `gh issue edit --repo ${REPO} 5 --remove-label leerpunt`,
    `gh issue edit --repo ${REPO} 5 --remove-label leerpunt-onvolledig -F f.md`,
    `gh issue edit --repo ${REPO} 5 --title Titel --add-label x`,
    `gh issue edit --repo ${REPO} 5 --add-label=x -F f.md`,
  ];

  test.each(LABELS)('leerlus-bewijs/AC-11: hoofdsessie, %s', (command) => {
    expect(verdict(bash(command))).toBe('deny');
  });

  test.each(SUBAGENTS)('leerlus-bewijs/AC-11: %s, label-optie bij edit', (agent) => {
    expect(LABELS.map((command) => verdict(bash(command, agent)))).toStrictEqual(LABELS.map(() => 'deny'));
  });
});

describe('subagent: schrijvende gh issue blijft deny', () => {
  const GELDIG = [
    `gh issue comment --repo ${REPO} 5 -F f.md`,
    `gh issue comment -R ${REPO} 5 --body-file f.md`,
    `gh issue edit --repo ${REPO} 5 --title Titel`,
    `gh issue edit --repo ${REPO} 5 -F f.md`,
    `gh issue close --repo ${REPO} 5 --duplicate-of 3`,
    `gh -R ${REPO} issue close 5 --duplicate-of 3`,
  ];

  test.each(SUBAGENTS)('leerlus-bewijs/AC-11: %s → deny op de drie geldige vormen', (agent) => {
    expect(GELDIG.map((command) => verdict(bash(command, agent)))).toStrictEqual(GELDIG.map(() => 'deny'));
  });
});

// Spec leerlus-bewijs AC-16, ADR 0109 punt 3: sluiten als opgelost. Dezelfde eisen als AC-11, met `--reason completed` in
// plaats van `--duplicate-of`; `-r` telt als `--reason` (GH_KORT).
describe('leerlus-bewijs/AC-16 sluiten als opgelost: geldige vormen → geen ask en geen deny', () => {
  test.each([
    { naam: '--reason completed', command: `gh issue close --repo ${REPO} 5 --reason completed` },
    { naam: '--reason=completed', command: `gh issue close --repo ${REPO} 5 --reason=completed` },
    { naam: '-r completed', command: `gh issue close --repo ${REPO} 5 -r completed` },
    { naam: '-rcompleted', command: `gh issue close --repo ${REPO} 5 -rcompleted` },
    { naam: '-r=completed', command: `gh issue close --repo ${REPO} 5 -r=completed` },
    { naam: 'nummer vóór --repo', command: `gh issue close 5 --repo ${REPO} --reason completed` },
    { naam: '-R', command: `gh issue close -R ${REPO} 5 --reason completed` },
    { naam: '--repo=<repo>', command: `gh issue close --repo=${REPO} 5 --reason completed` },
    { naam: 'repo in hoofdletters', command: `gh issue close --repo ${REPO.toUpperCase()} 5 --reason completed` },
    { naam: 'opties vóór issue', command: `gh --repo ${REPO} issue close 5 --reason completed` },
    { naam: 'opties tussen issue en actie', command: `gh issue -R ${REPO} close 5 --reason completed` },
  ])('leerlus-bewijs/AC-16: $naam', ({ command }) => {
    expect(decide(bash(command), ctx())).toMatchObject({ deny: [], ask: [] });
  });
});

describe('leerlus-bewijs/AC-16 sluiten als opgelost: elke afwijking → ask met een reden', () => {
  const X = `gh issue close --repo ${REPO} 5`;
  test.each([
    { naam: '--reason "not planned"', command: `${X} --reason "not planned"` },
    { naam: '--reason not_planned', command: `${X} --reason not_planned` },
    { naam: '--reason Completed (hoofdletter)', command: `${X} --reason Completed` },
    { naam: '--reason leeg', command: `${X} --reason ""` },
    { naam: '--reason zonder waarde', command: `${X} --reason` },
    { naam: '-r not_planned', command: `${X} -r not_planned` },
    { naam: '--reason twee keer', command: `${X} --reason completed --reason completed` },
    { naam: '--reason en -r', command: `${X} --reason completed -r completed` },
    { naam: '--reason samen met --duplicate-of', command: `${X} --reason completed --duplicate-of 3` },
    { naam: '--comment naast --reason completed', command: `${X} --reason completed --comment klaar` },
    { naam: '-c naast --reason completed', command: `${X} --reason completed -c klaar` },
    {
      naam: 'URL als nummer',
      command: `gh issue close --repo ${REPO} https://github.com/iemand/anders/issues/5 --reason completed`,
    },
    { naam: 'tweede nummer', command: `${X} 6 --reason completed` },
    { naam: 'geen nummer', command: `gh issue close --repo ${REPO} --reason completed` },
    { naam: 'andere repo', command: 'gh issue close --repo iemand/anders 5 --reason completed' },
    { naam: 'geen repo', command: 'gh issue close 5 --reason completed' },
    { naam: 'repo twee keer', command: `${X} -R ${REPO} --reason completed` },
    { naam: 'GH_REPO= in het commando', command: `GH_REPO=iemand/anders ${X} --reason completed` },
    { naam: 'GH_HOST= in het commando', command: `GH_HOST=example.com ${X} --reason completed` },
    { naam: 'andere optie erbij', command: `${X} --reason completed --foo` },
    { naam: 'onbekende korte optie', command: `${X} --reason completed -z` },
    { naam: '-- (einde van de opties)', command: `${X} --reason completed -- 6` },
    { naam: 'zonder --reason en zonder --duplicate-of', command: X },
    { naam: 'reopen blijft ask', command: `gh issue reopen --repo ${REPO} 5` },
  ])('leerlus-bewijs/AC-16: $naam', ({ command }) => {
    expect(verdict(bash(command))).toBe('ask');
    expect(decide(bash(command), ctx()).ask.join(' ').trim().length).toBeGreaterThan(10);
  });

  test.each([
    { naam: '$( ) in de waarde', command: `${X} --reason "$(echo completed)"` },
    { naam: 'backticks in de waarde', command: `${X} --reason \`echo completed\`` },
  ])('leerlus-bewijs/AC-16: commandosubstitutie, $naam → ask of deny, nooit allow', ({ command }) => {
    expect(['ask', 'deny']).toContain(verdict(bash(command)));
  });

  test('leerlus-bewijs/AC-16: ontbreekt template.repository, dan is zelfs --reason completed ask', () => {
    const zonderRepo = loadConfig(gatesMet({ template: undefined }));
    expect(verdict(bash(`gh issue close --repo ${REPO} 5 --reason completed`), zonderRepo)).toBe('ask');
  });

  test('leerlus-bewijs/AC-16: template.repository bepaalt het doel ook voor --reason completed', () => {
    const fork = loadConfig(gatesMet({ template: { repository: 'iemand/fork' } }));
    expect(verdict(bash('gh issue close --repo iemand/fork 5 --reason completed'), fork)).not.toBe('ask');
    expect(verdict(bash(`gh issue close --repo ${REPO} 5 --reason completed`), fork)).toBe('ask');
  });

  test.each(SUBAGENTS)('leerlus-bewijs/AC-16: %s → deny op elke vorm van sluiten als opgelost', (agent) => {
    const vormen = [
      `gh issue close --repo ${REPO} 5 --reason completed`,
      `gh issue close -R ${REPO} 5 -r completed`,
      `gh -R ${REPO} issue close 5 --reason=completed`,
    ];
    expect(vormen.map((command) => verdict(bash(command, agent)))).toStrictEqual(vormen.map(() => 'deny'));
  });
});

// Spec leerlus-bewijs AC-17, ADR 0109 punt 3: in de cloud blijft het rolhek op de MCP-issuetool vragen (hoofdsessie) of
// weigeren (subagent); `mcpLezen` verandert niet. Deze rijen zijn een regressievergrendeling en nu al groen.
describe('leerlus-bewijs/AC-17 cloud: MCP-issuetool blijft ask voor de hoofdsessie en deny voor een subagent', () => {
  const mcp = (tool: string, input: unknown, agent?: string) => ({
    tool_name: tool,
    tool_input: input,
    ...(agent === undefined ? {} : { agent_type: agent }),
  });
  const SCHRIJF: [string, unknown][] = [
    ['mcp__github__issue_write', { method: 'update', issue_number: 5, state: 'closed', state_reason: 'completed' }],
    ['mcp__github__issue_write', { method: 'update', issue_number: 5, state: 'closed', state_reason: 'duplicate' }],
    ['mcp__github__issue_write', { method: 'update', issue_number: 5, state: 'closed', state_reason: 'not_planned' }],
    ['mcp__github__issue_write', { method: 'update', issue_number: 5, state: 'open' }],
    ['mcp__github__add_issue_comment', { issue_number: 5, body: 'opgelost: #834' }],
  ];

  test.each(SCHRIJF)('leerlus-bewijs/AC-17: hoofdsessie, %s → ask', (tool, input) => {
    expect(verdict(mcp(tool, input))).toBe('ask');
  });

  test.each(SUBAGENTS)('leerlus-bewijs/AC-17: %s → deny op de MCP-issuetool', (agent) => {
    expect(SCHRIJF.map(([tool, input]) => verdict(mcp(tool, input, agent)))).toStrictEqual(SCHRIJF.map(() => 'deny'));
  });

  test('leerlus-bewijs/AC-17: mcpLezen bevat de MCP-schrijftools voor issues niet', () => {
    expect(config.mcpLezen).not.toContain('mcp__github__issue_write');
    expect(config.mcpLezen).not.toContain('mcp__github__add_issue_comment');
  });
});
