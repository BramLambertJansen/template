import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  closeSync,
  constants,
  fstatSync,
  openSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';

// bijhalen (docs/template/specs/bijhalen.md): `main` zet een merge met origin/main in de index en MERGE_HEAD, `volg <ref>`
// zet de branch met een fast-forward op een opvolger en `terug` breekt die merge af, zonder beschermde paden te schrijven.
// AC-1 t/m AC-3 toetsen de pure functies met een geïnjecteerde `schrijfbaar` en `io`; AC-4 t/m AC-12 draaien het script als
// subproces in een echte git-fixture (lokale ref refs/remotes/origin/main, zonder ondertekening of hooks). In de fixture
// zijn de beschermde paden schrijfbaar, dus de tests toetsen dat het script ze niet aanraakt. De module wordt dynamisch
// geladen, zodat een ontbrekende export een falende assertie is en geen importfout.
const REPO = path.join(import.meta.dirname, '../..');
const SCRIPT = path.join(REPO, 'scripts/kit/bijhalen.mjs');
const MODULE = '../../scripts/kit/bijhalen.mjs';
// Een ontbrekende module wordt null, zodat elke test op een assertie faalt en niet op het laden.
const mod: unknown = await import(MODULE).catch((): unknown => null);

const GEBRUIK = 'Gebruik: node scripts/kit/bijhalen.mjs main | volg <ref> | terug';
const SKILL = '.claude/skills/s/SKILL.md';
const MELDING = {
  vuil: '✗ bijhalen geweigerd: werkmap of index heeft wijzigingen; commit of herstel die eerst',
  lopendeMerge:
    '✗ bijhalen geweigerd: er loopt al een merge (MERGE_HEAD); rond die af met git commit -F <bestand> of breek af met bijhalen.mjs terug',
  losseHead: '✗ bijhalen geweigerd: HEAD staat niet op een branch',
  geenCommit: (ref: string) => `✗ bijhalen geweigerd: ${ref} is geen commit`,
  geenOpvolger: (ref: string) => `✗ bijhalen geweigerd: ${ref} is geen opvolger van HEAD; gebruik bijhalen.mjs main`,
  achterloop: '✗ bijhalen geweigerd: HEAD loopt alleen achter op origin/main; gebruik bijhalen.mjs volg origin/main',
  ongetrackt: '✗ bijhalen geweigerd: ongetrackte bestanden zouden overschreven worden:',
  geenMerge: '✗ bijhalen geweigerd: er loopt geen merge; niets terug te zetten',
  gewijzigd: '✗ bijhalen geweigerd: deze bestanden zijn na bijhalen gewijzigd; commit, herstel of bewaar ze eerst:',
  symlink: '✗ bijhalen geweigerd: symlink of submodule op een gewijzigd pad:',
  conflict: '✗ bijhalen: conflict in 1 bestand(en); er is niets veranderd:',
  mergeTreeFaalt: '✗ bijhalen: git merge-tree faalt:',
  nietsBij: '✓ niets bij te halen',
  afgebroken: '✓ merge afgebroken; index en schrijfbare bestanden staan weer op HEAD',
  blokKop: 'Beschermd, bijwerken met Edit (eigenaarakkoord)',
};

type Uitkomst<T> = { ok: true; waarde: T } | { ok: false; fout: string };

function veld(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'object' || raw === null) throw new Error('object verwacht');
  return Object.fromEntries(Object.entries(raw));
}

function strings(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((s): s is string => typeof s === 'string') : [];
}

function exportFn(naam: string): (...args: unknown[]) => unknown {
  const f: unknown = typeof mod === 'object' && mod !== null ? Reflect.get(mod, naam) : undefined;
  // Een assertie (geen throw): een ontbrekende export is een falende test, geen import- of typefout.
  expect(typeof f, `export ${naam}`).toBe('function');
  if (typeof f !== 'function') return () => undefined;
  return (...args) => {
    const uit: unknown = Reflect.apply(f, mod, args);
    return uit;
  };
}

function probeer<T>(f: () => T): Uitkomst<T> {
  try {
    return { ok: true, waarde: f() };
  } catch (fout) {
    return { ok: false, fout: fout instanceof Error ? fout.message : String(fout) };
  }
}

