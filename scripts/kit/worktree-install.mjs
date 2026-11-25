// Installeert de dependencies in een gekoppelde worktree (ADR 0085, spec claude-sandbox-werkstraat AC-10):
// `pnpm install --frozen-lockfile` met store (`--store-dir`) en cache (`--cache-dir`) als vlag en state (XDG_STATE_HOME)
// onder os.tmpdir(), zodat het binnen de Claude Code-sandbox slaagt zonder globale pnpm-map. Weigert in de hoofdcheckout,
// bij een symlink als node_modules en bij wijzigingen ten opzichte van HEAD in de beheerde bestanden. In een cloudsessie
// (CLAUDE_CODE_REMOTE=true; ADR 0085 herzien, spec cloud-werkmap-herstel) gelden in de hoofdcheckout dezelfde regels als in
// een worktree, en gaat `--config.confirm-modules-purge=false` mee zodat pnpm een bestaande node_modules zonder TTY-vraag
// vervangt. Een bestaande map node_modules (ook leeg of half) wordt gewoon afgemaakt:
// een frozen install is idempotent. De installatie zelf (basismap, omgeving, pnpm starten, melding) loopt via
// pnpm-installeer.mjs in modus `werkmap` (spec pnpm-sandbox-installatie). Zonder dependencies, zodat het op een kale Node
// draait (zoals toolchain.mjs).
import { lstatSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { installeer, omgevingZonder, pnpmInstallCommando } from './pnpm-installeer.mjs';

// Bestanden die bepalen wat pnpm installeert en uitvoert (lockfile, manifest, workspace, registry- en hook-configuratie).
const BEHEERD = ['package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', '.pnpmfile.mjs'];

/**
 * @typedef {{ worktree: boolean, nodeModules: 'afwezig' | 'map' | 'symlink', gewijzigd: string[], cloud?: boolean }} InstallFeiten
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
export function worktreeInstallBesluit({ worktree, nodeModules, gewijzigd, cloud = false }) {
  if (!worktree && !cloud)
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
 * Het pnpm-commando van modus `werkmap` met alle schrijfbare mappen onder `tmp`; een doorgave naar de pure kern in
 * pnpm-installeer.mjs (spec pnpm-sandbox-installatie), die de metingen achter elke map noemt.
 * @param {string} tmp
 * @param {boolean} [cloud] cloudsessie
 */
export function worktreeInstallCommando(tmp, cloud = false) {
  return pnpmInstallCommando(tmp, { modus: 'werkmap', cloud });
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
 * Hash van het bestand in een commit (`HEAD` of `MERGE_HEAD`): null als het daar niet in staat (status 1 met -q).
 * @param {string} root
 * @param {string} ref
 * @param {string} naam
 * @returns {string | null}
 */
function refHash(root, ref, naam) {
  const r = git(root, ['rev-parse', '--verify', '-q', `${ref}:${naam}`], [1]);
  return r.status === 0 ? r.stdout : null;
}

/**
 * Loopt er een merge (`MERGE_HEAD` bestaat)?
 * @param {string} root
 * @returns {boolean}
 */
function lopendeMerge(root) {
  return git(root, ['rev-parse', '--verify', '-q', 'MERGE_HEAD'], [1]).status === 0;
}

/**
 * Beheerde bestanden die in de werkmap afwijken van HEAD, op inhoud: gewijzigd, verwijderd of untracked (ook genegeerd,
 * pnpm leest ze toch). De index telt niet mee, dus `--assume-unchanged` en `--skip-worktree` verbergen niets, en een
 * gestagede wijziging die in de werkmap is teruggezet telt niet. In de cloud tijdens een lopende merge telt een bestand
 * dat op inhoud gelijk is aan `MERGE_HEAD` niet als gewijzigd, ook als het untracked is (spec cloud-werkmap-herstel AC-9).
 * @param {string} root
 * @param {boolean} cloud
 * @returns {string[]}
 */
function gewijzigdeBestanden(root, cloud) {
  // Ook als gezondheidscontrole van de repository: faalt bij een kapotte index.
  const untracked = git(root, ['ls-files', '--others', '--', ...BEHEERD]).stdout.split('\n');
  const merge = cloud && lopendeMerge(root);
  return BEHEERD.filter((naam) => {
    const hash = werkmapHash(root, naam);
    if (merge && hash === refHash(root, 'MERGE_HEAD', naam)) return false;
    return untracked.includes(naam) || hash !== refHash(root, 'HEAD', naam);
  });
}

/**
 * De feiten uit het echte bestandssysteem en git. Buiten een gekoppelde worktree (`.git` is geen bestand) en buiten de
 * cloud wordt git niet aangeroepen: de weigering is dan altijd de hoofdcheckout-weigering, hoe de git-staat ook is. In de
 * cloud worden de beheerde bestanden ook in de hoofdcheckout getoetst, en telt tijdens een lopende merge een bestand dat
 * gelijk is aan `MERGE_HEAD` niet als gewijzigd (spec cloud-werkmap-herstel AC-9); buiten de cloud alleen HEAD.
 * @param {string} root
 * @param {boolean} [cloud] cloudsessie
 * @returns {InstallFeiten}
 */
export function worktreeInstallFeiten(root, cloud = false) {
  const nm = lstatOfNull(path.join(root, 'node_modules'));
  const nodeModules = nm === null ? 'afwezig' : nm.isSymbolicLink() ? 'symlink' : 'map';
  const worktree = lstatOfNull(path.join(root, '.git'))?.isFile() === true;
  return { worktree, nodeModules, gewijzigd: worktree || cloud ? gewijzigdeBestanden(root, cloud) : [] };
}

/** @returns {Promise<number>} */
async function uitvoeren() {
  // De controle loopt op de werkmap-root: in een submap is er geen `.git`, en dan is "hoofdcheckout" een misleidende melding.
  if (lstatOfNull(path.join(process.cwd(), '.git')) === null) {
    console.error('✗ worktree-install geweigerd: hier staat geen .git; draai het vanuit de worktree-root');
    return 1;
  }
  const cloud = process.env['CLAUDE_CODE_REMOTE'] === 'true';
  try {
    const besluit = worktreeInstallBesluit({ ...worktreeInstallFeiten(process.cwd(), cloud), cloud });
    if (besluit.actie === 'weigeren') {
      console.error(besluit.melding);
      return 1;
    }
    return await installeer({ modus: 'werkmap', cloud });
  } catch (fout) {
    console.error(`✗ worktree-install: ${fout instanceof Error ? fout.message : String(fout)}`);
    return 1;
  }
}

if (import.meta.main) process.exitCode = await uitvoeren();
