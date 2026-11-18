// Gedeelde hulpmiddelen voor de tests van spec template-release (docs/template/specs/template-release.md, AC-1 t/m AC-10); geen
// test zelf. De scripts die de developer bouwt (`scripts/kit/template-release.mjs`, `scripts/kit/template-status.mjs`) worden
// niet geïmporteerd en niet vooraf getypeerd: een ontbrekend script is een mislukte assertie met een duidelijke melding, geen
// import- of typefout. Alles draait zonder netwerk: tijdelijke git-repo's, een lokale `template`-remote en een git-schim op PATH
// dat een netwerkcommando weigert en vastlegt.
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from 'vitest';
import { onderhoudVan } from '../../rails/hooks/lib/padtabel.mjs';
import { unsafeCast } from '../../src/core/shared/unsafe-cast.ts';

export const ROOT = path.join(import.meta.dirname, '../..');
export const RELEASE_SCRIPT = path.join(ROOT, 'scripts/kit/template-release.mjs');
export const STATUS_SCRIPT = path.join(ROOT, 'scripts/kit/template-status.mjs');
export const REPOSITORY = 'acme/sjabloon';
export const ONREIKBAAR = 'file:///onbereikbaar/template.git';
export const UNRELEASED_ZIN = 'Nog niet uitgebrachte wijzigingen staan als fragment in `docs/template-changelog.d/`.';
export const VERSIE_BESTAND = 'src/core/shared/template-version.ts';
export const CHANGELOG = 'docs/template-changelog.md';
export const FRAGMENTEN = 'docs/template-changelog.d';

/** De melding waarmee `onderhoudVan` (rails/hooks/lib/padtabel.mjs) een ongeldige vorm van `onderhoud` weigert. */
export function onderhoudMelding(waarde: unknown): string {
  try {
    onderhoudVan(waarde);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return expect.fail('onderhoudVan gooit niet bij een ongeldige vorm');
}

// --- tijdelijke mappen en bestanden -------------------------------------------------------------------------------------

const dirs: string[] = [];

export function tijdelijkeMap(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), `${prefix}-`));
  dirs.push(dir);
  return dir;
}

/** Voor `afterEach`. */
export function ruimOp(): void {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
}

export function schrijf(root: string, bestanden: Record<string, string>): void {
  for (const [file, inhoud] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), inhoud);
  }
}

export function lees(root: string, file: string): string {
  return readFileSync(path.join(root, file), 'utf8');
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Alle bestanden onder `root` (zonder `.git`), relatief pad naar inhoud. */
function bestandenOnder(root: string, rel = ''): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const pad = path.join(rel, entry.name);
    if (rel === '' && entry.name === '.git') continue;
    if (entry.isDirectory()) Object.assign(uit, bestandenOnder(root, pad));
    else uit[pad] = readFileSync(path.join(root, pad), 'utf8');
  }
  return uit;
}

/** Wat een schrijfactie in `.git` zichtbaar maakt: bestandsnamen (zonder de index) en de inhoud van de kleine bestanden. */
function gitInhoud(root: string): Record<string, string> {
  const uit: Record<string, string> = {};
  const loop = (rel: string): void => {
    for (const entry of readdirSync(path.join(root, '.git', rel), { withFileTypes: true })) {
      const pad = path.join(rel, entry.name);
      if (entry.isDirectory()) loop(pad);
      else if (entry.name !== 'index' && entry.name !== 'index.lock') {
        const klein = ['HEAD', 'config', 'packed-refs', 'FETCH_HEAD'].includes(entry.name);
        uit[`.git/${pad}`] = klein ? readFileSync(path.join(root, '.git', pad), 'utf8') : '';
      }
    }
  };
  loop('');
  return uit;
}

/** De volledige toestand van een map zonder git: namen en inhoud. */
export function mapInhoud(root: string): Record<string, string> {
  return bestandenOnder(root);
}

/** De toestand van een git-werkmap (spec AC-8): refs, `git status --porcelain`, werkmapbestanden en de namen in `.git`. */
export function toestand(root: string): Record<string, unknown> {
  return {
    refs: git(root, 'for-each-ref'),
    status: git(root, 'status', '--porcelain'),
    werkmap: bestandenOnder(root),
    gitBestanden: gitInhoud(root),
  };
}

// --- het git-schim -------------------------------------------------------------------------------------------------------

export interface Schim {
  env: NodeJS.ProcessEnv;
  /** De netwerkcommando's die het script probeerde (leeg: geen). */
  netwerkPogingen: () => string[];
}

/**
 * Een `git` voor PATH die `fetch`, `pull`, `push`, `clone` en `ls-remote` weigert (exit 97) en vastlegt, en al het andere aan de
 * echte git doorgeeft. De opzet van de fixtures gebruikt de echte git, alleen het script onder test loopt via dit schim.
 */