describe('bijhalen: isSandboxBeschermd en verdeelPaden', () => {
  const beschermd = (pad: string): unknown => exportFn('isSandboxBeschermd')(pad);

  test('bijhalen/AC-1: de drie prefixen en de twee exacte namen zijn beschermd, de rest niet', () => {
    const ja = [
      '.claude/skills/opleveren/SKILL.md',
      '.claude/skills/s/SKILL.md',
      '.claude/agents/tester.md',
      '.claude/hooks/pre.sh',
      '.claude/settings.json',
      '.claude/settings.local.json',
    ];
    const nee = ['.claude/rules/x.md', '.claude/settings.jsonc', '.claude/skillsx/a', 'docs/a.md'];

    expect(ja.map(beschermd)).toStrictEqual(ja.map(() => true));
    expect(nee.map(beschermd)).toStrictEqual(nee.map(() => false));
  });

  test('bijhalen/AC-1: verdeelPaden zet een niet-schrijfbaar pad bij beschermd, ook buiten de lijst', () => {
    const f = exportFn('verdeelPaden');
    const raw = veld(f(['docs/a.md', 'docs/alleen-lezen.md', SKILL], (pad: string) => pad !== 'docs/alleen-lezen.md'));

    expect(strings(raw['schrijven'])).toStrictEqual(['docs/a.md']);
    expect(strings(raw['beschermd'])).toStrictEqual(['docs/alleen-lezen.md', SKILL]);
  });

  test('bijhalen/AC-1: verdeelPaden zet een pad uit de lijst bij beschermd ook als schrijfbaar true geeft', () => {
    const raw = veld(exportFn('verdeelPaden')(['.claude/settings.json', 'docs/a.md'], () => true));

    expect(strings(raw['schrijven'])).toStrictEqual(['docs/a.md']);
    expect(strings(raw['beschermd'])).toStrictEqual(['.claude/settings.json']);
  });

  test('bijhalen/AC-1: verdeelPaden behoudt de volgorde van de invoer', () => {
    const invoer = ['docs/z.md', SKILL, 'docs/ro.md', 'docs/a.md', '.claude/settings.json', 'docs/m.md'];
    const raw = veld(exportFn('verdeelPaden')(invoer, (pad: string) => pad !== 'docs/ro.md'));

    expect(strings(raw['schrijven'])).toStrictEqual(['docs/z.md', 'docs/a.md', 'docs/m.md']);
    expect(strings(raw['beschermd'])).toStrictEqual([SKILL, 'docs/ro.md', '.claude/settings.json']);
  });
});

describe('bijhalen: bijhalenArgumenten', () => {
  const argumenten = (args: string[]): Uitkomst<unknown> => probeer(() => exportFn('bijhalenArgumenten')(args));

  test('bijhalen/AC-2: main, terug en volg met een ref zijn geldig', () => {
    expect([argumenten(['main']), argumenten(['terug']), argumenten(['volg', 'origin/x'])]).toStrictEqual([
      { ok: true, waarde: { stand: 'main' } },
      { ok: true, waarde: { stand: 'terug' } },
      { ok: true, waarde: { stand: 'volg', ref: 'origin/x' } },
    ]);
  });

  test.each([
    { naam: 'lege invoer', args: [] },
    { naam: 'een onbekende stand', args: ['onbekend'] },
    { naam: 'volg zonder ref', args: ['volg'] },
    { naam: 'een ref die met - begint', args: ['volg', '-f'] },
    { naam: 'een ref die met -- begint', args: ['volg', '--force'] },
    { naam: 'een extra argument na main', args: ['main', 'extra'] },
    { naam: 'een extra argument na terug', args: ['terug', 'extra'] },
    { naam: 'een extra argument na volg <ref>', args: ['volg', 'origin/x', 'extra'] },
  ])('bijhalen/AC-2: de gebruiksmelding bij $naam', ({ args }) => {
    expect(argumenten(args)).toStrictEqual({ ok: false, fout: GEBRUIK });
  });

  test('bijhalen/AC-2: GEBRUIK is geëxporteerd met de letterlijke tekst uit de spec', () => {
    expect(typeof mod === 'object' && mod !== null ? Reflect.get(mod, 'GEBRUIK') : undefined).toBe(GEBRUIK);
  });
});

describe('bijhalen: pasWerkmapToe', () => {
  type Staat = { inhoud: Buffer; uitvoerbaar: boolean };
  const staat = (tekst: string, uitvoerbaar: boolean): Staat => ({ inhoud: Buffer.from(tekst), uitvoerbaar });
  const stap = (pad: string, tekst: string | null, uitvoerbaar: boolean) => ({
    pad,
    inhoud: tekst === null ? null : Buffer.from(tekst),
    uitvoerbaar,
  });

  // In-memory io; `faalOp` is het pad waarvan schrijf een fout gooit (zonder iets te wijzigen).
  function geheugen(start: Record<string, Staat>, faalOp: string | null) {
    const winkel = new Map(Object.entries(start));
    const io = {
      lees: (pad: string): Staat | null => winkel.get(pad) ?? null,
      schrijf: (pad: string, inhoud: Buffer, uitvoerbaar: boolean): void => {
        if (pad === faalOp) throw new Error('schijf vol');
        winkel.set(pad, { inhoud, uitvoerbaar });
      },
      verwijder: (pad: string): void => {
        winkel.delete(pad);
      },
    };
    const toestand = (): Record<string, string> =>
      Object.fromEntries([...winkel].map(([pad, s]) => [pad, `${s.uitvoerbaar ? 'x' : '-'}:${s.inhoud.toString()}`]));
    return { io, toestand };
  }

  const start = (): Record<string, Staat> => ({ a: staat('a oud', false), c: staat('c oud', true) });

  test('bijhalen/AC-3: schrijf faalt bij de tweede stap: verwijderde en gewijzigde paden staan terug, de fout komt door', () => {
    const { io, toestand } = geheugen(start(), 'b');
    const voor = toestand();
    const stappen = [stap('c', null, false), stap('b', 'b nieuw', false), stap('a', 'a nieuw', true)];

    const uit = probeer(() => exportFn('pasWerkmapToe')(stappen, io));

    expect(uit).toStrictEqual({ ok: false, fout: 'schijf vol' });
    expect(toestand()).toStrictEqual(voor);
    expect(toestand()).toStrictEqual({ a: '-:a oud', c: 'x:c oud' });
  });

  test('bijhalen/AC-3: een eerder gewijzigd pad krijgt zijn oude inhoud en uitvoerbit terug', () => {
    const { io, toestand } = geheugen(start(), 'c');
    const stappen = [stap('a', 'a nieuw', true), stap('c', 'c nieuw', false)];

    const uit = probeer(() => exportFn('pasWerkmapToe')(stappen, io));

    expect(uit).toStrictEqual({ ok: false, fout: 'schijf vol' });
    expect(toestand()).toStrictEqual({ a: '-:a oud', c: 'x:c oud' });
  });

  test('bijhalen/AC-3: zonder fout staan alle stappen toegepast, ook modus en verwijdering', () => {
    const { io, toestand } = geheugen(start(), null);
    const stappen = [stap('c', null, false), stap('b', 'b nieuw', true), stap('a', 'a nieuw', true)];

    const uit = probeer(() => exportFn('pasWerkmapToe')(stappen, io));

    expect(uit.ok).toBe(true);
    expect(toestand()).toStrictEqual({ a: 'x:a nieuw', b: 'x:b nieuw' });
  });
});

