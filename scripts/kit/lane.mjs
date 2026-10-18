// Lane-herkenning (ADR 0029 punt 6 en 7). Puur: de aanroeper levert de wijzigingen en de besluitdocumenten.
// Bereik (eigenaarbesluit): alles wat niet in src/core, voorReview of docs/adr/ staat; bestaande tests en migraties blijven dicht.
// Wat code uitvoert op de machine van de eigenaar of in CI staat al in voorReview; diff-guard en CODEOWNERS blijven gelden.
import { globMatch } from '../../rails/hooks/lib/rolhek.mjs';

/** @typedef {{ status: string, pad: string, van?: string }} Wijziging */
/** @typedef {{ lane: 'feature' | 'framework' | null, reden: string }} Uitslag */

const RECORD = '.claude/decisions.json';

/** @param {readonly string[]} globs @param {string} pad */
const inLijst = (globs, pad) => globs.some((glob) => globMatch(glob, pad));

/**
 * Waarom een pad buiten de feature-lane valt, of null als het erbinnen valt (punt 6 en 7).
 * @param {Wijziging} wijziging @param {import('../../rails/hooks/lib/rolhek.mjs').Config} config
 */
function buitenBereik({ status, pad }, config) {
  if (inLijst(config.voorReview ?? config.gates, pad)) return `${pad} staat in voorReview`;
  if (pad.startsWith('src/core/')) return `${pad} ligt in src/core`;
  if (pad.startsWith('docs/adr/')) return `${pad} is een ADR`;
  if (inLijst(config.testpaden, pad))
    return status === 'A' ? null : `${pad}: een bestaande test wijzigen of verwijderen`;
  if (inLijst(config.migraties, pad)) return status === 'A' ? null : `${pad}: een migratie wijzigen of verwijderen`;
  return null;
}

/** Bij een rename of kopie tellen beide paden (zoals `verifyScope`). @param {Wijziging[]} changes */
function paden(changes) {
  return changes.flatMap(({ status, pad, van }) =>
    van === undefined
      ? [{ status, pad }]
      : [
          { status, pad },
          { status, pad: van },
        ],
  );
}

/**
 * @param {{ changes: Wijziging[], besluiten: readonly string[], mini: boolean, config: import('../../rails/hooks/lib/rolhek.mjs').Config }} invoer
 * @returns {Uitslag}
 */
export function laneVan({ changes, besluiten, mini, config }) {
  const [besluit, ...rest] = besluiten;
  if (besluit === undefined) return { lane: null, reden: 'geen document krijgt een eigenaarstatus in deze PR' };
  if (rest.length > 0)
    return { lane: null, reden: `meer dan één document krijgt een eigenaarstatus: ${besluiten.join(', ')}` };
  const overige = paden(changes).filter(({ pad }) => pad !== besluit);
  const vreemd = overige.find(({ pad }) => pad !== RECORD);
  if (vreemd === undefined) return { lane: 'framework', reden: 'alleen het besluit en eventueel zijn record' };
  if (!mini) return { lane: null, reden: `${vreemd.pad} hoort niet in een PR met een in-PR-status (geen mini-spec)` };
  const reden = overige.map((wijziging) => buitenBereik(wijziging, config)).find((melding) => melding !== null);
  return reden === undefined
    ? { lane: 'feature', reden: 'mini-spec binnen het bereik van punt 6' }
    : { lane: null, reden };
}

/** Het frontmatterveld `sjabloon: mini` van een spec (ADR 0029 punt 5); alleen echte frontmatter op regel 1 telt. @param {string} text */
export function isMiniSpec(text) {
  const lines = text.replaceAll('\r\n', '\n').split('\n');
  const end = lines.indexOf('---', 1);
  return lines[0] === '---' && end > 0 && lines.slice(1, end).includes('sjabloon: mini');
}
