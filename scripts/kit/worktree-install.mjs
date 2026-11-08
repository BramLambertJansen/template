// Installeert de dependencies in een gekoppelde worktree (ADR 0085, spec claude-sandbox-werkstraat AC-10):
// `pnpm install --frozen-lockfile` met store (`--store-dir`), cache en state (XDG_*) onder os.tmpdir(), zodat het binnen de Claude Code-sandbox
// slaagt zonder globale pnpm-map. Weigert in de hoofdcheckout, bij een symlink als node_modules en bij wijzigingen ten
// opzichte van HEAD in de beheerde bestanden. Een bestaande map node_modules (ook leeg of half) wordt gewoon afgemaakt:
// een frozen install is idempotent. Zonder dependencies, zodat het op een kale Node draait (zoals toolchain.mjs).
import { lstatSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir, userInfo } from 'node:os';
import path from 'node:path';

// Bestanden die bepalen wat pnpm installeert en uitvoert (lockfile, manifest, workspace, registry- en hook-configuratie).
const BEHEERD = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs'];

/**
 * @typedef {{ worktree: boolean, nodeModules: 'afwezig' | 'map' | 'symlink', gewijzigd: string[] }} InstallFeiten
 * @typedef {{ actie: 'installeren' } | { actie: 'weigeren', melding: string }} InstallBesluit
 */

/**
 * @param {string} reden
 * @returns {InstallBesluit}
 */
function weiger(reden) {
  return { actie: 'weigeren', melding: `✗ worktree-install geweigerd: ${reden}` };
}

/**
 * Pure kern: mag er geïnstalleerd worden?
 * @param {InstallFeiten} feiten
 * @returns {InstallBesluit}
 */
export function worktreeInstallBesluit({ worktree, nodeModules, gewijzigd }) {
  if (!worktree)
    return weiger('dit is de hoofdcheckout; die richt de eigenaar in met scripts/bootstrap.sh (docs/ENVIRONMENT.md)');
  if (nodeModules === 'symlink')
    return weiger('node_modules is een symlink; verwijder de symlink en draai het script opnieuw');
  if (gewijzigd.length > 0)
    return weiger(
      `${gewijzigd.join(', ')} wijkt af van HEAD (gewijzigd, verwijderd of untracked); commit of herstel dit eerst, of vraag de eigenaar, want er wordt alleen volgens de gecommitte bestanden geïnstalleerd`,
    );
  return { actie: 'installeren' };
}

/**
 * Het pnpm-commando met alle schrijfbare mappen onder `tmp`. `pnpm install` kent van de mappen alleen `--store-dir`
 * (gemeten met pnpm 11.28.5: `--cache-dir` en `--state-dir` geven `Unknown option`); cache en state gaan via XDG_*.
 * @param {string} tmp
 * @returns {{ command: 'pnpm', args: string[], env: Record<string, string> }}
 */
export function worktreeInstallCommando(tmp) {
  return {
    command: 'pnpm',
    args: ['install', '--frozen-lockfile', '--package-import-method=copy', `--store-dir=${path.join(tmp, 'store')}`],
    env: {
      XDG_DATA_HOME: path.join(tmp, 'data'),
      XDG_CACHE_HOME: path.join(tmp, 'xdg-cache'),
      XDG_STATE_HOME: path.join(tmp, 'xdg-state'),
    },
  };
}

/** @param {string} pad */
function lstatOfNull(pad) {
  try {
    return lstatSync(pad);
  } catch {
    return null;
  }
}

/**
 * Voert git uit zonder GIT_*-variabelen van de aanroeper (GIT_DIR, GIT_INDEX_FILE …): die kunnen de vergelijking met HEAD
 * omleiden. Een niet-nul status buiten `toegestaan` is een fout met een korte melding, zonder stacktrace.
 * @param {string} root
 * @param {string[]} args
 * @param {number[]} [toegestaan] extra statuscodes die geen fout zijn
 * @returns {{ status: number, stdout: string }}
 */
function git(root, args, toegestaan = []) {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', env: omgevingZonder(/^GIT_/i) });
  if (r.error !== undefined || r.status === null || (r.status !== 0 && !toegestaan.includes(r.status))) {
    const reden = (r.error?.message ?? r.stderr).trim().replace(/\s+/g, ' ');
    throw new Error(`git ${args[0] ?? ''} faalt: ${reden}`);
  }
  return { status: r.status, stdout: r.stdout.trim() };
}

/**
 * Inhoudshash van een beheerd bestand in de werkmap: null als het ontbreekt, 'symlink' als het een symlink is (nooit gelijk
 * aan een hash in HEAD).
 * @param {string} root
 * @param {string} naam
 * @returns {string | null}
 */
function werkmapHash(root, naam) {
  const stat = lstatOfNull(path.join(root, naam));
  if (stat === null) return null;
  if (stat.isSymbolicLink()) return 'symlink';
  return git(root, ['hash-object', '--', naam]).stdout;
}

/**
 * Hash van het bestand in HEAD: null als het daar niet in staat (status 1 met -q).
 * @param {string} root
 * @param {string} naam
 * @returns {string | null}
 */
function headHash(root, naam) {
  const r = git(root, ['rev-parse', '--verify', '-q', `HEAD:${naam}`], [1]);
  return r.status === 0 ? r.stdout : null;
}

/**
 * Beheerde bestanden die in de werkmap afwijken van HEAD, op inhoud: gewijzigd, verwijderd of untracked (ook genegeerd,
 * pnpm leest ze toch). De index telt niet mee, dus `--assume-unchanged` en `--skip-worktree` verbergen niets, en een
 * gestagede wijziging die in de werkmap is teruggezet telt niet.
 * @param {string} root
 * @returns {string[]}
 */