// Git-fixtures.
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

const GIT_OMGEVING = {
  ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_'))),
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

function git(dir: string, ...args: string[]) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: GIT_OMGEVING });
}

function gitUit(dir: string, ...args: string[]): string {
  const r = git(dir, ...args);
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

type Wijziging = {
  schrijf?: Record<string, string>;
  verwijder?: string[];
  exec?: string[];
  geenExec?: string[];
  symlink?: Record<string, string>;
};
type Fix = { dir: string; tmpmap: string; base: string };
type Scen = Fix & { origin: string };

function schrijfBestand(dir: string, pad: string, inhoud: string): void {
  mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
  writeFileSync(path.join(dir, pad), inhoud);
}

function pas(dir: string, w: Wijziging): void {
  for (const [pad, inhoud] of Object.entries(w.schrijf ?? {})) schrijfBestand(dir, pad, inhoud);
  for (const pad of w.verwijder ?? []) rmSync(path.join(dir, pad));
  for (const pad of w.exec ?? []) chmodSync(path.join(dir, pad), 0o755);
  for (const pad of w.geenExec ?? []) chmodSync(path.join(dir, pad), 0o644);
  for (const [pad, doel] of Object.entries(w.symlink ?? {})) symlinkSync(doel, path.join(dir, pad));
}

const BASIS: Record<string, string> = {
  'docs/a.md': 'a oud\n',
  'docs/b.md': 'b oud\n',
  'docs/d.md': 'd\n',
  'docs/modus.sh': 'echo modus\n',
  'docs/run.sh': 'echo run\n',
  [SKILL]: 'skill oud\n',
};
const EIGEN: Wijziging = { schrijf: { 'docs/eigen.md': 'eigen\n' } };
const BEWERKING: Wijziging = {
  schrijf: { 'docs/a.md': 'a nieuw\n', 'docs/nieuw/c.md': 'c nieuw\n', [SKILL]: 'skill nieuw\n' },
  verwijder: ['docs/b.md'],
};

function commit(dir: string, bericht: string): string {
  gitUit(dir, 'add', '-A');
  gitUit(dir, 'commit', '-q', '-m', bericht);
  return gitUit(dir, 'rev-parse', 'HEAD');
}

// Schone branch `feat` op een basiscommit; docs/run.sh is uitvoerbaar.
function maakFix(): Fix {
  const dir = tmp('bh-repo-');
  gitUit(dir, 'init', '-q', '-b', 'main');
  gitUit(dir, 'config', 'commit.gpgsign', 'false');
  pas(dir, { schrijf: BASIS, exec: [] });
  chmodSync(path.join(dir, 'docs/run.sh'), 0o755);
  const base = commit(dir, 'base');
  gitUit(dir, 'switch', '-q', '-c', 'feat');
  return { dir, tmpmap: tmp('bh-tmpdir-'), base };
}

// Commit op de basis via een losse HEAD, zodat de werkmap van `feat` ongemoeid blijft.
function maakCommit(fix: Fix, w: Wijziging): string {
  gitUit(fix.dir, 'switch', '-q', '--detach', fix.base);
  pas(fix.dir, w);
  const sha = commit(fix.dir, 'wijziging');
  gitUit(fix.dir, 'switch', '-q', 'feat');
  return sha;
}

function zetOrigin(fix: Fix, sha: string): void {
  gitUit(fix.dir, 'update-ref', 'refs/remotes/origin/main', sha);
}

// `feat` met eventueel een eigen commit, en origin/main op de basis plus `origin`.
function fixScen(eigen: Wijziging | null, origin: Wijziging): Scen {
  const fix = maakFix();
  if (eigen !== null) {
    pas(fix.dir, eigen);
    commit(fix.dir, 'eigen');
  }
  const sha = maakCommit(fix, origin);
  zetOrigin(fix, sha);
  return { ...fix, origin: sha };
}

// origin/main met een andere historie (geen gemeenschappelijke voorouder).
function maakWees(fix: Fix): string {
  gitUit(fix.dir, 'switch', '-q', '--orphan', 'wees');
  schrijfBestand(fix.dir, 'wees.md', 'x\n');
  const sha = commit(fix.dir, 'wees');
  gitUit(fix.dir, 'switch', '-q', 'feat');
  gitUit(fix.dir, 'branch', '-q', '-D', 'wees');
  return sha;
}

type Uitvoer = { status: number | null; uit: string };

function draai(fix: Fix, ...args: string[]): Uitvoer {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: fix.dir,
    encoding: 'utf8',
    env: { ...GIT_OMGEVING, TMPDIR: fix.tmpmap },
  });
  return { status: r.status, uit: `${r.stdout}${r.stderr}` };
}

