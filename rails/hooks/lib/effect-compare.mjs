// Vergelijking van twee momentopnamen (ADR 0066, spec rolhek-effect AC-2): welke paden een commando veranderde.
import { createHash } from 'node:crypto';
import { NUL } from './effect-snapshot.mjs';

/**
 * @typedef {import('./effect-snapshot.mjs').Snapshot} Snapshot
 * @typedef {import('./effect-snapshot.mjs').Entry} Entry
 * @typedef {{ rel: string, voor: Entry, na: Entry }} Verandering `wt: 'schoon'` = gelijk aan de index.
 */

/** @param {Snapshot} snap @param {string} rel @returns {Entry} */
export function entryVan(snap, rel) {
  return snap.paden[rel] ?? { wt: 'schoon', idx: snap.index[rel] ?? '' };
}

/** @param {Entry} a @param {Entry} b */
export const gelijk = (a, b) => a.wt === b.wt && a.idx === b.idx;

/**
 * Paden waarvan werkmap of index veranderde, nieuwe genegeerde mappen, de paden van een verschoven HEAD (via `diffPaden`) en
 * veranderde branches buiten de huidige (`refs/heads/*`, als `.git/<ref>`). Tags, `refs/stash` en `refs/remotes/` tellen niet:
 * `git fetch` en een eigen stash veranderen ze, en wat een stash in de werkmap verandert, telt al als pad.
 * @param {{ voor: Snapshot, na: Snapshot }} paar
 * @param {{ diffPaden: (oud: string, nieuw: string) => string[], branchRef: string }} git
 * @returns {Verandering[]}
 */
export function veranderingen({ voor, na }, git) {
  const kandidaten = new Set([...Object.keys(voor.paden), ...Object.keys(na.paden)]);
  for (const rel of new Set([...Object.keys(voor.index), ...Object.keys(na.index)]))
    if (voor.index[rel] !== na.index[rel]) kandidaten.add(rel);
  for (const rel of na.genegeerd) if (rel.endsWith('/') && !voor.genegeerd.includes(rel)) kandidaten.add(rel);
  if (voor.head !== na.head && voor.head !== '' && na.head !== '')
    for (const rel of git.diffPaden(voor.head, na.head)) kandidaten.add(rel);
  /** @type {Verandering[]} */
  const lijst = [];
  for (const rel of kandidaten) {
    const oud = entryVan(voor, rel);
    const nieuw = entryVan(na, rel);
    const headPad = voor.head !== na.head && !(rel in voor.paden) && !(rel in na.paden);
    if (!gelijk(oud, nieuw) || headPad || (rel.endsWith('/') && !voor.genegeerd.includes(rel)))
      lijst.push({ rel, voor: oud, na: nieuw });
  }
  for (const ref of new Set([...Object.keys(voor.refs), ...Object.keys(na.refs)])) {
    if (!ref.startsWith('refs/heads/') || ref === git.branchRef || voor.refs[ref] === na.refs[ref]) continue;
    lijst.push({ rel: `.git/${ref}`, voor: { wt: voor.refs[ref] ?? 'weg', idx: '' }, na: { wt: na.refs[ref] ?? 'weg', idx: '' } });
  }
  return lijst.toSorted((a, b) => a.rel.localeCompare(b.rel));
}

/**
 * Een plaatshouder van de sandbox (spec rolhek-effect AC-11 d) zonder index: `weg`, een leeg gewoon bestand zonder uitvoerbit
 * (de lege blob van het objectformaat, sha1 of sha256) of een tekenapparaat 1,3 (`<mode>:nul`).
 * @param {Entry} entry
 */
export function isPlaatshouder(entry) {
  if (entry.idx !== '') return false;
  if (entry.wt === 'weg' || entry.wt === 'schoon') return true;
  const [mode = '', staat = '', ...rest] = entry.wt.split(':');
  if (rest.length > 0 || !/^[0-7]+$/.test(mode)) return false;
  const bits = Number.parseInt(mode, 8);
  if ((bits & 0o170000) === 0o020000) return staat === NUL;
  return (bits & 0o170000) === 0o100000 && (bits & 0o7111) === 0 && isLegeBlob(staat);
}

/** @param {string} blob */
function isLegeBlob(blob) {
  const algoritme = blob.length === 64 ? 'sha256' : blob.length === 40 ? 'sha1' : null;
  return algoritme !== null && createHash(algoritme).update('blob 0\0').digest('hex') === blob;
}

/**
 * De blob-id in een werkmap- of indexstaat, of null (`weg`, `map`, een symlink, `schoon` zonder index).
 * @param {Entry} entry
 */
export function blobVan(entry) {
  if (entry.wt === 'schoon') return entry.idx.split('|')[0]?.split(' ')[1] ?? null;
  const blob = entry.wt.split(':')[1] ?? '';
  return /^[0-9a-f]{40,64}$/.test(blob) ? blob : null;
}
