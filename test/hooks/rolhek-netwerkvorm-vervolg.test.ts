import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { ROLLEN, type Rol } from './rolhek-aanvalscorpus.ts';

// Onafhankelijke aanvulling op rolhek-netwerkvorm.test.ts voor spec cloud-netwerkvorm AC-14 t/m AC-16 (vervolg op #890).
// De helpers staan hier zelf (kopie), zodat dit bestand los draait.
function kind(waarde: unknown, sleutel: string): unknown {
  if (typeof waarde !== 'object' || waarde === null) return undefined;
  return Object.entries(waarde).find(([naam]) => naam === sleutel)?.[1];
}

function echteNetwerkvormen(): string[] {
  const tekst = readFileSync(path.resolve(import.meta.dirname, '../../.claude/settings.json'), 'utf8');
  const lijst = kind(kind(JSON.parse(tekst), 'sandbox'), 'excludedCommands');
  return Array.isArray(lijst) ? lijst.filter((regel): regel is string => typeof regel === 'string') : [];
}

const config = loadConfig(readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));
const NETWERKVORMEN = echteNetwerkvormen();
const HOOFDSESSIE_EN_DEVELOPER: readonly Rol[] = ['', 'developer'];

interface Opties {
  readonly config?: typeof config;
}

interface Uitslag {
  readonly deny: string;
  readonly ask: string;
}

const rolNaam = (rol: Rol): string => (rol === '' ? 'hoofdsessie' : rol);
const metRol = (rol: Rol) => (rol === '' ? {} : { agent_type: rol });

function beslisPayload(payload: unknown, opties: Opties = {}): Uitslag {
  const ctx = {
    root: '/repo',
    cwd: '/repo',
    config: opties.config ?? config,
    read: () => null,
    committed: () => false,
    isDir: () => false,
    branch: 'feat/x',
    netwerkvormen: [...NETWERKVORMEN],
  };
  const decision = decide(payload, ctx);
  return { deny: decision.deny.join('\n'), ask: decision.ask.join('\n') };
}

const beslis = (command: string, rol: Rol): Uitslag =>
  beslisPayload({ tool_name: 'Bash', tool_input: { command }, ...metRol(rol) });

const mcp = (tool: string, rol: Rol, opties?: Opties): Uitslag =>
  beslisPayload({ tool_name: tool, tool_input: {}, ...metRol(rol) }, opties);

function rolFouten(rollen: readonly Rol[], toets: (rol: Rol) => string | null): string[] {
  return rollen.flatMap((rol) => {
    const fout = toets(rol);
    return fout === null ? [] : [`${rolNaam(rol)}: ${fout}`];
  });
}

const MAIN_REDEN = 'gh api: main verwijderen of verzetten is verboden, voor elke rol';
const MCP_REDEN = 'Push met `git push origin HEAD` als los commando; deze route slaat lefthook over';
const MAIN_PUSH = 'push naar main is verboden; open een PR';

const geweigerdAlsMain = (command: string): string[] =>
  rolFouten(ROLLEN, (rol) => {
    const { deny } = beslis(command, rol);
    return deny.includes(MAIN_REDEN) ? null : `geen deny met de main-reden (deny: ${deny || 'geen'})`;
  });

const nietGeweigerdAlsMain = (command: string): string[] =>
  rolFouten(ROLLEN, (rol) => (beslis(command, rol).deny.includes(MAIN_REDEN) ? 'onterecht main-melding' : null));

// ---------- AC-14 ----------