function leesBestand(pad: string): string | null {
  let fd: number | null = null;
  try {
    // Eén open met O_NOFOLLOW; modus en inhoud komen van dezelfde fd (geen lstat-dan-lees).
    fd = openSync(pad, constants.O_RDONLY | constants.O_NOFOLLOW);
    return `${(fstatSync(fd).mode & 0o777).toString(8)}:${readFileSync(fd).toString('hex')}`;
  } catch {
    return null;
  } finally {
    if (fd !== null) closeSync(fd);
  }
}

function readlinkOrNull(pad: string): string | null {
  try {
    return readlinkSync(pad);
  } catch {
    return null;
  }
}

function leesTekst(pad: string): string | null {
  try {
    return readFileSync(pad, 'utf8');
  } catch {
    return null;
  }
}

const OPNAME_PADS = [
  'docs/a.md',
  'docs/b.md',
  'docs/d.md',
  'docs/eigen.md',
  'docs/nieuw/c.md',
  'docs/modus.sh',
  'docs/run.sh',
  'docs/link',
  SKILL,
];

// Toestand van HEAD, refs, index, status en bestanden, om "byte voor byte gelijk" te toetsen.
function opname(fix: Fix) {
  const d = fix.dir;
  return {
    head: gitUit(d, 'rev-parse', 'HEAD'),
    refs: gitUit(d, 'for-each-ref'),
    symref: git(d, 'symbolic-ref', '-q', 'HEAD').stdout,
    index: gitUit(d, 'ls-files', '-s'),
    status: gitUit(d, 'status', '--porcelain=v1', '-z', '--untracked-files=all'),
    mergeHead: existsSync(path.join(d, '.git/MERGE_HEAD')),
    mergeMsg: existsSync(path.join(d, '.git/MERGE_MSG')),
    bestanden: Object.fromEntries(OPNAME_PADS.map((pad) => [pad, leesBestand(path.join(d, pad))])),
  };
}

function regelsNa(uit: string, kop: string): string[] {
  const regels = uit.split('\n').map((r) => r.trim());
  const i = regels.indexOf(kop);
  if (i < 0) return [];
  const rest = regels.slice(i + 1);
  const eind = rest.indexOf('');
  return eind < 0 ? rest : rest.slice(0, eind);
}

// Het blok met beschermde paden: `<pad> ← <tmp-pad>` of `<pad> verwijderen (eigenaar)`.
type BlokRegel = { pad: string; tmp: string | null };

function blok(uit: string): BlokRegel[] {
  return uit.split('\n').flatMap((regel): BlokRegel[] => {
    const nieuw = /^(.+?) ← (.+)$/.exec(regel.trim());
    if (nieuw !== null) return [{ pad: String(nieuw[1]), tmp: String(nieuw[2]) }];
    const weg = /^(.+) verwijderen \(eigenaar\)$/.exec(regel.trim());
    return weg === null ? [] : [{ pad: String(weg[1]), tmp: null }];
  });
}

function tmpPad(fix: Fix, sha: string, pad: string): string {
  return path.join(fix.tmpmap, 'bijhalen', sha, pad);
}

function weigert(fix: Fix, args: string[], melding: string): string {
  const voor = opname(fix);
  const r = draai(fix, ...args);
  expect(r.status, r.uit).toBe(1);
  expect(r.uit).toContain(melding);
  expect(opname(fix)).toStrictEqual(voor);
  return r.uit;
}

// Toestand na AC-4: `bijhalen.mjs main` is geslaagd (de assertie op de exitcode zit hier).
function naMain() {
  const fix = fixScen(EIGEN, BEWERKING);
  const headVoor = gitUit(fix.dir, 'rev-parse', 'HEAD');
  const boom = gitUit(fix.dir, 'merge-tree', '--write-tree', 'HEAD', 'origin/main').split('\n')[0] ?? '';
  const r = draai(fix, 'main');
  expect(r.status, r.uit).toBe(0);
  return { fix, headVoor, boom, uit: r.uit };
}

