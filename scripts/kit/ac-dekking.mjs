// De git-laag van de AC-dekking (ADR 0104, spec gebouwd-zonder-nummer): de boom van de werkmap, de boom op een commit en de
// dekking tegenover de merge-base met origin/main. De afleiding zelf is puur en staat in rails/hooks/lib/ac-dekking.mjs.
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { acDekking, SPEC_BESTAND, TESTBESTAND } from '../../rails/hooks/lib/ac-dekking.mjs';
import { basisVan } from './leesbudget.mjs';

/** @typedef {import('../../rails/hooks/lib/ac-dekking.mjs').Boom} Boom */
/** @typedef {import('../../rails/hooks/lib/ac-dekking.mjs').Dekking} Dekking */
/** Een boom op een commit; `onleesbaar` als git de boom of een gevraagd object niet kon lezen (AC-29). @typedef {Boom & { onleesbaar: boolean }} BasisBoom */

// De ADR-mappen naast de specmappen, voor de vervallen-vorm (AC-5).
const ADR_BESTAND = /^docs\/(?:template\/)?adr\/[^/]+\.md$/;
const MAX = 256 * 1024 * 1024;

/** @param {string} root @param {readonly string[]} args @param {string} [input] @returns {Buffer | null} */
function git(root, args, input) {
  const r = spawnSync('git', args, { cwd: root, input, maxBuffer: MAX });
  return r.status === 0 ? r.stdout : null;
}

/** @param {string} root @param {readonly string[]} args */
const paden = (root, args) => (git(root, args)?.toString('utf8') ?? '').split('\0').filter(Boolean);

/**
 * De werkmap: `git ls-files` met de inhoud van schijf (zoals `trackedFiles` in check-docs); een getrackt bestand dat niet
 * meer op schijf staat, leest als null.
 * @param {string} root @returns {Boom}
 */
export function boomWerkmap(root) {
  return {
    bestanden: paden(root, ['ls-files', '-z']),
    lees: (pad) => {
      try {
        return readFileSync(path.join(root, pad), 'utf8');
      } catch {
        return null;
      }
    },
  };
}

/** Telt het pad mee voor de dekking: testbestand, spec of ADR. @param {string} pad */
const telt = (pad) => TESTBESTAND.test(pad) || SPEC_BESTAND.test(pad) || ADR_BESTAND.test(pad);

const MAX_GENOEMD = 10;

/**
 * Ongetrackte, niet genegeerde bestanden die voor de dekking zouden tellen (leerpunt #966). `boomWerkmap` leest alleen
 * `git ls-files`; zonder deze melding meldt de ratchet of `feiten specs` een vals groen of `deels` tot na `git add`.
 * Eén regel of null; de uitkomst van de checks verandert niet.
 * @param {string} root @returns {string | null}
 */
export function ongetracktMelding(root) {
  const nieuw = paden(root, ['ls-files', '-z', '--others', '--exclude-standard']).filter(telt).sort();
  if (nieuw.length === 0) return null;
  const rest = nieuw.length > MAX_GENOEMD ? ` … en ${nieuw.length - MAX_GENOEMD} meer` : '';
  return `${nieuw.length} bestand(en) ongetrackt; tellen niet mee voor de AC-dekking tot git add: ${nieuw.slice(0, MAX_GENOEMD).join(', ')}${rest}`;
}

const BATCH_KOP = /^[0-9a-f]+ [a-z]+ \d+$/;

/**
 * Leest de uitvoer van `git cat-file --batch`: per object `<oid> <type> <grootte>\n<inhoud>\n`. Een `<naam> missing`,
 * een andere kop of een afgebroken uitvoer maakt de boom onleesbaar: null, nooit een stil ontbrekend bestand (AC-29).
 * @param {Buffer} uit @param {readonly string[]} namen @returns {Map<string, string> | null}
 */
