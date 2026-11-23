// Gedeelde hulpmiddelen voor de tests van spec schaduwmodus (docs/template/specs/schaduwmodus.md, ADR 0106); geen test zelf.
// De module die de developer bouwt (`scripts/kit/schaduw.mjs`) wordt dynamisch geladen: ontbreekt hij, dan faalt de test op
// een assertie met een duidelijke melding, niet op een importfout.
//
// De API die de tests vastleggen (scripts/kit/schaduw.mjs):
//   ALTIJD_HARD                                   geëxporteerde constante
//   registerViolations(cwd, { ci })               Violation[] (of Promise): strikt kanaal `schaduw-register`
//   termijnViolations(cwd, uitvoerders)           Promise<Violation[]>: strikt kanaal `schaduw-termijn`
//   termijnMeldingen(cwd, uitvoerders)            Promise<string[]>: regels `<naam> loopt af op …`
//   trefferMeldingen(cwd, uitvoerders)            Promise<string[]>: regels `<naam>: <treffer>`
// Uitvoerders draaien één keer per uitvoerdersmap (geheugen per proces, sleutel = het mapobject).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from 'vitest';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';

export const ROOT = path.resolve(import.meta.dirname, '../..');
export const SCHADUW_MODULE = path.join(ROOT, 'scripts/kit/schaduw.mjs');
export const RATCHET = path.join(ROOT, 'scripts/kit/ratchet.mjs');
export const SPEC = 'docs/template/specs/x.md';

export interface Violation {
  key: string;
  message: string;
}
export type Uitvoerders = Record<string, () => Promise<unknown>>;
export interface SchaduwModule {
  ALTIJD_HARD: unknown;
  registerViolations: (cwd: string, opties: { ci: boolean }) => Violation[] | Promise<Violation[]>;
  termijnViolations: (cwd: string, uitvoerders: Uitvoerders) => Promise<Violation[]>;
  termijnMeldingen: (cwd: string, uitvoerders: Uitvoerders) => Promise<string[]>;
  trefferMeldingen: (cwd: string, uitvoerders: Uitvoerders) => Promise<string[]>;
}

/** Laadt scripts/kit/schaduw.mjs; een ontbrekende module of functie is een mislukte assertie. */
export async function laad(): Promise<SchaduwModule> {
  expect(
    existsSync(SCHADUW_MODULE),
    'scripts/kit/schaduw.mjs bestaat niet: de developer bouwt het (spec schaduwmodus)',
  ).toBe(true);
  const mod = unsafeCast<Record<string, unknown>>(
    await import(pathToFileURL(SCHADUW_MODULE).href),
    'dynamische import; de vorm staat in SchaduwModule',
  );
  for (const naam of ['registerViolations', 'termijnViolations', 'termijnMeldingen', 'trefferMeldingen'])
    expect(typeof mod[naam], `schaduw.mjs exporteert ${naam} niet`).toBe('function');
  expect(mod['ALTIJD_HARD'], 'schaduw.mjs exporteert ALTIJD_HARD niet').toBeDefined();
  return unsafeCast<SchaduwModule>(mod, 'vorm gecontroleerd hierboven');
}

/** Sleutel en melding samen, voor toContain-asserties die niet vastleggen wat sleutel en wat melding is. */
export function tekst(violations: readonly Violation[]): string {
  return violations.map((violation) => `${violation.key}\n${violation.message}`).join('\n');
}

// --- registerregels ----------------------------------------------------------------------------------------------------

export type Regel = Record<string, unknown>;

export const DREMPEL = {
  hard: 'geen treffers',
  aanpassen: 'minder dan 5 treffers',
  verwijderen: 'meer dan 20 treffers',
};

/** Een geldige registerregel; `extra` overschrijft velden. */
export function controle(extra: Regel = {}): Regel {
  return {
    naam: 'proef',
    soort: 'hook',
    spec: SPEC,
    rids: ['R-WEB-01'],
    start: '2026-11-01',
    eind: '2026-11-10',
    drempel: DREMPEL,
    aangepast: 0,
    ...extra,
  };
}

/** De regel zonder één veld. */
export function zonder(regel: Regel, veld: string): Regel {
  return Object.fromEntries(Object.entries(regel).filter(([naam]) => naam !== veld));
}

// --- tijdelijke git-repo's -----------------------------------------------------------------------------------------------