describe('cloud-netwerkvorm/AC-14 (vervolg) de main-regel: omzeilingen', () => {
  test.each([
    'gh api -X DELETE repos/o/r/git/refs/heads/%6dain',
    'gh api -X DELETE repos/o/r/git/refs/heads/%6Dain',
    'gh api -X DELETE repos/o/r/git/refs%2fheads%2f%6d%61in',
    'gh api -X POST repos/o/r/branches/%6dain/rename -f new_name=oud',
    'gh api -X POST repos/o/r/branches%2Fmain%2Frename -f new_name=oud',
    'gh api -XPATCH repos/o/r/git/refs/heads/main -f sha=abc',
    'gh api --method=DELETE repos/o/r/git/refs/heads/main',
    'gh api --method=PATCH repos/o/r/git/refs/heads/main -f sha=abc',
    'gh api -X DELETE https://api.github.com/repos/o/r/git/refs/heads/main',
    'gh api -X DELETE "https://api.github.com/repos/o/r/git/refs/heads/main"',
    'gh api -X DELETE "repos/o/r/git/refs/heads/main"',
    "gh api -X DELETE 'repos/o/r/git/refs/heads/main'",
    'gh api -X DELETE repos/o/r/git/refs/heads/main#frag',
    'gh api -X DELETE repos/o/r/git/refs/heads/main?force=true',
    'gh api -X DELETE repos/o/r/git/refs/heads/%4DAIN',
    'gh api -X POST repos/o/r/branches/MAIN/rename -f new_name=oud',
    'gh api -X POST repos/o/r/branches/main/rename/ -f new_name=oud',
    'gh api -X POST repos/o/r/branches//main/rename -f new_name=oud',
    'gh api -X DELETE repos/o/r/git/refs/heads/%256Dain',
    'gh api -X DELETE repos/o/r/git/refs/heads/%25256Dain',
  ])('cloud-netwerkvorm/AC-14 deny met de main-reden voor elke rol: %s', (command) => {
    expect(geweigerdAlsMain(command)).toStrictEqual([]);
  });

  test.each([
    'gh api repos/o/r/git/refs/heads/main',
    'gh api --method GET repos/o/r/git/refs/heads/main',
    'gh api --method=GET repos/o/r/git/refs/heads/%6Dain',
    'gh api -X GET repos/o/r/branches/main/rename',
    'gh api https://api.github.com/repos/o/r/git/refs/heads/main',
    'gh api repos/o/r/branches/%6Dain/rename',
  ])('cloud-netwerkvorm/AC-14 een GET op main krijgt de main-melding niet: %s', (command) => {
    expect(nietGeweigerdAlsMain(command)).toStrictEqual([]);
  });

  test.each([
    'gh api -X DELETE repos/o/r/git/refs/heads/feat/x',
    'gh api -X DELETE repos/o/r/git/refs/heads/%6Dain-oud',
    'gh api -X DELETE repos/o/r/git/refs/heads/%6Dainx',
    'gh api -X DELETE repos/o/r/git/refs/heads/xmain',
    'gh api -X DELETE repos/o/r/git/refs/heads/feat%2Fmain',
    'gh api -X DELETE repos/o/r/git/refs/tags/main',
    'gh api -X POST repos/o/r/branches/feat%2Fx/rename -f new_name=main',
    'gh api -X POST repos/o/r/branches/main-old/rename -f new_name=y',
    'gh api -X POST repos/o/r/branches/%6Dain-old/rename -f new_name=y',
    'gh api -X PATCH repos/o/r/git/refs/heads/release/%6Dain -f sha=abc',
  ])('cloud-netwerkvorm/AC-14 een andere branch krijgt de main-melding niet: %s', (command) => {
    expect(nietGeweigerdAlsMain(command)).toStrictEqual([]);
  });

  test.each([
    // Query en fragment vallen weg vóór het decoderen: %3F en %23 zijn voor GitHub een teken in het pad.
    'gh api -X DELETE repos/o/r/git/refs/heads/feat%3F/main',
    'gh api -X DELETE repos/o/r/git/refs/heads/x%23/main',
  ])('cloud-netwerkvorm/AC-14 een %%3F of %%23 in het pad is geen query: %s', (command) => {
    expect(beslis(command, '').deny).not.toContain(MAIN_REDEN);
  });

  test.each(['gh api -X DELETE repos/o/r/git/refs/heads/main%', 'gh api -X DELETE repos/o/r/git/refs/heads/%zz'])(
    'cloud-netwerkvorm/AC-14 een kapotte escape laat het rolhek niet crashen: %s',
    (command) => {
      expect(() => beslis(command, '')).not.toThrow();
    },
  );

  test('cloud-netwerkvorm/AC-14 een kapotte escape elders in het pad hindert de herkenning van main niet', () => {
    expect(beslis('gh api -X DELETE repos/o/r%zz/git/refs/heads/main', '').deny).toContain(MAIN_REDEN);
  });
});

// ---------- AC-15 ----------