function leesBatch(uit, namen) {
  /** @type {Map<string, string>} */
  const inhoud = new Map();
  let positie = 0;
  for (const naam of namen) {
    const eind = uit.indexOf(10, positie);
    if (eind === -1) return null;
    const kop = uit.subarray(positie, eind).toString('utf8');
    if (!BATCH_KOP.test(kop)) return null;
    const grootte = Number(kop.split(' ')[2]);
    positie = eind + 1;
    if (positie + grootte > uit.length) return null;
    inhoud.set(naam, uit.subarray(positie, positie + grootte).toString('utf8'));
    positie += grootte + 1;
  }
  return inhoud;
}

/**
 * De boom op `sha`: `git ls-tree -r`, en de testbestanden, specs en ADR's met hun inhoud in één `git cat-file --batch`.
 * Gooit niet: faalt `ls-tree` of `cat-file`, of ontbreekt een gevraagd object, dan is `onleesbaar` true (AC-29).
 * @param {string} root @param {string} sha @returns {BasisBoom}
 */
export function boomOpBasis(root, sha) {
  const lijst = git(root, ['ls-tree', '-r', '--name-only', '-z', sha]);
  const bestanden = (lijst?.toString('utf8') ?? '').split('\0').filter(Boolean);
  // Een pad met een regeleinde past niet in de batch-invoer; zo'n pad leest als null.
  const nodig = bestanden.filter((pad) => telt(pad) && !pad.includes('\n'));
  const uit =
    nodig.length === 0
      ? Buffer.alloc(0)
      : git(root, ['cat-file', '--batch'], nodig.map((pad) => `${sha}:${pad}\n`).join(''));
  const inhoud = uit === null ? null : leesBatch(uit, nodig);
  return {
    bestanden,
    lees: (pad) => inhoud?.get(pad) ?? null,
    onleesbaar: lijst === null || inhoud === null,
  };
}

/**
 * `git diff -M --name-status -z <basis>` tegenover de werkmap: records `R<score>`, oud pad, nieuw pad; de rest heeft één pad.
 * @param {string} root @param {string} basis @returns {Record<string, string>} nieuw pad naar oud pad
 */
export function hernoemingen(root, basis) {
  const velden = (git(root, ['diff', '-M', '--name-status', '-z', basis])?.toString('utf8') ?? '').split('\0');
  /** @type {Record<string, string>} */
  const hernoemd = {};
  for (let i = 0; i < velden.length;) {
    const status = velden[i] ?? '';
    if (status.startsWith('R') || status.startsWith('C')) {
      if (status.startsWith('R')) hernoemd[velden[i + 2] ?? ''] = velden[i + 1] ?? '';
      i += 3;
    } else i += 2;
  }
  return hernoemd;
}

/**
 * De dekking op de merge-base `sha` met origin/main en in de werkmap, met de bomen en de hernoemingen (spec: nieuw pad naar
 * oud pad). Zonder merge-base zijn `sha` en `basis` null en `hernoemd` leeg (AC-26); bij een onleesbare boom op de
 * merge-base is `bomen.basis.onleesbaar` true (AC-29).
 * @param {string} root
 * @returns {{ sha: string | null, basis: Map<string, Dekking> | null, nu: Map<string, Dekking>, hernoemd: Record<string, string>, bomen: { basis: BasisBoom | null, nu: Boom } }}
 */
export function dekkingTegenBasis(root) {
  const nuBoom = boomWerkmap(root);
  const nu = acDekking(nuBoom);
  const sha = basisVan(root);
  if (sha === null) return { sha, basis: null, nu, hernoemd: {}, bomen: { basis: null, nu: nuBoom } };
  const basisBoom = boomOpBasis(root, sha);
  return {
    sha,
    basis: acDekking(basisBoom),
    nu,
    hernoemd: hernoemingen(root, sha),
    bomen: { basis: basisBoom, nu: nuBoom },
  };
}
