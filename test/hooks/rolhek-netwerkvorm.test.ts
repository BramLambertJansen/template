import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { ROLLEN, type Rol } from './rolhek-aanvalscorpus.ts';

// Bewijstest van leerpunt #880: de job leerpunt-bewijs kopieert alleen dit bestand naar de basis, dus een import van een nieuw
// hulpbestand (netwerkvormen-kit.ts) zou daar op laden falen in plaats van op een assertie. Daarom staat de lezer hier zelf.
function kind(waarde: unknown, sleutel: string): unknown {
  if (typeof waarde !== 'object' || waarde === null) return undefined;
  return Object.entries(waarde).find(([naam]) => naam === sleutel)?.[1];
}

function echteNetwerkvormen(): string[] {
  const tekst = readFileSync(path.resolve(import.meta.dirname, '../../.claude/settings.json'), 'utf8');
  const lijst = kind(kind(JSON.parse(tekst), 'sandbox'), 'excludedCommands');
  return Array.isArray(lijst) ? lijst.filter((regel): regel is string => typeof regel === 'string') : [];
}

// Spec cloud-netwerkvorm (AC-1 t/m AC-6, AC-8, AC-9, AC-12, AC-13): het rolhek weigert een netwerk- of signeergevoelig commando
// dat niet in de vorm van `sandbox.excludedCommands` staat, voor elke rol, en weigert de MCP-bestandsschrijftools.
//
// Gekozen veldnaam in de ctx van `decide` (de spec stelt een lijst patronen voor): `ctx.netwerkvormen: readonly string[]`, de
// patronen zoals ze in `excludedCommands` staan (`git push origin HEAD`, `git commit *`). `rolhekContext` vult hem uit de
// vertrouwde basis (zie rolhek-netwerkvorm-context.test.ts); deze tests geven hem rechtstreeks mee, zoals rolhek-pr-merge.test.ts
// zijn ctx opbouwt. AC-1 t/m AC-5, AC-8, AC-9, AC-12 en AC-13 gebruiken de echte lijst uit `.claude/settings.json`, AC-6 een
// lijst met een extra patroon. Zonder het veld (een ctx van een andere test) raakt de regel niets.
const config = loadConfig(readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));
const NETWERKVORMEN = echteNetwerkvormen();
const HOOFDSESSIE_EN_DEVELOPER: readonly Rol[] = ['', 'developer'];

interface Opties {
  readonly vormen?: readonly string[];
  readonly config?: typeof config;
  readonly vertrouwd?: boolean;
}

interface Uitslag {
  readonly deny: string;
  readonly ask: string;
  readonly allow: boolean;
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
    netwerkvormen: [...(opties.vormen ?? NETWERKVORMEN)],
    ...(opties.vertrouwd === true ? { runnerTrusted: true } : {}),
  };
  const decision = decide(payload, ctx);
  return { deny: decision.deny.join('\n'), ask: decision.ask.join('\n'), allow: decision.allow === true };
}

const beslis = (command: string, rol: Rol, opties?: Opties): Uitslag =>
  beslisPayload({ tool_name: 'Bash', tool_input: { command }, ...metRol(rol) }, opties);

/** De afwijkingen per rol, elk `<rol>: <probleem>`; leeg als alles klopt. */
function rolFouten(rollen: readonly Rol[], toets: (rol: Rol) => string | null): string[] {
  return rollen.flatMap((rol) => {
    const fout = toets(rol);
    return fout === null ? [] : [`${rolNaam(rol)}: ${fout}`];
  });
}

// De weigertekst uit Ontwerp punt 2, letterlijk; `<vorm>` is het patroon of de patronen met dit voorvoegsel.
const SANDBOX_TEKST =
  'buiten deze vorm draait het in de sandbox, zonder token-proxy en signeerdienst (docs/ENVIRONMENT.md, "Cloud: commit, push, PR en bewijs")';
const reden = (vorm: string): string => `Netwerkvorm: draai dit als los commando in de vorm ${vorm}; ${SANDBOX_TEKST}`;
// Gewijzigde verwachting (R-TEST-02): cloud-netwerkvorm/AC-3 zet het endpoint tussen aanhalingstekens, anders geeft gh api in de cloud HTTP 401.
const GH_DELETE = 'gh api -X DELETE "repos/{owner}/{repo}/git/refs/heads/<branch>"';
const MAIN_REDEN = 'gh api: main verwijderen of verzetten is verboden, voor elke rol';

/** Geen weigering of vraag van de regel netwerkvorm. */
const zonderNetwerkvorm = (uitslag: Uitslag): string | null =>
  `${uitslag.deny}\n${uitslag.ask}`.includes('Netwerkvorm:') ? `onterecht geweigerd: ${uitslag.deny}` : null;

