import { describe, expect, test } from 'vitest';
import { subagentStop } from '../../rails/hooks/lib/werkstraat.mjs';

// Spec ci-bewijs (AC-1 t/m AC-3): een reviewer die een rapport afsluit op een diff in db/, test/security/ of e2e/ heeft
// runnerbewijs of een voorbehoud nodig (leerpunt #683). De commando's zijn nagebootst en vastgelegd, zoals in werkstraat.test.ts.
const HEAD = 'abcdef1234567890abcdef1234567890abcdef12';

function fakeDeps(changed: readonly string[], head: string | null = HEAD) {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      run: (command: string, args: readonly string[]) => {
        const line = [command, ...args].join(' ');
        calls.push(line);
        if (line === 'git rev-parse HEAD')
          return head === null ? { code: 1, output: 'fatal' } : { code: 0, output: `${head}\n` };
        return { code: 0, output: '' };
      },
      changed: () => [...changed],
      read: () => null,
    },
  };
}

function blocked(result: { stdout?: string }): string | null {
  if (result.stdout === undefined) return null;
  const parsed: unknown = JSON.parse(result.stdout);
  return typeof parsed === 'object' && parsed !== null && 'reason' in parsed ? String(parsed.reason) : null;
}

const reden = (checks: string): string =>
  `Reviewer: de diff raakt db/, test/security/ of e2e/ en het rapport heeft geen runnerbewijs (leerpunt #683). Zet per check een regel "Runnerbewijs: <check> groen op <sha van HEAD>" (uitvoer of CI-bewijs van de hoofdsessie), of schrijf "goedgekeurd onder voorbehoud van runnerchecks" met de checks in een codeblok: het terminalblok voor de eigenaar. Gevraagd: ${checks}.`;

function stop(report: string, changed: readonly string[], head: string | null = HEAD) {
  const { deps, calls } = fakeDeps(changed, head);
  return { calls, result: subagentStop({ agent_type: 'reviewer', last_assistant_message: report }, deps) };
}

const KLAAR = '## Bevindingen\nGeen blokkerende bevindingen.';
const FENCE = '```';

describe('ci-bewijs/AC-1: blokkade zonder runnerbewijs of voorbehoud', () => {
  test('ci-bewijs/AC-1: db/ vraagt pnpm test:db, letterlijke reden', () => {
    expect(blocked(stop(KLAAR, ['db/migrations/x.sql']).result)).toBe(reden('pnpm test:db'));
  });

  test('ci-bewijs/AC-1: db/ en e2e/ vragen pnpm test:db, pnpm ui:check in die volgorde', () => {
    expect(blocked(stop(KLAAR, ['e2e/a.spec.ts', 'db/migrations/x.sql']).result)).toBe(
      reden('pnpm test:db, pnpm ui:check'),
    );
  });

  test('ci-bewijs/AC-1: alleen e2e/ vraagt pnpm ui:check', () => {
    expect(blocked(stop(KLAAR, ['e2e/a.spec.ts']).result)).toBe(reden('pnpm ui:check'));
  });

  test('ci-bewijs/AC-1: alleen test/security/ vraagt pnpm test:db', () => {
    expect(blocked(stop(KLAAR, ['test/security/resources.ts']).result)).toBe(reden('pnpm test:db'));
  });
});