const dirs: string[] = [];
/** Voor `afterEach`. */
export function ruimOp(): void {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

// De echte padtabel van de template: check-docs in de tijdelijke repo eist de vloer, goedkeurders en CODEOWNERS.
// `onderhoud` altijd erbij: na `app:init` (check:new-resource) ontbreekt het in de echte padtabel.
const GATES_ECHT: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8'));
export const GATES_TEMPLATE = JSON.stringify({
  onderhoud: { repository: 'BramLambertJansen/template' },
  ...(typeof GATES_ECHT === 'object' && GATES_ECHT !== null ? GATES_ECHT : {}),
});
export const GATES_APP = JSON.stringify({ paden: {}, template: { repository: 'acme/sjabloon' } });

export function git(cwd: string, datum: string | undefined, ...args: string[]): void {
  const env = { ...process.env, ...(datum === undefined ? {} : { GIT_COMMITTER_DATE: datum, GIT_AUTHOR_DATE: datum }) };
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, encoding: 'utf8', env });
  expect(r.status, r.stderr).toBe(0);
}

export interface Opzet {
  /** De inhoud van .claude/gates.json; standaard een template (met `onderhoud`). */
  gates?: string;
  /** Het register op HEAD: een lijst (wordt JSON), een tekst (ongeparsed) of null voor een ontbrekend bestand. */
  register?: Regel[] | string | null;
  /** Het register op de merge-base; standaard gelijk aan `register`. */
  basis?: Regel[] | string | null;
  /** De committerdatum van HEAD (ISO met tijdzone). */
  datum?: string;
  /** Geen origin/main-ref: dan is er geen merge-base. */
  zonderOrigin?: boolean;
  /** Extra bestanden (pad naar inhoud) en lege mappen in de tijdelijke repo. */
  extraBestanden?: Record<string, string>;
  extraMappen?: string[];
}

function registerTekst(register: Regel[] | string | null): string | null {
  return register === null ? null : typeof register === 'string' ? register : `${JSON.stringify(register, null, 2)}\n`;
}

function schrijfRegister(dir: string, register: Regel[] | string | null): void {
  const inhoud = registerTekst(register);
  if (inhoud === null) rmSync(path.join(dir, '.kit/schaduw.json'), { force: true });
  else writeFileSync(path.join(dir, '.kit/schaduw.json'), inhoud);
}

/**
 * Een git-repo met een basiscommit (origin/main) en daarna een commit met het register van HEAD en de gegeven committerdatum.
 * Het register staat dus zowel in de werkmap als in HEAD.
 */
export function maakRepo(opzet: Opzet = {}): string {
  const { gates = GATES_TEMPLATE, register = [], datum = '2026-11-05T12:00:00Z', zonderOrigin = false } = opzet;
  const basis = opzet.basis === undefined ? register : opzet.basis;
  const dir = mkdtempSync(path.join(tmpdir(), 'schaduw-'));
  dirs.push(dir);
  const bestanden: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    'src/leeg.ts': 'export {};\n',
    '.kit/baseline.json': '{}\n',
    '.claude/gates.json': gates,
    '.github/CODEOWNERS': readFileSync(path.join(ROOT, '.github/CODEOWNERS'), 'utf8'),
    [SPEC]: '---\nstatus: voorstel\nnamespace: x\n---\n\n# X\n',
  };
  Object.assign(bestanden, opzet.extraBestanden ?? {});
  for (const map of opzet.extraMappen ?? []) mkdirSync(path.join(dir, map), { recursive: true });
  for (const [pad, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(dir, pad)), { recursive: true });
    writeFileSync(path.join(dir, pad), inhoud);
  }
  schrijfRegister(dir, basis);
  git(dir, undefined, 'init', '-q');
  git(dir, '2026-10-01T12:00:00Z', 'add', '-A');
  git(dir, '2026-10-01T12:00:00Z', 'commit', '-qm', 'basis');
  if (!zonderOrigin) git(dir, undefined, 'update-ref', 'refs/remotes/origin/main', 'HEAD');
  schrijfRegister(dir, register);
  git(dir, datum, 'add', '-A');
  git(dir, datum, 'commit', '-q', '--allow-empty', '-m', 'head');
  return dir;
}

/** De ratchet als proces met `dir` als werkmap. */
export function ratchet(dir: string, ...args: string[]) {
  return spawnSync(process.execPath, [RATCHET, ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 60_000,
    env: { ...process.env, GITHUB_ACTIONS: '' },
  });
}