/** Een deny met precies de weigertekst voor `vorm`. */
const metReden =
  (command: string, vorm: string, opties?: Opties) =>
  (rol: Rol): string | null => {
    const uitslag = beslis(command, rol, opties);
    return uitslag.deny.includes(reden(vorm))
      ? null
      : `geen deny met de vorm ${vorm} (deny: ${uitslag.deny || 'geen'})`;
  };

// ---------- AC-1 ----------

describe('cloud-netwerkvorm/AC-1 de vormen die buiten de sandbox draaien krijgen geen weigering van de regel', () => {
  test.each([
    'git commit -F msg.txt',
    'git commit',
    'git commit -m "x y"',
    'git commit -F $TMPDIR/msg.txt',
    'git push origin HEAD',
    'pnpm test:db',
  ])('cloud-netwerkvorm/AC-1 hoofdsessie en developer: geen netwerkvorm-weigering (%s)', (command) => {
    expect(rolFouten(HOOFDSESSIE_EN_DEVELOPER, (rol) => zonderNetwerkvorm(beslis(command, rol)))).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-1 controle: de echte lijst heeft de patronen en de regel is actief (anders is AC-1 leeg)', () => {
    expect(NETWERKVORMEN).toEqual(expect.arrayContaining(['git commit *', 'git push origin HEAD', 'pnpm test:db *']));
    expect(beslis('git push -u origin claude/foo', '').deny).toContain('Netwerkvorm:');
  });
});

// ---------- AC-2 ----------

describe('cloud-netwerkvorm/AC-2 een commit in een andere vorm krijgt voor elke rol een deny met de commitvorm', () => {
  test.each([
    'git commit -q -F msg.txt 2>&1 | tail -2; git log --oneline -1',
    'cd /x && git commit -F m',
    'git commit -F m > uit.txt',
    'git commit -F m 2>/dev/null',
    'git commit -F - <m',
    'git commit -F "$(cat m)"',
  ])('cloud-netwerkvorm/AC-2 deny met git commit -F <bestand> en de sandboxreden: %s', (command) => {
    expect(rolFouten(ROLLEN, metReden(command, 'git commit -F <bestand>'))).toStrictEqual([]);
  });
});

// ---------- AC-3 ----------

describe('cloud-netwerkvorm/AC-3 een push in een andere vorm krijgt voor elke rol een deny met git push origin HEAD', () => {
  test.each([
    'git push -u origin claude/foo',
    'git push origin claude/foo',
    'git push',
    'git -C /x push origin HEAD',
    '/usr/bin/git push origin HEAD',
    'GIT_TRACE=1 git push origin HEAD',
    'git push origin HEAD --force',
  ])('cloud-netwerkvorm/AC-3 deny met git push origin HEAD, ook buiten de cloud: %s', (command) => {
    expect(rolFouten(ROLLEN, metReden(command, 'git push origin HEAD'))).toStrictEqual([]);
  });

  test.each([
    'git push origin --delete feat/x',
    'git push origin :feat/x',
    'git push origin -d feat/x',
    'git push origin +:feat/x',
  ])('cloud-netwerkvorm/AC-3 een verwijderpush noemt ook de gh api-vorm: %s', (command) => {
    const fouten = rolFouten(ROLLEN, (rol) => {
      const { deny } = beslis(command, rol);
      if (!deny.includes('Netwerkvorm: draai dit als los commando in de vorm git push origin HEAD'))
        return `geen deny met de vorm git push origin HEAD (deny: ${deny || 'geen'})`;
      return deny.includes(GH_DELETE) ? null : `de reden noemt ${GH_DELETE} niet`;
    });
    expect(fouten).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-3 een push zonder verwijderoptie noemt de gh api-vorm niet', () => {
    expect(beslis('git push -u origin claude/foo', '').deny).not.toContain(GH_DELETE);
  });
});

// ---------- AC-4 ----------

describe('cloud-netwerkvorm/AC-4 gh api: alleen als los commando', () => {
  test('cloud-netwerkvorm/AC-4 gh api in een pipe: deny met gh api … voor elke rol', () => {
    expect(rolFouten(ROLLEN, metReden('gh api repos/o/r | jq .x', 'gh api …'))).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-4 gh api als los commando: geen weigering van de regel', () => {
    expect(rolFouten(ROLLEN, (rol) => zonderNetwerkvorm(beslis('gh api repos/o/r', rol)))).toStrictEqual([]);
  });
});

// ---------- AC-5 ----------