describe('bijhalen: main (git-fixture)', () => {
  test('bijhalen/AC-4: main zet de merge in de index en MERGE_HEAD en schrijft alleen de gewone paden', () => {
    const { fix, headVoor, boom, uit } = naMain();
    const d = fix.dir;

    expect(gitUit(d, 'rev-parse', 'HEAD')).toBe(headVoor);
    expect(gitUit(d, 'rev-parse', 'MERGE_HEAD')).toBe(fix.origin);
    expect(gitUit(d, 'write-tree')).toBe(boom);
    expect(leesTekst(path.join(d, 'docs/a.md'))).toBe('a nieuw\n');
    expect(existsSync(path.join(d, 'docs/b.md'))).toBe(false);
    expect(leesTekst(path.join(d, 'docs/nieuw/c.md'))).toBe('c nieuw\n');
    expect(leesTekst(path.join(d, 'docs/eigen.md'))).toBe('eigen\n');
    expect(leesTekst(path.join(d, SKILL))).toBe('skill oud\n');
    expect(gitUit(d, 'diff', '--name-only')).toBe(SKILL);
    expect(uit).toContain(MELDING.blokKop);
    expect(blok(uit)).toStrictEqual([{ pad: SKILL, tmp: tmpPad(fix, fix.origin, SKILL) }]);
    expect(leesTekst(tmpPad(fix, fix.origin, SKILL))).toBe('skill nieuw\n');
  });

  test('bijhalen/AC-4: main meldt de merge met de sha van origin/main en schrijft MERGE_MSG dat met Merge begint', () => {
    const { fix, uit } = naMain();

    const sha = /✓ merge staat in de index \(MERGE_HEAD ([0-9a-f]{7,40})\)/.exec(uit)?.[1] ?? '';
    expect(sha).not.toBe('');
    expect(fix.origin.startsWith(sha)).toBe(true);
    expect(leesTekst(path.join(fix.dir, '.git/MERGE_MSG'))?.startsWith('Merge ')).toBe(true);
  });

  test('bijhalen/AC-5: na het gelijkmaken van het beschermde bestand maakt git commit -F een merge-commit met twee ouders', () => {
    const { fix, headVoor, boom } = naMain();
    const d = fix.dir;
    const nieuw = leesTekst(tmpPad(fix, fix.origin, SKILL));
    expect(nieuw).not.toBeNull();
    writeFileSync(path.join(d, SKILL), nieuw ?? '');
    const bericht = path.join(fix.tmpmap, 'bericht.txt');
    writeFileSync(bericht, 'Merge origin/main\n');

    gitUit(d, 'commit', '-q', '-F', bericht);

    expect(gitUit(d, 'rev-list', '--parents', '-n1', 'HEAD').split(' ').slice(1)).toStrictEqual([headVoor, fix.origin]);
    expect(gitUit(d, 'rev-parse', 'HEAD^{tree}')).toBe(boom);
    expect(gitUit(d, 'status', '--porcelain', '--untracked-files=no')).toBe('');
    expect(existsSync(path.join(d, '.git/MERGE_HEAD'))).toBe(false);
  });
});

describe('bijhalen: conflict en merge-tree-fout (git-fixture)', () => {
  test('bijhalen/AC-6: een conflict geeft exitcode 1, noemt het pad en laat HEAD, index en werkmap byte voor byte gelijk', () => {
    const fix = fixScen({ schrijf: { 'docs/a.md': 'a eigen\n' } }, { schrijf: { 'docs/a.md': 'a main\n' } });
    const voor = opname(fix);

    const r = draai(fix, 'main');

    expect(r.status, r.uit).toBe(1);
    expect(r.uit).toContain(MELDING.conflict);
    expect(regelsNa(r.uit, MELDING.conflict)).toStrictEqual(['docs/a.md']);
    expect(opname(fix)).toStrictEqual(voor);
    expect(existsSync(path.join(fix.dir, '.git/MERGE_HEAD'))).toBe(false);
  });

  test('bijhalen/AC-6: een merge-tree-fout (andere historie) geeft de foutmelding en niet de conflictmelding', () => {
    const fix = maakFix();
    pas(fix.dir, EIGEN);
    commit(fix.dir, 'eigen');
    zetOrigin(fix, maakWees(fix));
    const voor = opname(fix);

    const r = draai(fix, 'main');

    expect(r.status, r.uit).toBe(1);
    expect(r.uit).toContain(MELDING.mergeTreeFaalt);
    expect(r.uit).toContain('er is niets veranderd');
    expect(r.uit).not.toContain('conflict in');
    expect(opname(fix)).toStrictEqual(voor);
    expect(existsSync(path.join(fix.dir, '.git/MERGE_HEAD'))).toBe(false);
  });
});

type Stand = { naam: string; args: string[]; eigen: Wijziging | null };
const STANDEN: Stand[] = [
  { naam: 'main', args: ['main'], eigen: EIGEN },
  { naam: 'volg', args: ['volg', 'origin/main'], eigen: null },
];

