import { chmodSync, rmSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import * as snapshot from '../../rails/hooks/lib/effect-snapshot.mjs';
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
  REVIEWER,
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
];
const REVIEWER_WIE = { actor: 'agent-reviewer-S1', agentType: 'reviewer', commando: '', sessie: 'S1' };
const HOOFD_WIE = { actor: 'hoofd:S1', agentType: '', commando: '', sessie: 'S1' };

type Staat = 'weg' | 'leeg644' | 'leeg664' | 'apparaat';
const STATEN: Staat[] = ['weg', 'leeg644', 'leeg664', 'apparaat'];

/** Zet elk pad in de gegeven staat op schijf en maakt de momentopname (met de geïnjecteerde lstat voor `apparaat`). */
function neem(root: string, paden: readonly string[], staat: Staat | Soort) {
  for (const rel of paden) {
    rmSync(path.join(root, rel), { force: true });
    if (staat === 'weg') continue;
    schrijf(root, rel, '');
    chmodSync(path.join(root, rel), staat === 'leeg664' ? 0o664 : 0o644);
  }
  const nep = staat === 'apparaat' ? 'apparaat-1-3' : staat === 'weg' || staat.startsWith('leeg') ? null : staat;
  const lstat = nep === null ? undefined : lstatMet(Object.fromEntries(paden.map((rel) => [rel, nep])));
  return momentopname({ root, git: gitIn(root), lstat });
}

const nieuweRels = (uit: { nieuw: { rel: string | null }[] }): (string | null)[] =>
  uit.nieuw.map((o) => o.rel).toSorted();
const paar = (voor: ReturnType<typeof neem>, na: ReturnType<typeof neem>) => ({ voor, na, start: 0 });

describe('rolhek-effect/AC-11 (d): de vaste lijst SANDBOX_LEEG', () => {
  test('SANDBOX_LEEG staat letterlijk in effect-snapshot.mjs en bevat precies de 17 paden uit de spec', () => {
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
    '%s naar %s op alle 17 paden: geen overtreding',
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