describe('ci-bewijs/AC-2: runnerbewijs op de sha van HEAD', () => {
  test('ci-bewijs/AC-2: een bewijsregel met een voorvoegsel van HEAD laat door, na git rev-parse HEAD', () => {
    const { result, calls } = stop(`${KLAAR}\nRunnerbewijs: pnpm test:db groen op abcdef1`, ['db/migrations/x.sql']);

    expect(calls).toContain('git rev-parse HEAD');
    expect(result).toStrictEqual({});
  });

  test('ci-bewijs/AC-2: de bewijsregel als opsommingspunt telt', () => {
    const rapport = `${KLAAR}\n- Runnerbewijs: pnpm test:db groen op ${HEAD}`;

    expect(stop(rapport, ['db/migrations/x.sql']).calls).toContain('git rev-parse HEAD');
    expect(stop(rapport, ['db/migrations/x.sql']).result).toStrictEqual({});
  });

  test('ci-bewijs/AC-2: een andere sha blokkeert', () => {
    const rapport = `${KLAAR}\nRunnerbewijs: pnpm test:db groen op 1234567`;

    expect(blocked(stop(rapport, ['db/migrations/x.sql']).result)).toBe(reden('pnpm test:db'));
  });

  test('ci-bewijs/AC-2: een sha van 6 tekens blokkeert', () => {
    const rapport = `${KLAAR}\nRunnerbewijs: pnpm test:db groen op abcdef`;

    expect(blocked(stop(rapport, ['db/migrations/x.sql']).result)).toBe(reden('pnpm test:db'));
  });

  test('ci-bewijs/AC-2: een falende git rev-parse blokkeert', () => {
    const rapport = `${KLAAR}\nRunnerbewijs: pnpm test:db groen op abcdef1`;

    expect(blocked(stop(rapport, ['db/migrations/x.sql'], null).result)).toBe(reden('pnpm test:db'));
  });

  test('ci-bewijs/AC-2: hoofdletters in de sha tellen niet', () => {
    const rapport = `${KLAAR}\nRunnerbewijs: pnpm test:db groen op ABCDEF1`;

    expect(blocked(stop(rapport, ['db/migrations/x.sql']).result)).toBe(reden('pnpm test:db'));
  });

  test('ci-bewijs/AC-2: bij db/ en e2e/ en alleen een bewijsregel voor test:db blokkeert het ook', () => {
    const rapport = `${KLAAR}\nRunnerbewijs: pnpm test:db groen op abcdef1`;

    expect(blocked(stop(rapport, ['db/migrations/x.sql', 'e2e/a.spec.ts']).result)).toBe(
      reden('pnpm test:db, pnpm ui:check'),
    );
  });

  test('ci-bewijs/AC-2: bewijsregels voor beide checks laten door', () => {
    const rapport = `${KLAAR}\nRunnerbewijs: pnpm test:db groen op abcdef1\n* Runnerbewijs: pnpm ui:check groen op abcdef1`;

    const { result, calls } = stop(rapport, ['db/migrations/x.sql', 'e2e/a.spec.ts']);

    expect(calls).toContain('git rev-parse HEAD');
    expect(result).toStrictEqual({});
  });

  test('ci-bewijs/AC-2: een bewijsregel midden in een zin telt niet', () => {
    const rapport = `${KLAAR}\nIk zag dat Runnerbewijs: pnpm test:db groen op abcdef1 in de PR staat.`;

    expect(blocked(stop(rapport, ['db/migrations/x.sql']).result)).toBe(reden('pnpm test:db'));
  });
});

describe('ci-bewijs/AC-3: voorbehoud en geen runnerpad', () => {
  const voorbehoud = (blok: string, buiten = ''): string =>
    `${KLAAR}\ngoedgekeurd onder voorbehoud van runnerchecks.\n${buiten}\n${FENCE}\n${blok}\n${FENCE}`;

  test('ci-bewijs/AC-3: voorbehoud met beide checks in een codeblok laat door', () => {
    const changed = ['db/migrations/x.sql', 'e2e/a.spec.ts'];

    expect(stop(voorbehoud('pnpm test:db\npnpm ui:check'), changed).result).toStrictEqual({});
  });

  test('ci-bewijs/AC-3: een check die buiten het codeblok staat, telt niet', () => {
    const changed = ['db/migrations/x.sql', 'e2e/a.spec.ts'];
    const rapport = voorbehoud('pnpm test:db', 'Draai ook pnpm ui:check.');

    expect(blocked(stop(rapport, changed).result)).toBe(reden('pnpm test:db, pnpm ui:check'));
  });

  test('ci-bewijs/AC-3: voorbehoud zonder codeblok blokkeert', () => {
    const rapport = `${KLAAR}\ngoedgekeurd onder voorbehoud van runnerchecks: pnpm test:db`;

    expect(blocked(stop(rapport, ['db/migrations/x.sql']).result)).toBe(reden('pnpm test:db'));
  });

  test('ci-bewijs/AC-3: alleen src/a.ts geeft {} met alleen de kop, zonder git rev-parse HEAD', () => {
    const { result, calls } = stop(KLAAR, ['src/a.ts']);

    expect(result).toStrictEqual({});
    expect(calls).not.toContain('git rev-parse HEAD');
  });
});