export function maakSchim(): Schim {
  const dir = tijdelijkeMap('git-schim');
  const logbestand = path.join(dir, 'netwerk.log');
  const echt = (process.env['PATH'] ?? '')
    .split(path.delimiter)
    .map((map) => path.join(map, 'git'))
    .find((kandidaat) => existsSync(kandidaat));
  if (echt === undefined) throw new Error('git staat niet op PATH');
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  const schim = path.join(bin, 'git');
  writeFileSync(
    schim,
    [
      '#!/bin/sh',
      'for a in "$@"; do',
      '  case "$a" in',
      `    fetch|pull|push|clone|ls-remote) echo "$a" >> '${logbestand}'; echo "netwerkcommando in een alleen-lezen script: $a" >&2; exit 97;;`,
      '  esac',
      'done',
      `exec '${echt}' "$@"`,
      '',
    ].join('\n'),
  );
  chmodSync(schim, 0o755);
  const env = { ...process.env, PATH: `${bin}${path.delimiter}${process.env['PATH'] ?? ''}` };
  Reflect.deleteProperty(env, 'GITHUB_ACTIONS');
  return {
    env,
    netwerkPogingen: () => (existsSync(logbestand) ? readFileSync(logbestand, 'utf8').split('\n').filter(Boolean) : []),
  };
}

// --- een script draaien --------------------------------------------------------------------------------------------------

export interface Uitkomst {
  status: number | null;
  stdout: string;
  stderr: string;
  /** stdout en stderr samen; de spec laat open welke stroom een regel gebruikt. */
  uit: string;
}

/** Draait een script van de developer in `cwd`; een ontbrekend script is een mislukte assertie. */
export function draai(script: string, args: string[], opties: { cwd: string; env?: NodeJS.ProcessEnv }): Uitkomst {
  const naam = path.relative(ROOT, script);
  if (!existsSync(script)) return expect.fail(`${naam} bestaat niet: de developer bouwt het (spec template-release)`);
  const env = opties.env ?? { ...process.env };
  Reflect.deleteProperty(env, 'GITHUB_ACTIONS');
  const resultaat = spawnSync('node', [script, ...args], { cwd: opties.cwd, env, encoding: 'utf8' });
  return {
    status: resultaat.status,
    stdout: resultaat.stdout,
    stderr: resultaat.stderr,
    uit: `${resultaat.stdout}${resultaat.stderr}`,
  };
}

/** Importeert een script in een eigen node-proces met `cwd` als werkmap: een script dat bij importeren iets doet, wijzigt die map. */
export function importeer(script: string, cwd: string): Uitkomst {
  const naam = path.relative(ROOT, script);
  if (!existsSync(script)) return expect.fail(`${naam} bestaat niet: de developer bouwt het (spec template-release)`);
  const env = { ...process.env };
  Reflect.deleteProperty(env, 'GITHUB_ACTIONS');
  const code = `await import(${JSON.stringify(pathToFileURL(script).href)});`;
  const resultaat = spawnSync('node', ['--input-type=module', '-e', code], { cwd, env, encoding: 'utf8' });
  return {
    status: resultaat.status,
    stdout: resultaat.stdout,
    stderr: resultaat.stderr,
    uit: `${resultaat.stdout}${resultaat.stderr}`,
  };
}

/** Importeert een module van de developer; ontbreekt hij, dan krijgt elke aanroep een mislukte assertie. */
export async function laadModule<T extends object>(script: string, leeg: T): Promise<T> {
  if (existsSync(script))
    return unsafeCast<T>(await import(pathToFileURL(script).href), 'dynamische import; de vorm staat in T');
  return leeg;
}

// --- de wijzigingenlijst van de template ---------------------------------------------------------------------------------

export interface Release {
  versie: string;
  datum: string;
  notities: string[];
}

/** Een wijzigingenlijst met een leeg `[Unreleased]` en de releases, nieuwste eerst. */
export function changelogTekst(releases: readonly Release[]): string {
  const secties = releases.map(({ versie, datum, notities }) => {
    const update = notities.length === 0 ? [] : ['### Bij een update', '', ...notities.map((n) => `- ${n}`), ''];
    return [`## [${versie}] - ${datum}`, '', '### Toegevoegd', '', `- Wijziging in ${versie}.`, '', ...update];
  });
  return [
    '# Wijzigingen van de template',
    '',
    'Inleiding.',
    '',
    '## [Unreleased]',
    '',
    UNRELEASED_ZIN,
    '',
    ...secties.flat(),
  ].join('\n');
}

export function versieTekst(versie: string): string {
  return `// De versie van de template.\nexport const TEMPLATE_VERSION = '${versie}';\n`;
}