describe('bijhalen: controles vooraf (git-fixture)', () => {
  test.each(STANDEN)('bijhalen/AC-7: $naam met een vuile werkmap: geweigerd, niets veranderd', ({ args, eigen }) => {
    const fix = fixScen(eigen, BEWERKING);
    schrijfBestand(fix.dir, 'docs/d.md', 'lokaal\n');

    weigert(fix, args, MELDING.vuil);
  });

  test.each(STANDEN)(
    'bijhalen/AC-7: $naam met een gestagede wijziging: geweigerd, niets veranderd',
    ({ args, eigen }) => {
      const fix = fixScen(eigen, BEWERKING);
      schrijfBestand(fix.dir, 'docs/d.md', 'gestaged\n');
      gitUit(fix.dir, 'add', 'docs/d.md');

      weigert(fix, args, MELDING.vuil);
    },
  );

  test.each(STANDEN)('bijhalen/AC-7: $naam met een lopende merge: geweigerd, niets veranderd', ({ args, eigen }) => {
    const fix = fixScen(eigen, BEWERKING);
    gitUit(fix.dir, 'merge', '-q', '-s', 'ours', '--no-commit', '--no-ff', 'origin/main');
    expect(existsSync(path.join(fix.dir, '.git/MERGE_HEAD'))).toBe(true);

    weigert(fix, args, MELDING.lopendeMerge);
  });

  test.each(STANDEN)('bijhalen/AC-7: $naam met een losse HEAD: geweigerd, niets veranderd', ({ args, eigen }) => {
    const fix = fixScen(eigen, BEWERKING);
    gitUit(fix.dir, 'switch', '-q', '--detach');

    weigert(fix, args, MELDING.losseHead);
  });

  test('bijhalen/AC-7: main zonder origin/main: origin/main is geen commit', () => {
    const fix = fixScen(EIGEN, BEWERKING);
    gitUit(fix.dir, 'update-ref', '-d', 'refs/remotes/origin/main');

    weigert(fix, ['main'], MELDING.geenCommit('origin/main'));
  });

  test.each(['origin/nergens', 'HEAD^{tree}'])('bijhalen/AC-7: volg met %s dat geen commit is: geweigerd', (ref) => {
    const fix = fixScen(null, BEWERKING);

    weigert(fix, ['volg', ref], MELDING.geenCommit(ref));
  });

  test.each(STANDEN)(
    'bijhalen/AC-7: $naam met een ongetrackt bestand op een ander pad: geen vuil, bestand blijft staan',
    ({ args, eigen }) => {
      const fix = fixScen(eigen, BEWERKING);
      schrijfBestand(fix.dir, 'notities.txt', 'notitie\n');

      const r = draai(fix, ...args);

      expect(r.status, r.uit).toBe(0);
      expect(leesTekst(path.join(fix.dir, 'notities.txt'))).toBe('notitie\n');
      expect(leesTekst(path.join(fix.dir, 'docs/a.md'))).toBe('a nieuw\n');
    },
  );

  test.each(STANDEN)(
    'bijhalen/AC-8: $naam met een ongetrackt bestand op een pad dat het doel toevoegt: geweigerd, byte voor byte gelijk',
    ({ args, eigen }) => {
      const fix = fixScen(eigen, BEWERKING);
      schrijfBestand(fix.dir, 'docs/nieuw/c.md', 'lokaal\n');

      const uit = weigert(fix, args, MELDING.ongetrackt);

      expect(regelsNa(uit, MELDING.ongetrackt)).toStrictEqual(['docs/nieuw/c.md']);
      expect(leesTekst(path.join(fix.dir, 'docs/nieuw/c.md'))).toBe('lokaal\n');
    },
  );
});

describe('bijhalen: volg (git-fixture)', () => {
  test('bijhalen/AC-9: volg zet de branch en de index op de ref, schrijft de gewone paden en laat het beschermde bestand oud', () => {
    const fix = fixScen(null, BEWERKING);
    const d = fix.dir;

    const r = draai(fix, 'volg', 'origin/main');

    expect(r.status, r.uit).toBe(0);
    expect(gitUit(d, 'rev-parse', 'refs/heads/feat')).toBe(fix.origin);
    expect(gitUit(d, 'symbolic-ref', 'HEAD')).toBe('refs/heads/feat');
    expect(gitUit(d, 'write-tree')).toBe(gitUit(d, 'rev-parse', 'origin/main^{tree}'));
    expect(leesTekst(path.join(d, 'docs/a.md'))).toBe('a nieuw\n');
    expect(existsSync(path.join(d, 'docs/b.md'))).toBe(false);
    expect(leesTekst(path.join(d, 'docs/nieuw/c.md'))).toBe('c nieuw\n');
    expect(leesTekst(path.join(d, SKILL))).toBe('skill oud\n');
    expect(existsSync(path.join(d, '.git/MERGE_HEAD'))).toBe(false);
    expect(r.uit).toMatch(/✓ feat staat op [0-9a-f]{7,40}/);
    expect(blok(r.uit)).toStrictEqual([{ pad: SKILL, tmp: tmpPad(fix, fix.origin, SKILL) }]);
    expect(leesTekst(tmpPad(fix, fix.origin, SKILL))).toBe('skill nieuw\n');
  });

  test('bijhalen/AC-9: een ref gelijk aan HEAD geeft niets bij te halen en verandert niets', () => {
    const fix = fixScen(null, BEWERKING);
    const voor = opname(fix);

    const r = draai(fix, 'volg', 'HEAD');

    expect(r.status, r.uit).toBe(0);
    expect(r.uit).toContain(MELDING.nietsBij);
    expect(opname(fix)).toStrictEqual(voor);
  });

  test('bijhalen/AC-9: een ref die geen opvolger is geeft de fast-forwardmelding en verandert niets', () => {
    const fix = fixScen(EIGEN, BEWERKING);

    weigert(fix, ['volg', 'origin/main'], MELDING.geenOpvolger('origin/main'));
  });
});