describe('cloud-netwerkvorm/AC-5 wat het voorvoegsel niet raakt, krijgt geen melding van de regel', () => {
  test.each(['git log --oneline', 'git status', 'pnpm test:unit', 'echo "git push" > notes.txt'])(
    'cloud-netwerkvorm/AC-5 geen netwerkvorm-melding voor elke rol: %s',
    (command) => {
      expect(rolFouten(ROLLEN, (rol) => zonderNetwerkvorm(beslis(command, rol)))).toStrictEqual([]);
    },
  );

  test('cloud-netwerkvorm/AC-5 controle: een commando dat het voorvoegsel wel raakt, krijgt de melding', () => {
    expect(beslis('git log --oneline; git push', '').deny).toContain('Netwerkvorm:');
    expect(beslis('echo "git push" > notes.txt; git push', '').deny).toContain('Netwerkvorm:');
  });
});

// ---------- AC-6 ----------

describe('cloud-netwerkvorm/AC-6 de regel haalt zijn patronen uit de ctx', () => {
  test('cloud-netwerkvorm/AC-6 met het extra patroon foo bar * geeft foo bar x | cat een deny met foo bar …', () => {
    const opties = { vormen: [...NETWERKVORMEN, 'foo bar *'] };
    expect(rolFouten(ROLLEN, metReden('foo bar x | cat', 'foo bar …', opties))).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-6 zonder dat patroon komt er geen melding', () => {
    expect(rolFouten(ROLLEN, (rol) => zonderNetwerkvorm(beslis('foo bar x | cat', rol)))).toStrictEqual([]);
    // Het eigen patroon in de ctx wint niet van de echte lijst en andersom: een lege lijst raakt ook git push niet.
    expect(beslis('git push -u origin claude/foo', '', { vormen: [] }).deny).not.toContain('Netwerkvorm:');
  });
});

// ---------- AC-8 en AC-9 ----------

const MCP_SCHRIJVEN = [
  'mcp__github__push_files',
  'mcp__github__create_or_update_file',
  'mcp__github__delete_file',
] as const;
const MCP_REDEN = 'Push met `git push origin HEAD` als los commando; deze route slaat lefthook over';
const mcp = (tool: string, rol: Rol, opties?: Opties): Uitslag =>
  beslisPayload({ tool_name: tool, tool_input: {}, ...metRol(rol) }, opties);

describe('cloud-netwerkvorm/AC-8 MCP-bestandsschrijftools: ask voor de hoofdsessie, deny voor een subagent', () => {
  test.each(MCP_SCHRIJVEN)('cloud-netwerkvorm/AC-8 %s: hoofdsessie ask, subagent deny, met de reden', (tool) => {
    const fouten = rolFouten(ROLLEN, (rol) => {
      const uitslag = mcp(tool, rol);
      if (rol === '') {
        if (uitslag.deny !== '') return `deny in plaats van ask: ${uitslag.deny}`;
        return uitslag.ask.includes(MCP_REDEN) ? null : `ask zonder de reden (ask: ${uitslag.ask || 'geen'})`;
      }
      return uitslag.deny.includes(MCP_REDEN) ? null : `deny zonder de reden (deny: ${uitslag.deny || 'geen'})`;
    });
    expect(fouten).toStrictEqual([]);
  });

  test.each(MCP_SCHRIJVEN)('cloud-netwerkvorm/AC-8 %s: ook met de naam in mcpLezen', (tool) => {
    const opties = { config: { ...config, mcpLezen: [...MCP_SCHRIJVEN] } };
    const fouten = rolFouten(ROLLEN, (rol) => {
      const uitslag = mcp(tool, rol, opties);
      const tekst = rol === '' ? uitslag.ask : uitslag.deny;
      const verkeerd = rol === '' ? uitslag.deny : uitslag.ask;
      if (verkeerd !== '') return `verkeerde uitslag: ${verkeerd}`;
      return tekst.includes('lefthook') && tekst.includes('git push origin HEAD')
        ? null
        : `geen weigering met git push origin HEAD en lefthook (${tekst || 'niets'})`;
    });
    expect(fouten).toStrictEqual([]);
  });
});

describe('cloud-netwerkvorm/AC-9 mcp__github__create_pull_request valt niet onder de regel', () => {
  const PR = 'mcp__github__create_pull_request';

  test('cloud-netwerkvorm/AC-9 geen lefthook-melding; decideMcp blijft: hoofdsessie ask, subagent deny, buiten mcpLezen', () => {
    const fouten = rolFouten(ROLLEN, (rol) => {
      const uitslag = mcp(PR, rol);
      const tekst = `${uitslag.deny}\n${uitslag.ask}`;
      if (tekst.includes('lefthook')) return `onterecht de lefthook-melding: ${tekst}`;
      const verwacht = rol === '' ? uitslag.ask : uitslag.deny;
      return verwacht.includes(`${PR} staat niet in mcpLezen`) ? null : `de uitkomst van decideMcp ontbreekt: ${tekst}`;
    });
    expect(fouten).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-9 met de naam in mcpLezen gaat hij door zonder melding', () => {
    const opties = { config: { ...config, mcpLezen: [PR] } };
    expect(
      rolFouten(ROLLEN, (rol) => {
        const uitslag = mcp(PR, rol, opties);
        return uitslag.deny === '' && uitslag.ask === '' ? null : `toch een melding: ${uitslag.deny}${uitslag.ask}`;
      }),
    ).toStrictEqual([]);
  });
});

