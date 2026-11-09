import { chmodSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { nacontrole } from '../../rails/hooks/lib/effect-hooks.mjs';
import * as snapshot from '../../rails/hooks/lib/effect-snapshot.mjs';
import * as prVerify from '../../scripts/kit/pr-verify.mjs';
import { gitIn, momentopname } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { toets, toetsHoofdsessie } from '../../rails/hooks/lib/effect.mjs';
import {
  bash,
  blok,
  commit,
  exportWaarde,
  git,
  legeBlob,
  lstatMet,
  MIN,
  nieuweDir,
  REVIEWER,
  roep,
  repoVan,
  schrijf,
  start,
  stopAgent,
  stopHoofd,
  wereld,
  type Soort,
} from './effect-sandbox-kit';

// docs/specs/rolhek-effect.md AC-11 (d), ADR 0084 punt 2: een plaatshouder van de vaste lijst SANDBOX_LEEG die niet in HEAD en
// niet in de index staat: `weg`, een leeg gewoon bestand zonder uitvoerbit (de lege blob van het objectformaat) en een
// tekenapparaat 1,3 gelden als gelijk; een overgang daartussen, in elke richting, telt niet.
//
// Een tekenapparaat kan een test niet maken (geen `mknod`). Op het niveau van de momentopname krijgt `momentopname` daarom een
// `lstat` mee (`repo.lstat`, de naam die deze tests voorschrijven): het pad bestaat als leeg bestand op schijf (zodat git het
// ongetrackt noemt) en de geïnjecteerde `lstat` meldt voor dat pad een tekenapparaat 1,3 (`lstatMet`). Alles daarboven (de
// vergelijking, `toets`, `toetsHoofdsessie`) draait met de echte code op die momentopnamen.
const LIJST = [
  '.bash_profile',
  '.bashrc',
  '.profile',
  '.zshrc',
  '.zprofile',
  '.gitconfig',
  '.gitmodules',
  '.ripgreprc',
  '.mcp.json',
  '.idea',
  '.claude/commands',
  '.claude/launch.json',
  '.claude/loop.md',
  '.claude/output-styles',
  '.claude/routines',
  '.claude/scheduled_tasks.json',
  '.claude/workflows',
  '.env',
  '.env.local',
];
const REVIEWER_WIE = { actor: 'agent-reviewer-S1', agentType: 'reviewer', commando: '', sessie: 'S1' };
const HOOFD_WIE = { actor: 'hoofd:S1', agentType: '', commando: '', sessie: 'S1' };

type Staat = 'weg' | 'leeg644' | 'leeg664' | 'apparaat';
const STATEN: Staat[] = ['weg', 'leeg644', 'leeg664', 'apparaat'];

const isSoort = (waarde: Staat | Soort): waarde is Soort =>
  waarde !== 'weg' && waarde !== 'leeg644' && waarde !== 'leeg664' && waarde !== 'apparaat';

/** Zet elk pad in de gegeven staat op schijf en maakt de momentopname (met de geïnjecteerde lstat voor `apparaat`). */
function neem(root: string, paden: readonly string[], staat: Staat | Soort) {
  for (const rel of paden) {
    rmSync(path.join(root, rel), { force: true });
    if (staat === 'weg') continue;
    schrijf(root, rel, '');
    chmodSync(path.join(root, rel), staat === 'leeg664' ? 0o664 : 0o644);
  }
  const nep: Soort | null = staat === 'apparaat' ? 'apparaat-1-3' : isSoort(staat) ? staat : null;
  const lstat = nep === null ? undefined : lstatMet(Object.fromEntries(paden.map((rel) => [rel, nep])));
  return momentopname({ root, git: gitIn(root), lstat });
}

const nieuweRels = (uit: { nieuw: { rel: string | null }[] }): (string | null)[] =>
  uit.nieuw.map((o) => o.rel).toSorted();
const paar = (voor: ReturnType<typeof neem>, na: ReturnType<typeof neem>) => ({ voor, na, start: 0 });

describe('rolhek-effect/AC-11 (d): de vaste lijst SANDBOX_LEEG', () => {
  test('SANDBOX_LEEG staat letterlijk in effect-snapshot.mjs en bevat precies de 19 paden uit de spec', () => {
    const lijst = exportWaarde(snapshot, 'SANDBOX_LEEG');
    const paden = lijst instanceof Set ? [...lijst] : Array.isArray(lijst) ? lijst : [];
    expect(paden.toSorted()).toStrictEqual(LIJST.toSorted());
  });
});

describe('rolhek-effect/AC-11 (d): een overgang tussen weg, leeg bestand en tekenapparaat 1,3 telt niet (toets, reviewer)', () => {
  const overgangen = STATEN.flatMap((van) =>
    STATEN.filter((naar) => naar !== van).map((naar): [Staat, Staat] => [van, naar]),
  );

  test.each(overgangen)(
    '%s naar %s op alle 19 paden: geen overtreding',
    (van, naar) => {
      const { a } = wereld();
      const voor = neem(a, LIJST, van);
      const na = neem(a, LIJST, naar);
      expect(nieuweRels(toets(repoVan(a), paar(voor, na), REVIEWER_WIE))).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'in een repository met objectformaat sha256 is de lege blob de sha256-variant: weg naar leeg telt niet',
    () => {
      const { a } = wereld('sha256');
      expect(legeBlob(a)).toHaveLength(64);
      const voor = neem(a, LIJST, 'weg');
      const na = neem(a, LIJST, 'leeg644');
      expect(nieuweRels(toets(repoVan(a), paar(voor, na), REVIEWER_WIE))).toStrictEqual([]);
    },
    MIN,
  );
});

describe('rolhek-effect/AC-11 (d): hetzelfde in toetsHoofdsessie (schaduw en aan)', () => {
  // `.claude/commands` valt onder `.claude/**` (voorReview): daar krijgt de hoofdsessie nu wel een beslissing.
  const PAD = ['.claude/commands'];
  const overgangen: [Staat, Staat][] = [
    ['weg', 'leeg644'],
    ['leeg644', 'weg'],
    ['weg', 'leeg664'],
    ['weg', 'apparaat'],
    ['apparaat', 'weg'],
    ['leeg644', 'apparaat'],
    ['apparaat', 'leeg664'],
  ];

  test.each(overgangen)(
    '%s naar %s: geen overtreding voor de hoofdsessie',
    (van, naar) => {
      const { a } = wereld();
      const voor = neem(a, PAD, van);
      const na = neem(a, PAD, naar);
      expect(nieuweRels(toetsHoofdsessie(repoVan(a), { voor, na }, HOOFD_WIE))).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'tegenproef: een .claude/commands met inhoud telt wel voor de hoofdsessie (de lijst maakt geen pad vrij)',
    () => {
      const { a } = wereld();
      const voor = neem(a, PAD, 'weg');
      schrijf(a, '.claude/commands', 'inhoud\n');
      const na = momentopname({ root: a, git: gitIn(a) });
      expect(nieuweRels(toetsHoofdsessie(repoVan(a), { voor, na }, HOOFD_WIE))).toStrictEqual(PAD);
    },
    MIN,
  );
});

describe('rolhek-effect/AC-11 (d): wat wel telt (zoals nu)', () => {
  const REL = '.bashrc';
  const andere: [string, (a: string) => void, string][] = [
    [
      'inhoud in de plaatshouder',
      (a) => {
        schrijf(a, REL, 'export X=1\n');
      },
      REL,
    ],
    [
      'een uitvoerbit op een leeg bestand',
      (a) => {
        schrijf(a, REL, '');
        chmodSync(path.join(a, REL), 0o755);
      },
      REL,
    ],
    [
      'een symlink',
      (a) => {
        symlinkSync('doel', path.join(a, REL));
      },
      REL,
    ],
    [
      'een leeg bestand buiten de lijst (rails/leeg.mjs)',
      (a) => {
        schrijf(a, 'rails/leeg.mjs', '');
      },
      'rails/leeg.mjs',
    ],
    [
      'een leeg bestand buiten de lijst (src/leeg.ts)',
      (a) => {
        schrijf(a, 'src/leeg.ts', '');
      },
      'src/leeg.ts',
    ],
  ];

  test.each(andere)(
    '%s: telt wel (weg naar dit)',
    (_naam, maak, rel) => {
      const { a } = wereld();
      const voor = neem(a, [REL], 'weg');
      maak(a);
      const na = momentopname({ root: a, git: gitIn(a) });
      expect(nieuweRels(toets(repoVan(a), paar(voor, na), REVIEWER_WIE))).toContain(rel);
    },
    MIN,
  );

  test.each<[string, Soort]>([
    ['een map (de lstat meldt een map)', 'map'],
    ['een ander apparaat, tekenapparaat 1,5', 'apparaat-1-5'],
    ['een tekenapparaat met major 5, minor 3', 'apparaat-5-3'],
  ])(
    '%s: telt wel (weg naar dit)',
    (_naam, soort) => {
      const { a } = wereld();
      const voor = neem(a, [REL], 'weg');
      const na = neem(a, [REL], soort);
      expect(nieuweRels(toets(repoVan(a), paar(voor, na), REVIEWER_WIE))).toContain(REL);
    },
    MIN,
  );

  test(
    'het leeg worden van een getrackt .gitmodules met inhoud telt wel (getrackt pad)',
    () => {
      const { a } = wereld();
      commit(a, { '.gitmodules': '[submodule "x"]\n\tpath = x\n' });
      const voor = momentopname({ root: a, git: gitIn(a) });
      schrijf(a, '.gitmodules', '');
      const na = momentopname({ root: a, git: gitIn(a) });
      expect(nieuweRels(toets(repoVan(a), paar(voor, na), REVIEWER_WIE))).toContain('.gitmodules');
    },
    MIN,
  );

  test(
    'het verwijderen van een getrackt (leeg) .bashrc telt wel: weg is hier geen plaatshouder',
    () => {
      const { a } = wereld();
      commit(a, { '.bashrc': '' });
      const voor = momentopname({ root: a, git: gitIn(a) });
      rmSync(path.join(a, '.bashrc'));
      const na = momentopname({ root: a, git: gitIn(a) });
      expect(nieuweRels(toets(repoVan(a), paar(voor, na), REVIEWER_WIE))).toContain('.bashrc');
    },
    MIN,
  );
});

describe('rolhek-effect/AC-11 (d): in de hooks als proces (reviewer: SubagentStart, een Bash-commando, SubagentStop, Stop)', () => {
  const maakLeeg = (a: string, rel: string, mode: number) => () => {
    schrijf(a, rel, '');
    chmodSync(path.join(a, rel), mode);
  };

  test.each<[string, string, number]>([
    ['een leeg .bashrc met mode 100644', '.bashrc', 0o644],
    ['een leeg .bashrc met mode 100664', '.bashrc', 0o664],
    ['een leeg .claude/commands', '.claude/commands', 0o644],
  ])(
    '%s in het commando van de reviewer: geen overtreding',
    (_naam, rel, mode) => {
      const { a } = wereld();
      start(a, REVIEWER);
      const uit = bash(a, REVIEWER, { command: `: > ${rel}`, doe: maakLeeg(a, rel, mode) });
      expect(blok(uit)).toBe('');
      expect(blok(stopAgent(a, REVIEWER))).toBe('');
      expect(blok(stopHoofd(a, 'S1'))).toBe('');
    },
    MIN,
  );

  test(
    'een plaatshouder die na SubagentStop verdwijnt of verschijnt telt niet (Stop van de hoofdsessie)',
    () => {
      const { a } = wereld();
      maakLeeg(a, '.bashrc', 0o644)();
      start(a, REVIEWER);
      expect(blok(stopAgent(a, REVIEWER))).toBe('');
      rmSync(path.join(a, '.bashrc'));
      maakLeeg(a, '.mcp.json', 0o644)();
      expect(blok(stopHoofd(a, 'S1'))).toBe('');
    },
    MIN,
  );

  test.each<[string, string, () => string]>([
    ['inhoud in .bashrc', '.bashrc', () => 'printf x > .bashrc'],
    ['een uitvoerbit op een leeg .bashrc', '.bashrc', () => ': > .bashrc && chmod +x .bashrc'],
    ['een leeg rails/leeg.mjs', 'rails/leeg.mjs', () => ': > rails/leeg.mjs'],
  ])(
    '%s: wel een overtreding',
    (naam, rel, command) => {
      const { a } = wereld();
      start(a, REVIEWER);
      const uit = bash(a, REVIEWER, {
        command: command(),
        doe: () => {
          if (naam.startsWith('inhoud')) schrijf(a, rel, 'x');
          else maakLeeg(a, rel, naam.includes('uitvoerbit') ? 0o755 : 0o644)();
        },
      });
      expect(blok(uit)).toContain(rel);
    },
    MIN,
  );

  test(
    'een getrackt .gitmodules dat leeg wordt: wel een overtreding',
    () => {
      const { a } = wereld();
      commit(a, { '.gitmodules': '[submodule "x"]\n' });
      start(a, REVIEWER);
      const uit = bash(a, REVIEWER, {
        command: ': > .gitmodules',
        doe: () => {
          schrijf(a, '.gitmodules', '');
        },
      });
      expect(blok(uit)).toContain('.gitmodules');
      expect(git(a, 'status', '--porcelain')).toContain('.gitmodules');
    },
    MIN,
  );
});

// docs/specs/rolhek-effect.md AC-12 (leerpunt #642, OV-6): `.env` en `.env.local` staan letterlijk op SANDBOX_LEEG. Elk hookgeval
// draait in een repository met de `.gitignore`-regels van de template en een getrackt bestand in `config/`; de hooks als proces
// (SubagentStart, een Bash-commando met PreToolUse en PostToolUse, SubagentStop), daarna `nacontrole` zoals `pr:verify` haar aanroept.
const TEMPLATE_IGNORE = 'node_modules/\n.env\n.env.*\n!.env.example\n';

function templateWereld(): string {
  const { a } = wereld();
  commit(a, { '.gitignore': TEMPLATE_IGNORE, 'config/app.ts': 'export {};\n', '.env.example': 'A=\n' });
  git(a, 'push', '-q', 'origin', 'main');
  return a;
}

const leegMet = (a: string, rel: string, mode = 0o644): void => {
  schrijf(a, rel, '');
  chmodSync(path.join(a, rel), mode);
};

/** Eén commando van de reviewer; de uitvoer van PostToolUse als blokkade ('' als er geen is). */
const doeAlsReviewer = (a: string, command: string, doe: () => void): string =>
  blok(bash(a, REVIEWER, { command, doe }));
const openRels = (a: string): (string | null)[] =>
  nacontrole({ ...repoVan(a), alleenLezen: true }, null).map((o) => o.rel);

describe('rolhek-effect/AC-12: een leeg .env of .env.local telt niet (hooks als proces, groen)', () => {
  test.each<[string, string, number]>([
    ['.env', '100644', 0o644],
    ['.env', '100664', 0o664],
    ['.env.local', '100644', 0o644],
    ['.env.local', '100664', 0o664],
  ])(
    '(g1, g2) een leeg %s (mode %s) verschijnt en verdwijnt weer: geen overtreding',
    (rel, _label, mode) => {
      const a = templateWereld();
      start(a, REVIEWER);
      expect(
        doeAlsReviewer(a, `: > ${rel}`, () => {
          leegMet(a, rel, mode);
        }),
      ).toBe('');
      expect(
        doeAlsReviewer(a, `rm ${rel}`, () => {
          rmSync(path.join(a, rel));
        }),
      ).toBe('');
      expect(blok(stopAgent(a, REVIEWER))).toBe('');
      expect(openRels(a)).toStrictEqual([]);
    },
    MIN,
  );

  test.each<[string, Staat, Staat]>([
    ['.env', 'apparaat', 'leeg644'],
    ['.env', 'leeg644', 'apparaat'],
    ['.env', 'apparaat', 'weg'],
    ['.env', 'weg', 'apparaat'],
    ['.env.local', 'apparaat', 'leeg664'],
    ['.env.local', 'apparaat', 'weg'],
  ])(
    '(g3) %s van %s naar %s, zonder set afgeschermde paden: geen overtreding',
    (rel, van, naar) => {
      const a = templateWereld();
      const voor = neem(a, [rel], van);
      const na = neem(a, [rel], naar);
      expect(nieuweRels(toets(repoVan(a), paar(voor, na), REVIEWER_WIE))).toStrictEqual([]);
    },
    MIN,
  );
});

describe('rolhek-effect/AC-12: wat wel telt rond .env (hooks als proces, rood)', () => {
  const vul = (a: string, rel: string): void => {
    schrijf(a, rel, 'A=1\n');
  };
  const weg = (a: string, rel: string): void => {
    rmSync(path.join(a, rel), { recursive: true, force: true });
  };

  /** `rel` moet in de overtreding staan; `vooraf` gebeurt vóór SubagentStart, `doe` is wat `command` in de werkmap doet. */
  type Geval = { naam: string; rel: string; vooraf?: (a: string) => void; command: string; doe: (a: string) => void };
  const gevallen: Geval[] = [
    {
      naam: '(r1) .env met inhoud',
      rel: '.env',
      command: 'echo A=1 > .env',
      doe: (a) => {
        vul(a, '.env');
      },
    },
    {
      naam: '(r2) een nieuw .env.local met inhoud',
      rel: '.env.local',
      command: 'echo A=1 > .env.local',
      doe: (a) => {
        vul(a, '.env.local');
      },
    },
    ...['.env', '.env.local'].map((rel) => ({
      naam: `(r3) een gevuld ${rel} dat verwijderd wordt`,
      rel,
      vooraf: (a: string) => {
        vul(a, rel);
      },
      command: `rm ${rel}`,
      doe: (a: string) => {
        weg(a, rel);
      },
    })),
    {
      naam: '(r4) een gevuld .env dat leeg wordt',
      rel: '.env',
      vooraf: (a) => {
        vul(a, '.env');
      },
      command: ': > .env',
      doe: (a) => {
        leegMet(a, '.env');
      },
    },
    {
      naam: '(r5) een leeg .env met uitvoerbit',
      rel: '.env',
      command: ': > .env && chmod +x .env',
      doe: (a) => {
        leegMet(a, '.env', 0o755);
      },
    },
    {
      naam: '(r6) een symlink .env naar een leeg bestand',
      rel: '.env',
      command: 'ln -s "$doel/leeg" .env',
      doe: (a) => {
        const map = nieuweDir('doel');
        schrijf(map, 'leeg', '');
        symlinkSync(path.join(map, 'leeg'), path.join(a, '.env'));
      },
    },
    {
      naam: '(r8) een leeg .env.local dat in de index staat en verschijnt',
      rel: '.env.local',
      vooraf: (a) => {
        leegMet(a, '.env.local');
        git(a, 'add', '-f', '.env.local');
        rmSync(path.join(a, '.env.local'));
      },
      command: ': > .env.local',
      doe: (a) => {
        leegMet(a, '.env.local');
      },
    },
    {
      naam: '(r8) een getrackt .env.local dat leeg wordt',
      rel: '.env.local',
      vooraf: (a) => {
        vul(a, '.env.local');
        git(a, 'add', '-f', '.env.local');
      },
      command: ': > .env.local',
      doe: (a) => {
        leegMet(a, '.env.local');
      },
    },
    {
      // De index verandert in het commando niet (git rm --cached gebeurt vooraf): alleen `inHead` maakt dit een overtreding.
      naam: '(r9) een leeg .env in HEAD, na git rm --cached niet in de index, verdwijnt (leeg naar weg)',
      rel: '.env',
      vooraf: (a) => {
        leegMet(a, '.env');
        git(a, 'add', '-f', '.env');
        git(a, 'commit', '-qm', 'leeg .env in HEAD');
        git(a, 'rm', '-q', '--cached', '.env');
      },
      command: 'rm .env',
      doe: (a) => {
        weg(a, '.env');
      },
    },
    ...[
      ['(r10) een leeg .env.production', '.env.production'],
      ['(r11) een leeg .env.example (getrackt)', '.env.example'],
      ['(r12) een leeg config/.env', 'config/.env'],
      ['(r13) een leeg x.env (buiten de lijst)', 'x.env'],
    ].map(([naam = '', rel = '']) => ({
      naam,
      rel,
      command: `: > ${rel}`,
      doe: (a: string) => {
        leegMet(a, rel);
      },
    })),
  ];

  test.each(gevallen)(
    '$naam: wel een overtreding',
    ({ rel, vooraf, command, doe }) => {
      const a = templateWereld();
      vooraf?.(a);
      start(a, REVIEWER);
      expect(
        doeAlsReviewer(a, command, () => {
          doe(a);
        }),
      ).toContain(rel);
      stopAgent(a, REVIEWER);
      expect(openRels(a)).toContain(rel);
    },
    MIN,
  );

  // Een nieuwe genegeerde map staat in de momentopname alleen als één regel (`genegeerd`), niet in `paden`; daarom blijft de
  // overtreding na PostToolUse niet op de open lijst (bestaand gedrag, los van AC-12, leerpunt #649). Deze test toetst de
  // overtreding zelf, zoals de spec (r7) vraagt.
  test(
    '(r7) een map .env/: wel een overtreding bij PostToolUse',
    () => {
      const a = templateWereld();
      start(a, REVIEWER);
      const uit = doeAlsReviewer(a, 'mkdir .env && : > .env/leeg', () => {
        mkdirSync(path.join(a, '.env'));
        schrijf(a, '.env/leeg', '');
      });
      expect(uit).toContain('.env/');
    },
    MIN,
  );

  test(
    "(r14) in twee commando's van weg naar gevuld en dan naar leeg: na het tweede staat de overtreding nog op de lijst",
    () => {
      const a = templateWereld();
      start(a, REVIEWER);
      expect(
        doeAlsReviewer(a, 'echo A=1 > .env', () => {
          vul(a, '.env');
        }),
      ).toContain('.env');
      doeAlsReviewer(a, ': > .env', () => {
        leegMet(a, '.env');
      });
      stopAgent(a, REVIEWER);
      expect(openRels(a)).toContain('.env');
    },
    MIN,
  );
});

describe('rolhek-effect/AC-12: geen verschil tussen twee momentopnamen', () => {
  test.each<[string, (a: string) => void]>([
    [
      'leeg ervoor en erna',
      (a) => {
        leegMet(a, '.env');
      },
    ],
    ['weg ervoor, leeg erna', () => undefined],
  ])(
    '.env %s, met inhoud tussendoor in hetzelfde commando: geen overtreding',
    (_naam, vooraf) => {
      const a = templateWereld();
      vooraf(a);
      start(a, REVIEWER);
      const uit = doeAlsReviewer(a, 'echo A=1 > .env && : > .env', () => {
        schrijf(a, '.env', 'A=1\n');
        leegMet(a, '.env');
      });
      expect(uit).toBe('');
      stopAgent(a, REVIEWER);
      expect(openRels(a)).toStrictEqual([]);
    },
    MIN,
  );
});

describe('rolhek-effect/AC-12: werkmapcontrole (verifyWorktree)', () => {
  const werkmap = (a: string) => ({ root: a, base: 'origin/main' });

  /** Een repository die `.env` niet negeert. */
  function zonderEnvRegels(): string {
    const { a } = wereld();
    commit(a, { '.gitignore': 'node_modules/\n' });
    git(a, 'push', '-q', 'origin', 'main');
    return a;
  }

  test.each(['.env', '.env.local'])(
    'zonder .env-regels in .gitignore: een ongetrackt leeg %s blokkeert niet',
    (rel) => {
      const a = zonderEnvRegels();
      leegMet(a, rel);
      expect(() => roep(prVerify, 'verifyWorktree', werkmap(a))).not.toThrow();
    },
    MIN,
  );

  test(
    'zonder .env-regels in .gitignore: een .env met inhoud blokkeert wel',
    () => {
      const a = zonderEnvRegels();
      schrijf(a, '.env', 'A=1\n');
      expect(() => roep(prVerify, 'verifyWorktree', werkmap(a))).toThrow('.env');
    },
    MIN,
  );

  test(
    'met de regels van de template ziet verifyWorktree een leeg of gevuld .env en .env.local niet',
    () => {
      const a = templateWereld();
      leegMet(a, '.env');
      schrijf(a, '.env.local', 'A=1\n');
      expect(() => roep(prVerify, 'verifyWorktree', werkmap(a))).not.toThrow();
    },
    MIN,
  );
});
