import { spawnSync } from 'node:child_process';
import { chmodSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { nacontrole } from '../../rails/hooks/lib/effect-hooks.mjs';
import { gitIn, momentopname } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { opslag } from '../../rails/hooks/lib/effect.mjs';
import * as prVerify from '../../scripts/kit/pr-verify.mjs';
import {
  commit,
  git,
  MIN,
  procEnv,
  REVIEWER,
  repoVan,
  roep,
  schrijf,
  start,
  stopAgent,
  wereld,
} from './effect-sandbox-kit';
import { mkdirSync } from 'node:fs';

// docs/specs/rolhek-effect.md AC-11 (a), (b), (e), ADR 0084 punt 1 en 4: `pnpm pr:verify` slaat een bevestigd afgeschermd pad
// over en meldt het in één regel; de set komt alleen als functieparameter binnen. Voorgeschreven vorm (de spec noemt geen
// namen): `verifyEffect(root, afgeschermd)` met `afgeschermd` een Set met relatieve paden (standaard leeg), en
// `repo.afgeschermd` (dezelfde Set) op de `repo` van `nacontrole`/`werkLijstBij`/`toets`. De regel van (b) gaat naar de console.
const REGEL = /rolhek-effect: niet getoetst in de sandbox, wel door de hooks: /;
const LEEG_VAN_STAT = ['.bashrc', '.mcp.json', '.gitmodules', '.claude/commands', '.claude/workflows'];

afterEach(() => {
  vi.restoreAllMocks();
});

/** Alles wat `verifyEffect` naar de console schrijft, per aanroep één regel. */
function vang(): () => string[] {
  const spionnen = (['log', 'info', 'warn', 'error'] as const).map((naam) =>
    vi.spyOn(console, naam).mockImplementation(() => undefined),
  );
  return () => spionnen.flatMap((spion) => spion.mock.calls.map((aanroep) => aanroep.map(String).join(' ')));
}

/** Een reviewer eindigde met een `.env` met inhoud A; daarna wijzigt een proces zonder hook hem (de nacontrole ziet het). */
function metGewijzigdEnv(): string {
  const { a } = wereld();
  schrijf(a, '.env', 'A=1\n');
  start(a, REVIEWER);
  stopAgent(a, REVIEWER);
  schrijf(a, '.env', 'B=2\n');
  return a;
}

const metSet = (a: string, paden: string[]) => ({ ...repoVan(a), alleenLezen: true, afgeschermd: new Set(paden) });

describe('rolhek-effect/AC-11 (a): een afgeschermd pad telt niet als verandering (nacontrole zoals pr:verify haar aanroept)', () => {
  test(
    'een genegeerd .env met afwijkende inhoud, in de set van afgeschermde paden: geen overtreding',
    () => {
      const a = metGewijzigdEnv();
      expect(nacontrole(metSet(a, ['.env']), null)).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'zonder die set dezelfde overtreding als nu (regressie)',
    () => {
      const a = metGewijzigdEnv();
      expect(nacontrole({ ...repoVan(a), alleenLezen: true }, null)).toContainEqual(
        expect.objectContaining({ rel: '.env' }),
      );
    },
    MIN,
  );

  test(
    'een ander pad dan het afgeschermde blijft een overtreding (de set maakt niet alles vrij)',
    () => {
      const a = metGewijzigdEnv();
      schrijf(a, 'src/a.ts', 'veranderd\n');
      const rels = nacontrole(metSet(a, ['.env']), null).map((o) => o.rel);
      expect(rels).toContain('src/a.ts');
      expect(rels).not.toContain('.env');
    },
    MIN,
  );

  test(
    'een open overtreding op een afgeschermd pad vervalt nooit, ook niet als de staat gelijk lijkt aan die van vóór de overtreding',
    () => {
      const { a } = wereld();
      schrijf(a, '.env', '');
      start(a, REVIEWER);
      const nu = momentopname({ root: a, git: gitIn(a), alleenLezen: true });
      const voor = { wt: nu.paden['.env']?.wt ?? 'weg', idx: '' };
      const map = opslag(repoVan(a));
      mkdirSync(map, { recursive: true });
      const oud = { rel: '.env', actor: 'agent-oud', rol: 'reviewer', commando: '', reden: 'buiten je rol', voor };
      writeFileSync(path.join(map, 'overtredingen.json'), `${JSON.stringify([oud])}\n`);
      expect(nacontrole(metSet(a, ['.env']), null)).toContainEqual(expect.objectContaining({ rel: '.env' }));
    },
    MIN,
  );
});

describe('rolhek-effect/AC-11 (b): pr:verify (verifyEffect) meldt de overgeslagen paden in één regel', () => {
  test(
    'met een afgeschermd .env: geen fout en precies één regel `rolhek-effect: niet getoetst in de sandbox, wel door de hooks: .env`',
    () => {
      const a = metGewijzigdEnv();
      const regels = vang();
      expect(() => roep(prVerify, 'verifyEffect', a, new Set(['.env']))).not.toThrow();
      const gemeld = regels().filter((regel) => REGEL.test(regel));
      expect(gemeld).toHaveLength(1);
      expect(gemeld[0]).toContain('.env');
      expect(gemeld[0]).not.toContain('\n');
    },
    MIN,
  );

  test(
    'meerdere paden staan in dezelfde ene regel',
    () => {
      const a = metGewijzigdEnv();
      schrijf(a, '.bashrc', '');
      const regels = vang();
      roep(prVerify, 'verifyEffect', a, new Set(['.env', '.bashrc']));
      const gemeld = regels().filter((regel) => REGEL.test(regel));
      expect(gemeld).toHaveLength(1);
      expect(gemeld[0]).toContain('.env');
      expect(gemeld[0]).toContain('.bashrc');
    },
    MIN,
  );

  test(
    'zonder afgeschermde paden geen regel, en dezelfde overtreding als nu',
    () => {
      const a = metGewijzigdEnv();
      const regels = vang();
      expect(() => roep(prVerify, 'verifyEffect', a, new Set())).toThrow('.env');
      expect(regels().filter((regel) => REGEL.test(regel))).toStrictEqual([]);
    },
    MIN,
  );

  test(
    'een open overtreding op een afgeschermd pad vervalt niet: verifyEffect blijft falen op dat pad',
    () => {
      const { a } = wereld();
      schrijf(a, '.env', '');
      start(a, REVIEWER);
      const nu = momentopname({ root: a, git: gitIn(a), alleenLezen: true });
      const map = opslag(repoVan(a));
      mkdirSync(map, { recursive: true });
      const voor = { wt: nu.paden['.env']?.wt ?? 'weg', idx: '' };
      const oud = { rel: '.env', actor: 'agent-oud', rol: 'reviewer', commando: '', reden: 'buiten je rol', voor };
      writeFileSync(path.join(map, 'overtredingen.json'), `${JSON.stringify([oud])}\n`);
      expect(() => roep(prVerify, 'verifyEffect', a, new Set(['.env']))).toThrow('.env');
    },
    MIN,
  );
});

describe('rolhek-effect/AC-11 (a): pr:verify neemt geen set afgeschermde paden aan uit de omgeving, een CLI-vlag of een bestand', () => {
  test(
    'een extra CLI-vlag is een gebruiksfout (argumentsFor kent alleen <nummer> [--watch])',
    () => {
      const { a } = wereld();
      const result = spawnSync(
        process.execPath,
        [path.resolve('scripts/kit/pr-verify.mjs'), '1', '--afgeschermd=.env'],
        {
          cwd: a,
          encoding: 'utf8',
          env: procEnv(),
          timeout: 30_000,
        },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Gebruik: pnpm pr:verify');
    },
    MIN,
  );

  test(
    'een omgevingsvariabele of een bestand met `.env` maakt het niet tot afgeschermd: een .env met afwijkende inhoud blijft een overtreding',
    () => {
      const a = metGewijzigdEnv();
      writeFileSync(path.join(a, '.claude', 'afgeschermd.json'), '[".env"]\n');
      writeFileSync(path.join(a, 'afgeschermd'), '.env\n');
      const oud = { ...process.env };
      Object.assign(process.env, {
        ROLHEK_AFGESCHERMD: '.env',
        PR_VERIFY_AFGESCHERMD: '.env',
        AFGESCHERMD: '.env',
        PR_VERIFY_SANDBOX_PADEN: '.env',
      });
      try {
        expect(() => roep(prVerify, 'verifyEffect', a)).toThrow('.env');
      } finally {
        for (const naam of ['ROLHEK_AFGESCHERMD', 'PR_VERIFY_AFGESCHERMD', 'AFGESCHERMD', 'PR_VERIFY_SANDBOX_PADEN'])
          if (!(naam in oud)) Reflect.deleteProperty(process.env, naam);
      }
    },
    MIN,
  );

  test(
    'de hooks erkennen vorm A nooit: een Stop van de hoofdsessie ziet de gewijzigde .env als overtreding (geen set in de hookcode)',
    () => {
      const a = metGewijzigdEnv();
      const hookCode = nacontrole({ ...repoVan(a), alleenLezen: true }, null);
      expect(hookCode).toContainEqual(expect.objectContaining({ rel: '.env' }));
    },
    MIN,
  );
});

describe('rolhek-effect/AC-11 (e): verifyWorktree blokkeert niet op een ongetrackt leeg SANDBOX_LEEG-pad', () => {
  const werkmap = (a: string) => ({ root: a, base: 'origin/main' });
  const leeg = (a: string, rel: string, mode: number): void => {
    schrijf(a, rel, '');
    chmodSync(path.join(a, rel), mode);
  };

  test.each([
    ['.bashrc (100644)', '.bashrc', 0o644],
    ['.bashrc (100664)', '.bashrc', 0o664],
    ['.mcp.json', '.mcp.json', 0o644],
    ['.gitmodules (ongetrackt)', '.gitmodules', 0o644],
    ['.claude/commands', '.claude/commands', 0o644],
    ['.claude/output-styles als leeg bestand (de map staat al in werkmapNegeer)', '.claude/output-styles', 0o644],
  ])(
    'een ongetrackt leeg %s blokkeert niet',
    (_naam, rel, mode) => {
      const { a } = wereld();
      leeg(a, rel, mode);
      expect(() => roep(prVerify, 'verifyWorktree', werkmap(a))).not.toThrow();
    },
    MIN,
  );

  test(
    'alle paden uit de voorbeeldlijst tegelijk, leeg, blokkeren niet',
    () => {
      const { a } = wereld();
      for (const rel of LEEG_VAN_STAT) leeg(a, rel, 0o644);
      expect(() => roep(prVerify, 'verifyWorktree', werkmap(a))).not.toThrow();
    },
    MIN,
  );

  test(
    'in een repository met objectformaat sha256 blokkeert een ongetrackt leeg .bashrc ook niet',
    () => {
      const { a } = wereld('sha256');
      leeg(a, '.bashrc', 0o644);
      expect(() => roep(prVerify, 'verifyWorktree', werkmap(a))).not.toThrow();
    },
    MIN,
  );

  const blokkades: [string, string, (a: string) => void][] = [
    [
      '.bashrc met inhoud',
      '.bashrc',
      (a) => {
        schrijf(a, '.bashrc', 'export X=1\n');
      },
    ],
    [
      'een leeg rails/leeg.mjs (buiten de lijst)',
      'rails/leeg.mjs',
      (a) => {
        leeg(a, 'rails/leeg.mjs', 0o644);
      },
    ],
    [
      'een leeg bestand .claude/output-styles met uitvoerbit',
      '.claude/output-styles',
      (a) => {
        leeg(a, '.claude/output-styles', 0o755);
      },
    ],
    [
      'een leeg .bashrc met uitvoerbit',
      '.bashrc',
      (a) => {
        leeg(a, '.bashrc', 0o755);
      },
    ],
    [
      'een gestagede wijziging: een leeg .bashrc dat met git add is gestaged',
      '.bashrc',
      (a) => {
        leeg(a, '.bashrc', 0o644);
        git(a, 'add', '.bashrc');
      },
    ],
    [
      'een getrackt .gitmodules dat leeg wordt',
      '.gitmodules',
      (a) => {
        commit(a, { '.gitmodules': '[submodule "x"]\n' });
        schrijf(a, '.gitmodules', '');
      },
    ],
  ];

  test.each(blokkades)(
    '%s: blokkeert wel',
    (_naam, rel, maak) => {
      const { a } = wereld();
      maak(a);
      expect(() => roep(prVerify, 'verifyWorktree', werkmap(a))).toThrow(rel);
    },
    MIN,
  );

  test(
    'een leeg .bashrc naast een echte wijziging: de fout noemt de wijziging en niet het .bashrc',
    () => {
      const { a } = wereld();
      leeg(a, '.bashrc', 0o644);
      schrijf(a, 'src/nieuw.ts', 'x\n');
      let melding = '';
      try {
        roep(prVerify, 'verifyWorktree', werkmap(a));
      } catch (error) {
        melding = error instanceof Error ? error.message : String(error);
      }
      expect(melding).toContain('src/nieuw.ts');
      expect(melding).not.toContain('.bashrc');
    },
    MIN,
  );
});