// ---------- AC-12 ----------

describe('cloud-netwerkvorm/AC-12 pnpm test:db in een andere vorm wint van de automatische runner-allow', () => {
  const VERTROUWD = { vertrouwd: true };

  test.each([
    'pnpm run test:db',
    'pnpm -C x test:db | tail',
    'pnpm --filter x test:db',
    'pnpm --dir=x test:db',
    'pnpm test:db | tail',
  ])('cloud-netwerkvorm/AC-12 deny met pnpm test:db …, geen allow, ook met een vertrouwde runner: %s', (command) => {
    const fouten = rolFouten(HOOFDSESSIE_EN_DEVELOPER, (rol) => {
      const uitslag = beslis(command, rol, VERTROUWD);
      if (uitslag.allow) return 'decision.allow is true';
      return uitslag.deny.includes(reden('pnpm test:db …'))
        ? null
        : `geen deny met pnpm test:db … (deny: ${uitslag.deny || 'geen'})`;
    });
    expect(fouten).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-12 controle: het kale pnpm test:db blijft de automatische allow van de hoofdsessie', () => {
    const uitslag = beslis('pnpm test:db', '', VERTROUWD);
    expect(uitslag.deny).toBe('');
    expect(uitslag.allow).toBe(true);
  });
});

// ---------- AC-13 ----------

describe('cloud-netwerkvorm/AC-13 gh api: main verwijderen of verzetten is verboden, voor elke rol', () => {
  test('cloud-netwerkvorm/AC-13 een andere branch krijgt geen weigering van de regel of de main-regel (hoofdsessie)', () => {
    const uitslag = beslis('gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/feat/x', '');
    expect(uitslag.deny).not.toContain('Netwerkvorm:');
    expect(uitslag.deny).not.toContain('main verwijderen of verzetten');
  });

  test.each([
    'gh api -X DELETE repos/o/r/git/refs/heads/main-old',
    'gh api -X DELETE repos/o/r/git/refs/heads/feat/main',
  ])('cloud-netwerkvorm/AC-13 een branch die met main begint of eindigt is geen main: %s', (command) => {
    expect(beslis(command, '').deny).not.toContain('main verwijderen of verzetten');
  });

  test.each([
    'gh api -X DELETE repos/{owner}/{repo}/git/refs/heads/main',
    'gh api --method PATCH repos/o/r/git/refs/heads/main -f sha=abc',
    'gh api -XDELETE /repos/o/r/git/refs/heads/main/',
    'gh api -X DELETE repos/o/r/git/refs/heads%2Fmain',
    'gh api -X DELETE repos/o/r/git/refs/heads//main?x=1',
    'gh api repos/o/r/git/refs/heads/main -f sha=abc',
  ])('cloud-netwerkvorm/AC-13 deny met main verwijderen of verzetten voor elke rol: %s', (command) => {
    const fouten = rolFouten(ROLLEN, (rol) => {
      const { deny } = beslis(command, rol);
      return deny.includes(MAIN_REDEN) ? null : `geen deny met de main-reden (deny: ${deny || 'geen'})`;
    });
    expect(fouten).toStrictEqual([]);
  });

  test.each(['gh api repos/o/r/git/refs/heads/main', 'gh api --method GET repos/o/r/git/refs/heads/main'])(
    'cloud-netwerkvorm/AC-13 een GET op main krijgt de melding niet: %s',
    (command) => {
      expect(
        rolFouten(HOOFDSESSIE_EN_DEVELOPER, (rol) =>
          beslis(command, rol).deny.includes('main verwijderen of verzetten') ? 'onterecht geweigerd' : null,
        ),
      ).toStrictEqual([]);
    },
  );
});

// Leerpunt #880: `pnpm -s pr:verify …` viel buiten de sandboxuitzondering `pnpm pr:verify *` en gaf alleen "bewijs niet leesbaar".
describe('cloud-netwerkvorm leerpunt #880 pnpm -s pr:verify', () => {
  test('cloud-netwerkvorm leerpunt #880 pnpm -s pr:verify 878 --watch: deny met pnpm pr:verify … voor de hoofdsessie', () => {
    const uitslag = beslis('pnpm -s pr:verify 878 --watch', '');
    expect(uitslag.deny).toContain(reden('pnpm pr:verify …'));
  });

  test('cloud-netwerkvorm leerpunt #880 pnpm pr:verify 878 --watch: geen netwerkvorm-melding', () => {
    expect(zonderNetwerkvorm(beslis('pnpm pr:verify 878 --watch', ''))).toBeNull();
  });
});