describe('bijhalen: main met een voorouderrelatie (git-fixture)', () => {
  test('bijhalen/AC-10: HEAD is een voorouder van origin/main: main verwijst naar volg origin/main en verandert niets', () => {
    const fix = fixScen(null, BEWERKING);

    weigert(fix, ['main'], MELDING.achterloop);
  });

  test('bijhalen/AC-10: origin/main is een voorouder van HEAD: niets bij te halen, geen MERGE_HEAD, niets veranderd', () => {
    const fix = fixScen(EIGEN, BEWERKING);
    zetOrigin(fix, fix.base);
    const voor = opname(fix);

    const r = draai(fix, 'main');

    expect(r.status, r.uit).toBe(0);
    expect(r.uit).toContain(MELDING.nietsBij);
    expect(existsSync(path.join(fix.dir, '.git/MERGE_HEAD'))).toBe(false);
    expect(opname(fix)).toStrictEqual(voor);
  });
});

describe('bijhalen: terug (git-fixture)', () => {
  test('bijhalen/AC-11: terug zet index en gewone paden terug op HEAD, ruimt de merge op en noemt het beschermde bestand', () => {
    const { fix, headVoor } = naMain();
    const d = fix.dir;
    writeFileSync(path.join(d, SKILL), 'skill nieuw\n');

    const r = draai(fix, 'terug');

    expect(r.status, r.uit).toBe(0);
    expect(r.uit).toContain(MELDING.afgebroken);
    expect(gitUit(d, 'rev-parse', 'HEAD')).toBe(headVoor);
    expect(gitUit(d, 'write-tree')).toBe(gitUit(d, 'rev-parse', 'HEAD^{tree}'));
    expect(leesTekst(path.join(d, 'docs/a.md'))).toBe('a oud\n');
    expect(leesTekst(path.join(d, 'docs/b.md'))).toBe('b oud\n');
    expect(existsSync(path.join(d, 'docs/nieuw/c.md'))).toBe(false);
    expect(leesTekst(path.join(d, 'docs/eigen.md'))).toBe('eigen\n');
    expect(existsSync(path.join(d, '.git/MERGE_HEAD'))).toBe(false);
    expect(existsSync(path.join(d, '.git/MERGE_MSG'))).toBe(false);
    expect(blok(r.uit)).toStrictEqual([{ pad: SKILL, tmp: tmpPad(fix, headVoor, SKILL) }]);
    expect(leesTekst(tmpPad(fix, headVoor, SKILL))).toBe('skill oud\n');
  });

  test('bijhalen/AC-11: zonder lopende merge weigert terug en verandert niets', () => {
    const fix = fixScen(EIGEN, BEWERKING);

    weigert(fix, ['terug'], MELDING.geenMerge);
  });

  test('bijhalen/AC-11: een na main gewijzigd schrijfbaar pad: terug weigert met dat pad en laat bestand, index en MERGE_HEAD staan', () => {
    const { fix } = naMain();
    writeFileSync(path.join(fix.dir, 'docs/a.md'), 'a eigen werk\n');
    const voor = opname(fix);

    const r = draai(fix, 'terug');

    expect(r.status, r.uit).toBe(1);
    expect(r.uit).toContain(MELDING.gewijzigd);
    expect(regelsNa(r.uit, MELDING.gewijzigd)).toStrictEqual(['docs/a.md']);
    expect(opname(fix)).toStrictEqual(voor);
    expect(voor.mergeHead).toBe(true);
    expect(leesTekst(path.join(fix.dir, 'docs/a.md'))).toBe('a eigen werk\n');
  });
});

describe('bijhalen: modus, symlinks en tmp-submap (git-fixture)', () => {
  const MODUS: Wijziging = { exec: ['docs/modus.sh'], geenExec: ['docs/run.sh'] };

  test.each(STANDEN)(
    'bijhalen/AC-12: $naam draagt een modus-only wijziging (uitvoerbit erbij en eraf) en de werkmap wijkt niet af van de index',
    ({ args, eigen }) => {
      const fix = fixScen(eigen, MODUS);
      const d = fix.dir;

      const r = draai(fix, ...args);

      expect(r.status, r.uit).toBe(0);
      expect(statSync(path.join(d, 'docs/modus.sh')).mode & 0o111).not.toBe(0);
      expect(statSync(path.join(d, 'docs/run.sh')).mode & 0o111).toBe(0);
      expect(gitUit(d, 'ls-files', '-s', 'docs/modus.sh')).toMatch(/^100755 /);
      expect(gitUit(d, 'ls-files', '-s', 'docs/run.sh')).toMatch(/^100644 /);
      expect(gitUit(d, 'diff', '--name-only')).toBe('');
    },
  );

  test.each(STANDEN)(
    'bijhalen/AC-12: $naam met een symlink op een gewijzigd schrijfbaar pad geeft de symlinkmelding en verandert niets',
    ({ args, eigen }) => {
      const fix = fixScen(eigen, { schrijf: { 'docs/a.md': 'a nieuw\n' }, symlink: { 'docs/link': 'a.md' } });

      const uit = weigert(fix, args, MELDING.symlink);

      expect(regelsNa(uit, MELDING.symlink)).toStrictEqual(['docs/link']);
    },
  );

  test('bijhalen/AC-12: de tmp-submap van een andere doelcommit blijft staan, die van dezelfde doelcommit wordt eerst leeggemaakt', () => {
    const fix = fixScen(EIGEN, BEWERKING);
    const andere = tmpPad(fix, 'f'.repeat(40), SKILL);
    const oudStale = tmpPad(fix, fix.origin, 'stale.txt');
    const oudSkill = tmpPad(fix, fix.origin, '.claude/skills/s/OUD.md');
    const bestaand: Record<string, string> = { [andere]: 'andere run\n', [oudStale]: 'stale\n', [oudSkill]: 'oud\n' };
    for (const [pad, inhoud] of Object.entries(bestaand)) {
      mkdirSync(path.dirname(pad), { recursive: true });
      writeFileSync(pad, inhoud);
    }

    const r = draai(fix, 'main');

    expect(r.status, r.uit).toBe(0);
    expect(leesTekst(andere)).toBe('andere run\n');
    expect(existsSync(oudStale)).toBe(false);
    expect(existsSync(oudSkill)).toBe(false);
    expect(leesTekst(tmpPad(fix, fix.origin, SKILL))).toBe('skill nieuw\n');
  });
});

