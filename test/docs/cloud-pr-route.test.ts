import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { type AbsenceExamples, expectAbsent } from '../support/absence.ts';

// Spec cloud-pr-route, AC-3 en AC-4: de docs zeggen wat er in de cloud gemeten is (F1, F5) en welke route een cloudsessie
// neemt voor commit, push, PR en bewijs.
const lees = (pad: string) => readFileSync(new URL(`../../${pad}`, import.meta.url), 'utf8');
const environment = lees('docs/ENVIRONMENT.md');
const doorloop = lees('docs/operations/agent-doorloop.md');
const framework = lees('docs/framework.md');

// De tekst van een ##-sectie tot de volgende ##-kop.
function sectie(tekst: string, kop: string): string {
  const deel = tekst.split(new RegExp(`^## ${kop}$`, 'm'))[1];
  if (deel === undefined) throw new Error(`sectie "## ${kop}" ontbreekt`);
  return deel.split(/^## /m)[0] ?? '';
}

// De regel van een R-id in het regelboek.
function regel(id: string): string {
  const gevonden = framework.split('\n').find((line) => line.startsWith(`- **${id}**`));
  if (gevonden === undefined) throw new Error(`${id} ontbreekt in docs/framework.md`);
  return gevonden;
}

const MCP_PR = 'mcp__github__create_pull_request';

describe('docs van de cloudroute voor commit, push, PR en bewijs (spec cloud-pr-route)', () => {
  test('cloud-pr-route/AC-3: Problemen noemt de 401 binnen de sandbox en de 403 op GraphQL letterlijk', () => {
    const problemen = sectie(environment, 'Problemen');

    expect(problemen).toContain('HTTP 401: Bad credentials');
    expect(problemen).toContain(
      'HTTP 403: GitHub GraphQL is not available from Claude Code sessions; use the REST API',
    );
  });

  test('cloud-pr-route/AC-3: ENVIRONMENT beschrijft de cloudroute voor commit, push, PR en bewijs', () => {
    const route = sectie(environment, 'Cloud: commit, push, PR en bewijs');

    expect(route).toContain('`git commit -F');
    expect(route).toContain('`git push origin HEAD`');
    expect(route).toContain(`\`${MCP_PR}\``);
    expect(route).toContain('`pnpm pr:verify');
    expect(route).toContain('`gh api');
  });

  test('cloud-pr-route/AC-3: de zin "Geen nieuwe runneruitzondering" is weg', () => {
    const voorbeelden: AbsenceExamples = {
      recognizes: ['Geen nieuwe runneruitzondering, Git-allowWrite'],
      allows: ['vier runneruitzonderingen voor de cloudroute'],
    };

    expectAbsent(environment, /Geen nieuwe runneruitzondering/, voorbeelden);
  });

  test('cloud-pr-route/AC-4: de doorloop noemt de MCP-tool als cloudroute voor een PR', () => {
    expect(doorloop).toContain(`\`${MCP_PR}\``);
  });

  test('cloud-pr-route/AC-4: R-SEC-09 en R-ROL-12 noemen een PR aanmaken in de cloud naast het leerpunt-issue', () => {
    for (const id of ['R-SEC-09', 'R-ROL-12']) {
      const tekst = regel(id);
      expect(tekst).toMatch(/leerpunt/);
      expect(tekst).toMatch(/PR aanmaken in de cloud/);
    }
  });
});