function gewijzigdeBestanden(root) {
  // Ook als gezondheidscontrole van de repository: faalt bij een kapotte index.
  const untracked = git(root, ['ls-files', '--others', '--', ...BEHEERD]).stdout.split('\n');
  return BEHEERD.filter((naam) => untracked.includes(naam) || werkmapHash(root, naam) !== headHash(root, naam));
}

/**
 * De feiten uit het echte bestandssysteem en git. Buiten een gekoppelde worktree (`.git` is geen bestand) wordt git niet
 * aangeroepen: de weigering is dan altijd de hoofdcheckout-weigering, hoe de git-staat ook is.
 * @param {string} root
 * @returns {InstallFeiten}
 */
export function worktreeInstallFeiten(root) {
  const nm = lstatOfNull(path.join(root, 'node_modules'));
  const nodeModules = nm === null ? 'afwezig' : nm.isSymbolicLink() ? 'symlink' : 'map';
  const worktree = lstatOfNull(path.join(root, '.git'))?.isFile() === true;
  return { worktree, nodeModules, gewijzigd: worktree ? gewijzigdeBestanden(root) : [] };
}

/**
 * Eigen basismap onder os.tmpdir(), alleen voor deze gebruiker: aangemaakt met mode 0700 en bij hergebruik gecontroleerd
 * (echte map, geen symlink, eigen uid, niet voor anderen toegankelijk), zodat niemand de store kan voorbereiden.
 * @returns {string}
 */
function veiligeBasismap() {
  const uid = process.getuid?.();
  const basis = path.join(tmpdir(), `pnpm-worktree-${uid ?? 'gebruiker'}`);
  mkdirSync(basis, { recursive: true, mode: 0o700 });
  const stat = lstatOfNull(basis);
  if (stat === null || !stat.isDirectory()) throw new Error(`${basis} is geen gewone map`);
  if (uid !== undefined && stat.uid !== uid) throw new Error(`${basis} is van een andere gebruiker`);
  if ((stat.mode & 0o077) !== 0) throw new Error(`${basis} is toegankelijk voor anderen (verwacht mode 0700)`);
  return basis;
}

/**
 * De omgeving van de aanroeper zonder de variabelen die `uit` noemt.
 * @param {RegExp} uit
 * @returns {Record<string, string>}
 */
function omgevingZonder(uit) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const [naam, waarde] of Object.entries(process.env))
    if (waarde !== undefined && !uit.test(naam)) env[naam] = waarde;
  return env;
}

/**
 * mise bewaart zijn installaties onder een data- en state-map. XDG_* wijst naar de tijdelijke map, dus houdt mise zijn
 * eigen mappen vast: de waarde van de aanroeper, anders afgeleid van de oorspronkelijke XDG_*-variabele, anders onder $HOME.
 * @returns {Record<string, string>}
 */
function miseMappen() {
  const thuis = absoluut('HOME') ?? userInfo().homedir;
  return {
    MISE_DATA_DIR:
      absoluut('MISE_DATA_DIR') ?? path.join(absoluut('XDG_DATA_HOME') ?? path.join(thuis, '.local/share'), 'mise'),
    MISE_STATE_DIR:
      absoluut('MISE_STATE_DIR') ?? path.join(absoluut('XDG_STATE_HOME') ?? path.join(thuis, '.local/state'), 'mise'),
  };
}

/**
 * Waarde van een omgevingsvariabele van de aanroeper, alleen als die een absoluut pad is; leeg of relatief telt als niet gezet.
 * @param {string} naam
 * @returns {string | undefined}
 */
function absoluut(naam) {
  const waarde = process.env[naam];
  return waarde !== undefined && path.isAbsolute(waarde) ? waarde : undefined;
}

/**
 * De omgeving voor pnpm zonder NODE_OPTIONS en de variabelen npm_config_ en pnpm_config_ van de aanroeper (die kunnen
 * store, registry of scripts omleiden of code voorladen).
 * @param {Record<string, string>} extra
 * @returns {Record<string, string>}
 */
function pnpmOmgeving(extra) {
  return { ...omgevingZonder(/^((npm|pnpm)_config_|NODE_OPTIONS$)/i), ...miseMappen(), ...extra };
}

/** @returns {number} */
function installeer() {
  const { command, args, env } = worktreeInstallCommando(veiligeBasismap());
  const r = spawnSync(command, args, { cwd: process.cwd(), stdio: 'inherit', env: pnpmOmgeving(env) });
  if (r.error !== undefined) {
    console.error(`✗ worktree-install: pnpm ontbreekt of start niet (${r.error.message}); zie scripts/bootstrap.sh`);
    return 1;
  }
  return r.status ?? 1;
}

/** @returns {number} */
function uitvoeren() {
  // De controle loopt op de werkmap-root: in een submap is er geen `.git`, en dan is "hoofdcheckout" een misleidende melding.
  if (lstatOfNull(path.join(process.cwd(), '.git')) === null) {
    console.error('✗ worktree-install geweigerd: hier staat geen .git; draai het vanuit de worktree-root');
    return 1;
  }
  try {
    const besluit = worktreeInstallBesluit(worktreeInstallFeiten(process.cwd()));
    if (besluit.actie === 'weigeren') {
      console.error(besluit.melding);
      return 1;
    }
    return installeer();
  } catch (fout) {
    console.error(`✗ worktree-install: ${fout instanceof Error ? fout.message : String(fout)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = uitvoeren();
