// De tweede bouw van check:snapshot (spec template-update, AC-7): is er een toegevoegde migratie die niet later is dan de
// nieuwste bestaande, onder welke namen komen de toegevoegde migraties dan in de bouw op volgorde van binnenkomst. De
// aanleiding is dezelfde selectie als de volgorderegel in check-migrations.mjs (op main tegen de eerste ouder van HEAD), maar
// zonder de uitzondering voor een templatemigratie: juist de migratie die check:migrations doorlaat, moet bewezen worden. De
// template-ref wordt niet gelezen.
// Productie heeft de bestaande migraties al en past daarna alle nieuwe toe op versievolgorde. Daarom krijgt ELKE toegevoegde
// migratie een nieuwe naam, niet alleen de oudere: allemaal later dan elke versie in db/migrations, in hun onderlinge
// versievolgorde. Zo blijft een latere toegevoegde migratie ná een oudere toegevoegde waar ze van afhangt. De naam verschilt
// alleen in de versie. Dit script wijzigt niets; scripts/runner.sh gen-volgorde hernoemt in de tijdelijke invoermap.
// CLI: per migratie één regel `<bestandsnaam> <nieuwe bestandsnaam>`, niets als er geen is. Is origin/main niet te lezen,
// dan faalt het script: onleesbaar telt als fout.
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { BASE, baseOnleesbaar, DIR, NAAM, ouderToegevoegd, vergelijkingspunt } from './check-migrations.mjs';

const HOOGSTE = 99_999_999_999_999;

/** @typedef {{ van: string, naar: string }} Hernoeming bestandsnamen in db/migrations, geen paden */

/**
 * @param {string} naam
 * @returns {number | undefined} de versie van een migratienaam, undefined als de naam de vaste vorm niet heeft
 */
function versie(naam) {
  const gevonden = NAAM.exec(naam)?.[1];
  return gevonden === undefined ? undefined : Number(gevonden);
}

/**
 * Een derde argument (de template-ref, zoals bij `migratieFouten`) mag meegegeven worden en wordt genegeerd.
 * @param {string} [root]
 * @param {string} [base]
 * @returns {Hernoeming[]} elke toegevoegde migratie, op versievolgorde; leeg als geen ervan ouder is dan een bestaande
 */
export function volgordeHernoemingen(root = '.', base = BASE) {
  const punt = vergelijkingspunt(root, base);
  if (punt === undefined) throw new Error(baseOnleesbaar(base));
  if (punt.bestaand === undefined) return [];
  // Alleen bestanden direct in db/migrations met de vaste naamvorm: dbmate leest geen submappen.
  const namen = (/** @type {readonly string[]} */ paden) =>
    paden
      .filter((pad) => path.posix.dirname(pad) === DIR)
      .map((pad) => path.posix.basename(pad))
      .filter((naam) => NAAM.test(naam))
      .toSorted();
  const selectie = ouderToegevoegd(root, punt.bestaand);
  if (namen(selectie.ouder).length === 0) return [];
  const ouder = namen(selectie.toegevoegd);
  const versies = readdirSync(path.join(root, DIR))
    .map(versie)
    .filter((getal) => getal !== undefined);
  const hoogste = Math.max(...versies);
  if (hoogste + ouder.length > HOOGSTE) throw new Error(`geen versie vrij na ${String(hoogste)} in ${DIR}`);
  return ouder.map((van, i) => ({ van, naar: `${String(hoogste + i + 1).padStart(14, '0')}${van.slice(14)}` }));
}

function main() {
  try {
    for (const { van, naar } of volgordeHernoemingen()) process.stdout.write(`${van} ${naar}\n`);
  } catch (error) {
    console.error(`✗ migratie-volgorde: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

if (import.meta.main) main();