export const GATES_TEMPLATE = JSON.stringify({
  onderhoud: { repository: REPOSITORY },
  template: { repository: REPOSITORY },
});
export const GATES_APP = JSON.stringify({ template: { repository: REPOSITORY } });

// --- een fixture-template en -app met een lokale template-remote --------------------------------------------------------

export const TEMPLATE_RELEASES: readonly Release[] = [
  { versie: '0.1.0', datum: '2026-11-15', notities: [] },
  { versie: '0.2.0', datum: '2026-11-18', notities: ['OUDE-NOTITIE van 0.2.0.'] },
  { versie: '0.3.0', datum: '2026-11-25', notities: ['Voer NOTITIE-0.3.0 uit.'] },
  { versie: '0.4.0', datum: '2026-12-02', notities: [] },
];

export interface TemplateOpzet {
  /** De releases tot en met deze versie komen in de geschiedenis (oplopend). */
  totEnMet: string;
  /** Na deze release komt één templatecommit zonder release (`shas.fix`); latere releases volgen daarna. */
  fixNa?: string;
}

function commit(root: string, bericht: string): string {
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '-m', bericht);
  return git(root, 'rev-parse', 'HEAD');
}

/**
 * Een template-repo met een commit per release (`template-v<versie>` als geannoteerde tag) en eventueel een commit zonder
 * release. De wijzigingenlijst op elke commit bevat de releases tot dan toe. Geeft de sha per versie (en `fix`).
 */
export function bouwTemplate(root: string, opzet: TemplateOpzet): Record<string, string> {
  git(root, 'init', '-q', '-b', 'main');
  const shas: Record<string, string> = {};
  const tot = TEMPLATE_RELEASES.findIndex(({ versie }) => versie === opzet.totEnMet);
  TEMPLATE_RELEASES.slice(0, tot + 1).forEach((release, index) => {
    const tot_nu = TEMPLATE_RELEASES.slice(0, index + 1).toReversed();
    schrijf(root, {
      [CHANGELOG]: changelogTekst(tot_nu),
      [VERSIE_BESTAND]: versieTekst(release.versie),
      '.claude/gates.json': GATES_TEMPLATE,
    });
    shas[release.versie] = commit(root, `release ${release.versie}`);
    git(root, 'tag', '-a', '-m', `template ${release.versie}`, `template-v${release.versie}`);
    if (release.versie === opzet.fixNa) {
      schrijf(root, { 'fix.txt': 'een fix na de release\n' });
      shas['fix'] = commit(root, 'fix na de release');
    }
  });
  return shas;
}

export interface AppOpzet {
  /** De versie waarop de app staat (haar werkmap en `TEMPLATE_VERSION`). */
  versie: string;
  /** De templatecommit waarop de app gebouwd is; standaard de release van `versie`. */
  basis?: string;
  /** Releases waarvan `template-v<versie>` lokaal bestaat; standaard alle releases in de template. */
  tags?: readonly string[];
  /** Lokale `v*`-tags van de app op templatecommits: naam naar sha. De uitvoer mag ze niet gebruiken. */
  vTags?: Record<string, string>;
  /** Een extra bestand (pad naar inhoud) in de commit van de app, bijvoorbeeld een andere gates.json. */
  gates?: string;
}

/**
 * Een app: een kloon van de template op `basis`, een eigen commit die `onderhoud` uit `.claude/gates.json` haalt, de remote
 * `template` (met `refs/remotes/template/main` op de tip van de template) en alleen de gevraagde lokale tags. De URL van de
 * remote wijst naar iets onbereikbaars, zodat elke poging tot ophalen opvalt.
 */
export function bouwApp(opzet: { template: string; shas: Record<string, string>; root: string } & AppOpzet): string {
  const { template, shas, root, versie } = opzet;
  git(path.dirname(root), 'clone', '-q', '--no-tags', template, root);
  git(root, 'remote', 'rename', 'origin', 'template');
  git(root, 'checkout', '-q', '-B', 'main', opzet.basis ?? shas[versie] ?? versie);
  schrijf(root, { '.claude/gates.json': opzet.gates ?? GATES_APP });
  commit(root, 'app: gates');
  const tags = opzet.tags ?? TEMPLATE_RELEASES.map((release) => release.versie).filter((v) => shas[v] !== undefined);
  for (const tag of tags) git(root, 'tag', '-a', '-m', `template ${tag}`, `template-v${tag}`, shas[tag] ?? tag);
  for (const [naam, sha] of Object.entries(opzet.vTags ?? {})) git(root, 'tag', naam, sha);
  git(root, 'remote', 'set-url', 'template', ONREIKBAAR);
  return root;
}