describe('bijhalen: extra dekking uit de bouwreview (git-fixture)', () => {
  const SYMLINK_MELDING = '✗ bijhalen geweigerd: een map op het pad is een symlink:';
  const TERUGGEZET = /✗ bijhalen: .+; alles is teruggezet/;

  test('bijhalen/AC-11: een na main gestagede eigen wijziging: terug weigert met dat pad en verandert niets', () => {
    const { fix } = naMain();
    schrijfBestand(fix.dir, 'docs/d.md', 'gestaged eigen werk\n');
    gitUit(fix.dir, 'add', 'docs/d.md');

    const uit = weigert(fix, ['terug'], MELDING.gewijzigd);

    expect(regelsNa(uit, MELDING.gewijzigd)).toStrictEqual(['docs/d.md']);
    expect(existsSync(path.join(fix.dir, '.git/MERGE_HEAD'))).toBe(true);
  });

  test.each(STANDEN)(
    'bijhalen/AC-13: $naam met een ongetrackte symlink als map op het pad: geweigerd, buiten de werkmap staat niets',
    ({ args, eigen }) => {
      const fix = fixScen(eigen, BEWERKING);
      const buiten = tmp('bh-buiten-');
      symlinkSync(buiten, path.join(fix.dir, 'docs/nieuw'));

      const uit = weigert(fix, args, SYMLINK_MELDING);

      expect(uit).toContain('docs/nieuw');
      expect(readdirSync(buiten)).toStrictEqual([]);
    },
  );

  // Faalt een stap na de werkmapbestanden, dan staat alles terug en meldt het script "alles is teruggezet".
  function teruggezet(fix: Fix, args: string[]): string {
    const voor = opname(fix);
    const r = draai(fix, ...args);
    expect(r.status, r.uit).toBe(1);
    expect(r.uit).toMatch(TERUGGEZET);
    expect(r.uit).not.toContain('at ');
    expect(opname(fix)).toStrictEqual(voor);
    return r.uit;
  }

  test.each(STANDEN)(
    'bijhalen/AC-14: $naam met .git/index.lock (stap 3 faalt): alles teruggezet',
    ({ args, eigen }) => {
      const fix = fixScen(eigen, BEWERKING);
      writeFileSync(path.join(fix.dir, '.git/index.lock'), '');

      teruggezet(fix, args);

      expect(leesTekst(path.join(fix.dir, 'docs/a.md'))).toBe('a oud\n');
    },
  );

  test('bijhalen/AC-14: volg met .git/refs/heads/feat.lock (stap 4 faalt): werkmap en index teruggezet', () => {
    const fix = fixScen(null, BEWERKING);
    writeFileSync(path.join(fix.dir, '.git/refs/heads/feat.lock'), '');

    teruggezet(fix, ['volg', 'origin/main']);

    expect(gitUit(fix.dir, 'rev-parse', 'refs/heads/feat')).toBe(fix.base);
    expect(leesTekst(path.join(fix.dir, 'docs/a.md'))).toBe('a oud\n');
  });

  test('bijhalen/AC-14: main waarvan MERGE_HEAD niet te schrijven is (stap 4 faalt): werkmap en index teruggezet', () => {
    const fix = fixScen(EIGEN, BEWERKING);
    symlinkSync('/nonexistent/map/MERGE_HEAD', path.join(fix.dir, '.git/MERGE_HEAD'));

    teruggezet(fix, ['main']);

    expect(leesBestand(path.join(fix.dir, '.git/MERGE_HEAD'))).toBeNull();
    expect(readlinkOrNull(path.join(fix.dir, '.git/MERGE_HEAD'))).toBe('/nonexistent/map/MERGE_HEAD');
    expect(leesTekst(path.join(fix.dir, 'docs/a.md'))).toBe('a oud\n');
  });

  test('bijhalen/AC-14: een schrijffout op scriptniveau (map is een genegeerd bestand): melding schrijven faalt, alles gelijk', () => {
    const fix = fixScen(EIGEN, BEWERKING);
    writeFileSync(path.join(fix.dir, '.git/info/exclude'), 'docs/nieuw\n');
    writeFileSync(path.join(fix.dir, 'docs/nieuw'), 'geen map\n');

    const uit = teruggezet(fix, ['main']);

    expect(uit).toContain('schrijven faalt');
    expect(leesTekst(path.join(fix.dir, 'docs/nieuw'))).toBe('geen map\n');
    expect(leesTekst(path.join(fix.dir, 'docs/a.md'))).toBe('a oud\n');
  });
});
