import { describe, expect, test } from 'vitest';
import { sessionStart } from '../../rails/hooks/lib/werkstraat.mjs';

// Spec cloud-netwerkvorm/AC-10: `sessionStart` toont één Cloud-regel als de omgeving van de hook `CLAUDE_CODE_REMOTE=true` heeft.
// Gekozen veld in `deps`: `deps.env: Record<string, string | undefined>`, de omgeving van het hookproces (de aanroeper geeft
// `process.env`); de functie leest `deps.env['CLAUDE_CODE_REMOTE']` en nooit `process.env` zelf. Zonder `deps.env` is er geen
// Cloud-regel. De deps zijn nagebootst zoals in sessionstart-slank.test.ts.
const CLOUD_REGEL =
  'Cloud: commit `git commit -F <bestand>`, push `git push origin HEAD`, PR via `mcp__github__create_pull_request`, elk als los commando.';

interface Opties {
  readonly env?: Readonly<Record<string, string | undefined>>;
}

function stdout(opties: Opties = {}): string {
  const deps = {
    run: (command: string, args: readonly string[]) => {
      if (command === 'git' && args[0] === 'rev-parse') return { code: 0, output: 'claude/x\n' };
      if (command === 'git' && args[0] === 'rev-list') return { code: 0, output: '0\t0' };
      return { code: 1, output: '' };
    },
    changed: () => [],
    read: () => null,
    ...(opties.env === undefined ? {} : { env: opties.env }),
  };
  return sessionStart(deps).stdout ?? '';
}

const regels = (tekst: string): string[] => tekst.split('\n');
const cloudRegels = (tekst: string): string[] => regels(tekst).filter((regel) => regel.startsWith('Cloud:'));

describe('cloud-netwerkvorm/AC-10 startmelding in de cloud', () => {
  test('cloud-netwerkvorm/AC-10 met CLAUDE_CODE_REMOTE=true in deps.env staat de Cloud-regel er letterlijk, één keer', () => {
    const tekst = stdout({ env: { CLAUDE_CODE_REMOTE: 'true' } });

    expect(cloudRegels(tekst)).toStrictEqual([CLOUD_REGEL]);
  });

  test('cloud-netwerkvorm/AC-10 de Cloud-regel komt naast de gewone feiten, die blijven staan', () => {
    const tekst = stdout({ env: { CLAUDE_CODE_REMOTE: 'true', CLAUDE_CODE_REMOTE_ENVIRONMENT_TYPE: 'cloud_default' } });

    expect(regels(tekst)).toContain('Branch: claude/x');
    expect(regels(tekst)).toContain(CLOUD_REGEL);
  });

  test.each([
    { naam: 'zonder deps.env', env: undefined },
    { naam: 'een omgeving zonder de variabele', env: { HOME: '/root' } },
    { naam: 'CLAUDE_CODE_REMOTE=false', env: { CLAUDE_CODE_REMOTE: 'false' } },
    { naam: 'CLAUDE_CODE_REMOTE leeg', env: { CLAUDE_CODE_REMOTE: '' } },
    { naam: 'CLAUDE_CODE_REMOTE=1', env: { CLAUDE_CODE_REMOTE: '1' } },
    { naam: 'CLAUDE_CODE_REMOTE niet gezet (undefined)', env: { CLAUDE_CODE_REMOTE: undefined } },
  ])('cloud-netwerkvorm/AC-10 geen regel die met Cloud: begint: $naam', ({ env }) => {
    const tekst = env === undefined ? stdout() : stdout({ env });

    expect(cloudRegels(tekst)).toStrictEqual([]);
  });
});