describe('cloud-netwerkvorm/AC-15 (vervolg) de MCP-bestandsschrijftools onder elke servernaam', () => {
  test.each([
    'mcp__a__push_files',
    'mcp__a-b_c.d__create_or_update_file',
    'mcp__srv__delete_file',
    'mcp__claude_ai_GitHub__push_files',
  ])('cloud-netwerkvorm/AC-15 %s: elke rol krijgt de reden, hoofdsessie als ask', (tool) => {
    const fouten = rolFouten(ROLLEN, (rol) => {
      const uitslag = mcp(tool, rol);
      if (rol === '') {
        if (uitslag.deny.includes(MCP_REDEN)) return 'deny in plaats van ask';
        return uitslag.ask.includes(MCP_REDEN) ? null : `geen ask met de reden (ask: ${uitslag.ask || 'geen'})`;
      }
      return uitslag.deny.includes(MCP_REDEN) ? null : `geen deny met de reden (deny: ${uitslag.deny || 'geen'})`;
    });
    expect(fouten).toStrictEqual([]);
  });

  test.each([
    'mcp__x__push_files_old',
    'mcp__x__push_files2',
    'mcp__x__repush_files',
    'mcp__x__delete_files',
    'mcp__x__create_or_update_files',
    'mcp__x__undelete_file',
    'mcp__x__PUSH_FILES',
    'mcp__x__get_file_contents',
    'mcp__x__create_pull_request',
  ])('cloud-netwerkvorm/AC-15 %s lijkt op het patroon maar krijgt geen lefthook-melding', (tool) => {
    const fouten = rolFouten(ROLLEN, (rol) => {
      const uitslag = mcp(tool, rol, { config: { ...config, mcpLezen: [tool] } });
      return `${uitslag.deny}${uitslag.ask}`.includes('lefthook') ? 'onterechte lefthook-melding' : null;
    });
    expect(fouten).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-15 een andere servernaam geeft dezelfde lefthook-reden als mcp__github__', () => {
    const reden = (tool: string): string =>
      mcp(tool, '')
        .ask.split('\n')
        .filter((regel) => regel.includes('lefthook'))
        .join('');
    expect(reden('mcp__willekeurig__push_files')).toBe(reden('mcp__github__push_files'));
    expect(reden('mcp__willekeurig__push_files')).toContain(MCP_REDEN);
  });
});

// ---------- AC-16 ----------

describe('cloud-netwerkvorm/AC-16 (vervolg) git push naar main geeft één melding', () => {
  test.each([
    'git push --force origin main',
    'git push -f origin main',
    'git push origin +main',
    'git push origin main --force',
  ])('cloud-netwerkvorm/AC-16 %s: main-reden en force-reden blijven, geen netwerkvorm, voor elke rol', (command) => {
    const fouten = rolFouten(ROLLEN, (rol) => {
      const { deny } = beslis(command, rol);
      if (!deny.includes(MAIN_PUSH)) return `geen main-reden (deny: ${deny || 'geen'})`;
      if (!deny.includes('force-push is verboden')) return `geen force-reden (deny: ${deny})`;
      return deny.includes('Netwerkvorm:') ? `tweede melding: ${deny}` : null;
    });
    expect(fouten).toStrictEqual([]);
  });

  test.each([
    'git push origin main && git push origin claude/foo',
    'git push origin claude/foo && git push origin main',
    'git push origin main; git push -u origin claude/foo',
    'git push -u origin claude/foo && git push origin HEAD:main',
  ])(
    'cloud-netwerkvorm/AC-16 een samengesteld commando met een main-push blijft geweigerd, zonder netwerkvorm: %s',
    (command) => {
      const fouten = rolFouten(ROLLEN, (rol) => {
        const { deny } = beslis(command, rol);
        if (!deny.includes(MAIN_PUSH)) return `geen main-reden (deny: ${deny || 'geen'})`;
        return deny.includes('Netwerkvorm:') ? `netwerkvorm-melding: ${deny}` : null;
      });
      expect(fouten).toStrictEqual([]);
    },
  );

  test.each([
    'git push origin claude/foo',
    'git push -u origin claude/foo',
    'git push origin main-old',
    'git push origin feat/main',
  ])('cloud-netwerkvorm/AC-16 %s is geen main: netwerkvorm-melding blijft, main-reden niet', (command) => {
    const fouten = rolFouten(HOOFDSESSIE_EN_DEVELOPER, (rol) => {
      const { deny } = beslis(command, rol);
      if (deny.includes(MAIN_PUSH)) return 'onterechte main-reden';
      return deny.includes('Netwerkvorm:') ? null : 'netwerkvorm-melding ontbreekt';
    });
    expect(fouten).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-16 de main-reden staat precies één keer in de weigering', () => {
    const { deny } = beslis('git push origin main', '');
    expect(deny.split(MAIN_PUSH).length - 1).toBe(1);
  });
});
