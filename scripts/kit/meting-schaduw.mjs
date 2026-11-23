// `pnpm meting --schaduw` (spec schaduwmodus, ADR 0106): per regel van .kit/schaduw.json het aantal meetregels `Schaduw`
// (rails/hooks/lib/meting.mjs, `schaduwRegel`), de verschillende sleutels en sessies, en de einddatum. Een controle in de
// opslag die niet in het register staat, krijgt `(niet in register)`. De gewone tellingen van scripts/kit/meting.mjs slaan
// deze regels over. Getest in test/rails/meting-schaduw.test.ts.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/** @typedef {{ naam: string, treffers: number, sleutels: number, sessies: number, eind: string | null, inRegister: boolean }} Rij */
/** @typedef {{ c: string, k: string, s: string }} Treffer */

/** @param {string} lijn @param {string | undefined} branch @returns {Treffer | null} */
function treffer(lijn, branch) {
  try {
    /** @type {unknown} */
    const waarde = JSON.parse(lijn);
    if (typeof waarde !== 'object' || waarde === null || Array.isArray(waarde)) return null;
    const r = new Map(Object.entries(waarde));
    const [e, c, k, s, b] = ['e', 'c', 'k', 's', 'b'].map((veld) => r.get(veld));
    if (e !== 'Schaduw' || typeof c !== 'string') return null;
    if (branch !== undefined && b !== branch) return null;
    return { c, k: typeof k === 'string' ? k : '', s: typeof s === 'string' ? s : 'onbekend' };
  } catch {
    return null;
  }
}

/** Alle Schaduw-regels in de opslag, eventueel van één branch. @param {string | null} dir @param {string | undefined} branch */
function treffers(dir, branch) {
  if (dir === null || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((naam) => naam.endsWith('.jsonl'))
    .sort()
    .flatMap((naam) =>
      readFileSync(path.join(dir, naam), 'utf8')
        .split('\n')
        .map((lijn) => treffer(lijn, branch))
        .filter((t) => t !== null),
    );
}

/** Naam en einddatum per registerregel; een ontbrekend of ongeldig register is leeg (de vorm toetst de ratchet). @param {string} root */
function register(root) {
  const bestand = path.join(root, '.kit/schaduw.json');
  /** @type {unknown} */
  let regels;
  try {
    regels = existsSync(bestand) ? JSON.parse(readFileSync(bestand, 'utf8')) : [];
  } catch {
    regels = [];
  }
  /** @type {Map<string, string | null>} */
  const uit = new Map();
  for (const regel of Array.isArray(regels) ? regels : []) {
    const naam = typeof regel === 'object' && regel !== null ? Reflect.get(regel, 'naam') : undefined;
    const eind = typeof regel === 'object' && regel !== null ? Reflect.get(regel, 'eind') : undefined;
    if (typeof naam === 'string' && !uit.has(naam)) uit.set(naam, typeof eind === 'string' ? eind : null);
  }
  return uit;
}

/**
 * Eén rij per registerregel (ook met 0 treffers), daarna de controles uit de opslag zonder registerregel, op naam.
 * @param {string | null} dir @param {string} root @param {string | undefined} branch @returns {Rij[]}
 */
export function schaduwOverzicht(dir, root, branch) {
  const lijst = treffers(dir, branch);
  const regels = register(root);
  const buiten = [...new Set(lijst.map((t) => t.c))].filter((naam) => !regels.has(naam)).sort();
  const namen = [...regels.keys(), ...buiten];
  return namen.map((naam) => {
    const eigen = lijst.filter((t) => t.c === naam);
    return {
      naam,
      treffers: eigen.length,
      sleutels: new Set(eigen.map((t) => t.k)).size,
      sessies: new Set(eigen.map((t) => t.s)).size,
      eind: regels.get(naam) ?? null,
      inRegister: regels.has(naam),
    };
  });
}

/** `schaduw <naam>: <n> treffers, <m> sleutels, <s> sessies, eind <eind>` per rij. @param {readonly Rij[]} rijen */
export function schaduwTekst(rijen) {
  if (rijen.length === 0) return 'Geen controles in schaduw (.kit/schaduw.json is leeg) en geen Schaduw-regels.\n';
  const regels = rijen.map((rij) => {
    const telling = `schaduw ${rij.naam}: ${String(rij.treffers)} treffers, ${String(rij.sleutels)} sleutels, ${String(rij.sessies)} sessies`;
    if (!rij.inRegister) return `${telling} (niet in register)`;
    return `${telling}, eind ${rij.eind ?? 'onbekend'}`;
  });
  return `${regels.join('\n')}\n`;
}
