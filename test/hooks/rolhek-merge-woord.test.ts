import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Spec rolhek-leerpunten/AC-5 (leerpunt #736), bewijsbestand: `gh pr create --head <branch met merge>` blijft voor de
// hoofdsessie geweigerd (WS-04, R-ROL-11), nu met een aanwijzing. Er komt geen verruiming (OV-3): de groene rijen zijn regressie.
// Ctx: de vaste ctx uit de meettabel (die van rolhek-pr-merge.test.ts), plus `netwerkvormen`.
const config = loadConfig(readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));

function verdict(command: string) {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command } },
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
      netwerkvormen: ['git commit *', 'git push origin HEAD'],
    },
  );
  if (decision.deny.length > 0) return { uitslag: 'deny', reden: decision.deny.join('; ') };
  if (decision.ask.length > 0) return { uitslag: 'ask', reden: decision.ask.join('; ') };
  return { uitslag: decision.allow === true ? 'allow' : 'context', reden: '' };
}

// De weigering van een `--head` met merge is het vangnet op de ruwe tekst (`rawForbidden`); de aanwijzing komt erachter.
const WS04 = 'mergen of goedkeuren via gh of …/pulls/ is voor elke rol verboden (vangnet op de ruwe tekst, WS-04)';
const AANWIJZING =
  'het woord merge in een branchnaam telt hier mee (R-ROL-11): kies een branchnaam zonder dat woord (spec rolhek-leerpunten/AC-5)';

describe('rolhek-leerpunten/AC-5 nieuw gedrag: de weigering van --head met merge krijgt een aanwijzing', () => {
  const HEAD = 'gh pr create --head chore/iets-uit-merge --title "fix: x" --body-file f.md';

  test('rolhek-leerpunten/AC-5: de hoofdsessie blijft geweigerd (WS-04)', () => {
    const uitslag = verdict(HEAD);
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(WS04);
  });

  test('rolhek-leerpunten/AC-5: de weigering eindigt met de #736-tekst, achter de WS-04-weigering en een puntkomma met spatie', () => {
    expect(verdict(HEAD).reden).toContain(`${WS04}; ${AANWIJZING}`);
  });
});

describe('rolhek-leerpunten/AC-5 regressie: wat nu groen is, blijft groen', () => {
  test.each([
    'git add test/scripts/pr-merge.test.ts',
    'git add scripts/kit/pr-merge.mjs',
    'git grep -n "pr:merge" -- docs/template/specs/templateregime.md',
    "git branch --list 'chore/*'",
    'gh pr create --title "fix(merge): x" --body-file f.md',
  ])('rolhek-leerpunten/AC-5: de hoofdsessie mag %s', (command) => {
    const uitslag = verdict(command);
    expect(uitslag.uitslag).not.toBe('deny');
    expect(uitslag.uitslag).not.toBe('ask');
    expect(uitslag.reden).not.toContain(AANWIJZING);
  });

  // `git merge main` is voor de hoofdsessie een melding (`context`), geen weigering (spec): daarom geen rij hier.
  test.each(['gh pr merge 1', 'gh api -X PUT repos/o/r/pulls/1/merge'])(
    'rolhek-leerpunten/AC-5: de hoofdsessie blijft geweigerd voor %s, zonder de #736-tekst',
    (command) => {
      const uitslag = verdict(command);
      expect(uitslag.uitslag).toBe('deny');
      expect(uitslag.reden).not.toContain(AANWIJZING);
    },
  );

  test('rolhek-leerpunten/AC-5: gh pr create zonder merge in --head krijgt de #736-tekst niet', () => {
    const uitslag = verdict('gh pr create --head chore/iets --title "fix(merge): x" --body-file f.md');
    expect(uitslag.reden).not.toContain(AANWIJZING);
  });

  // Geweigerd om een andere reden dan het woord in de `--head`-waarde: de aanwijzing hoort er dan niet bij.
  test.each([
    'gh pr create --head chore/x --title x --body "please merge"',
    'gh pr create --head merge-x && gh pr merge 1',
    'gh pr create --head feat/merge-x --title "merge it"',
  ])('rolhek-leerpunten/AC-5: geweigerd zonder de #736-tekst: %s', (command) => {
    const uitslag = verdict(command);
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).not.toContain(AANWIJZING);
  });
});

describe('rolhek-leerpunten/AC-5 nieuw gedrag: ook de andere vormen van --head en gh pr create', () => {
  test.each([
    'gh pr create -H chore/iets-uit-merge --title "fix: x" --body-file f.md',
    'gh pr create -Hchore/iets-uit-merge --title "fix: x" --body-file f.md',
    'gh pr create --head=chore/iets-uit-merge --title "fix: x" --body-file f.md',
    'gh pr new --head chore/iets-uit-merge --title "fix: x" --body-file f.md',
    'gh pr --repo o/r create --head chore/iets-uit-merge --title "fix: x" --body-file f.md',
  ])('rolhek-leerpunten/AC-5: de weigering krijgt de #736-tekst: %s', (command) => {
    const uitslag = verdict(command);
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toContain(`${WS04}; ${AANWIJZING}`);
  });
});
