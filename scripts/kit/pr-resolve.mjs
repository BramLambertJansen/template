// `pnpm pr:resolve <nr>` (ADR 0098, spec botgesprekken-sluiten): sluit precies de reviewgesprekken die een bot opende, die
// na de laatste botopmerking door een mens met schrijfrecht beantwoord zijn en die GitHub als verouderd meldt. Dezelfde vorm
// als het mergescript: pure functies die redenen teruggeven, de API als parameter, elke aanroep afgevangen, schrijfacties pas
// aan het eind. Vóór enige mutatie drie trappen: lokale HEAD, kop van main en modus; de PR en de gesprekken (GraphQL, tien
// pagina's van 100); de PR zelf en de padtoets van het mergescript op de kop van main. Verouderd bewijst geen oplossing: dit
// script is een vangnet voor de route van de hoofdsessie, geen grens (framework §13).
import { execFileSync } from 'node:child_process';
import { gitText, readAuthority } from '../../rails/hooks/lib/authority-context.mjs';
import { bestandOp, gh, leesModus, nummerUit, padRedenen, ZONDER_BIN } from './pr-merge.mjs';

const SHA = /^[0-9a-f]{40}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_PAGINAS = 10;
const SCHRIJFRECHT = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);

const KOP = 'Geen gesprek gesloten (ADR 0098):';
const NIET_TE_LEZEN = 'niet te lezen';
const NIET_BOT = 'niet geopend door een bot; de eigenaar sluit het';
const GEEN_ANTWOORD = 'geen antwoord na de laatste opmerking van een bot';
const NIET_VEROUDERD = 'niet verouderd: de regel is niet gewijzigd';
const KAN_NIET = 'GitHub staat sluiten niet toe';
const MISLUKT = 'sluiten mislukt';
const ONLEESBAAR_PR = 'de PR of de gesprekken zijn niet te lezen';
const TE_VEEL = 'meer dan 1000 gesprekken: de eigenaar sluit ze';

// Vaste tekst, nooit uit invoer opgebouwd: de invoer gaat als variabelen mee.
const LEES_QUERY = `query($owner: String!, $name: String!, $number: Int!, $after: String) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      state
      isCrossRepository
      baseRefName
      headRefOid
      reviewThreads(first: 100, after: $after) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          isResolved
          isOutdated
          viewerCanResolve
          path
          comments(first: 100) {
            totalCount
            pageInfo { hasNextPage }
            nodes { url state createdAt authorAssociation author { __typename } }
          }
        }
      }
    }
  }
}`;
const SLUIT_MUTATIE = `mutation($threadId: ID!) {
  resolveReviewThread(input: { threadId: $threadId }) { thread { id isResolved } }
}`;

/** @typedef {(endpoint: string) => unknown} Api */
/** @typedef {(query: string, variabelen: Record<string, unknown>) => unknown} Graphql */
/** @typedef {{ uit: string[], fout: string[], code: number }} Uitkomst */

/** @param {unknown} waarde @param {string} sleutel @returns {unknown} */
function veld(waarde, sleutel) {
  return typeof waarde === 'object' && waarde !== null
    ? Object.entries(waarde).find(([k]) => k === sleutel)?.[1]
    : undefined;
}

/** @param {unknown} waarde @param {...string} sleutels */
function pad(waarde, ...sleutels) {
  return sleutels.reduce((huidig, sleutel) => veld(huidig, sleutel), waarde);
}

/** @param {unknown} waarde */
const tekst = (waarde) => (typeof waarde === 'string' ? waarde : '');

/** @param {unknown} waarde */
const isObject = (waarde) => typeof waarde === 'object' && waarde !== null && !Array.isArray(waarde);

/** De opmerkingen van een gesprek, of `[]` als `comments.nodes` geen lijst is. @param {unknown} gesprek @returns {unknown[]} */
function opmerkingen(gesprek) {
  const nodes = pad(gesprek, 'comments', 'nodes');
  return Array.isArray(nodes) ? nodes : [];
}

/** Een opmerking die leesbaar is (AC-2): url, associatie, ISO-tijd, auteur `null` of met `__typename`, `SUBMITTED`. @param {unknown} node */
function opmerkingLeesbaar(node) {
  const createdAt = veld(node, 'createdAt');
  const author = veld(node, 'author');
  return (
    typeof veld(node, 'url') === 'string' &&
    typeof veld(node, 'authorAssociation') === 'string' &&
    typeof createdAt === 'string' &&
    ISO.test(createdAt) &&
    !Number.isNaN(Date.parse(createdAt)) &&
    (author === null || tekst(veld(author, '__typename')) !== '') &&
    veld(node, 'state') === 'SUBMITTED'
  );
}

/** De opmerkingen: een niet-lege, volledige lijst van leesbare opmerkingen met een `createdAt` die niet daalt. @param {unknown} gesprek */
function opmerkingenLeesbaar(gesprek) {
  const nodes = pad(gesprek, 'comments', 'nodes');
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  if (pad(gesprek, 'comments', 'totalCount') !== nodes.length) return false;
  if (pad(gesprek, 'comments', 'pageInfo', 'hasNextPage') !== false) return false;
  if (!nodes.every(opmerkingLeesbaar)) return false;
  const tijden = nodes.map((node) => Date.parse(tekst(veld(node, 'createdAt'))));
  return tijden.every((tijd, index) => index === 0 || tijd >= (tijden[index - 1] ?? tijd));
}

/** Het gesprek zelf (AC-2). @param {unknown} gesprek */
function gesprekLeesbaar(gesprek) {
  return (
    tekst(veld(gesprek, 'id')) !== '' &&
    veld(gesprek, 'isResolved') === false &&
    typeof veld(gesprek, 'isOutdated') === 'boolean' &&
    typeof veld(gesprek, 'viewerCanResolve') === 'boolean' &&
    typeof veld(gesprek, 'path') === 'string' &&
    opmerkingenLeesbaar(gesprek)
  );
}

/**
 * Een botopmerking, een antwoord (een `User` met schrijfrecht, OV-1) of geen van beide.
 * @param {unknown} node @returns {'bot' | 'antwoord' | null}
 */
function soortVan(node) {
  const typename = pad(node, 'author', '__typename');
  if (typename === 'Bot') return 'bot';
  if (typename === 'User' && SCHRIJFRECHT.has(tekst(veld(node, 'authorAssociation')))) return 'antwoord';
  return null;
}

/**
 * Hoogstens één reden waarom een gesprek open blijft, de eerste in de vaste volgorde (AC-1, AC-2); leeg: sluitbaar. De
 * aanroeper toetst `isResolved` `true` vooraf (AC-5).
 * @param {unknown} gesprek @returns {string[]}
 */
export function gesprekRedenen(gesprek) {
  if (!gesprekLeesbaar(gesprek)) return [NIET_TE_LEZEN];
  const soorten = opmerkingen(gesprek).map(soortVan);
  if (soorten[0] !== 'bot') return [NIET_BOT];
  if (!soorten.slice(soorten.lastIndexOf('bot') + 1).includes('antwoord')) return [GEEN_ANTWOORD];
  if (veld(gesprek, 'isOutdated') !== true) return [NIET_VEROUDERD];
  if (veld(gesprek, 'viewerCanResolve') !== true) return [KAN_NIET];
  return [];
}

/** @param {string[]} redenen @returns {Uitkomst} */
const stop = (redenen) => ({ uit: [], fout: [KOP, ...redenen.map((reden) => `- ${reden}`)], code: 1 });

/** De PR uit een leesantwoord, of `null` bij `errors` of zonder object. @param {unknown} body */
function prUit(body) {
  if (!isObject(body) || veld(body, 'errors') !== undefined) return null;
  const pr = pad(body, 'data', 'repository', 'pullRequest');
  return isObject(pr) ? pr : null;
}

const PR_VELDEN = ['state', 'baseRefName', 'isCrossRepository', 'headRefOid'];

/** Een latere pagina hoort bij dezelfde PR als de eerste. @param {unknown} pr @param {unknown} eerste */
const zelfdePr = (pr, eerste) =>
  PR_VELDEN.every((naam) => veld(pr, naam) === veld(eerste, naam)) &&
  pad(pr, 'reviewThreads', 'totalCount') === pad(eerste, 'reviewThreads', 'totalCount');

/**
 * Eén pagina: de gesprekken en de cursor van de volgende pagina (`null`: laatste), of `null` als hij niet te lezen is.
 * @param {unknown} pr @returns {{ nodes: unknown[], volgende: string | null } | null}
 */
function paginaUit(pr) {
  const nodes = pad(pr, 'reviewThreads', 'nodes');
  const verder = pad(pr, 'reviewThreads', 'pageInfo', 'hasNextPage');
  const cursor = tekst(pad(pr, 'reviewThreads', 'pageInfo', 'endCursor'));
  if (!Array.isArray(nodes) || typeof verder !== 'boolean') return null;
  if (verder && cursor === '') return null;
  return { nodes, volgende: verder ? cursor : null };
}

/**
 * Alle pagina's (AC-4): de PR-velden van de eerste pagina en alle gesprekken, of een reden van trap 2.
 * @param {Graphql} graphql @param {{ owner: string, name: string, number: number }} doel
 * @returns {{ pr: unknown, gesprekken: unknown[] } | { reden: string }}
 */
function leesGesprekken(graphql, doel) {
  /** @type {unknown[]} */
  const gesprekken = [];
  /** @type {unknown} */
  let eerste = null;
  /** @type {string | null} */
  let after = null;
  for (let index = 0; index < MAX_PAGINAS; index += 1) {
    let pr;
    try {
      pr = prUit(graphql(LEES_QUERY, { ...doel, after }));
    } catch {
      return { reden: ONLEESBAAR_PR };
    }
    eerste ??= pr;
    const pagina = paginaUit(pr);
    if (pr === null || pagina === null || !zelfdePr(pr, eerste)) return { reden: ONLEESBAAR_PR };
    gesprekken.push(...pagina.nodes);
    if (pagina.volgende === null) {
      const totaal = pad(eerste, 'reviewThreads', 'totalCount');
      return totaal === gesprekken.length ? { pr: eerste, gesprekken } : { reden: ONLEESBAAR_PR };
    }
    after = pagina.volgende;
  }
  return { reden: TE_VEEL };
}

/** De SHA van de kop van main; `''` als `rest` gooit of geen tekst geeft. @param {Api} rest @param {string} repo */
function kopVanMain(rest, repo) {
  try {
    return tekst(pad(rest(`repos/${repo}/branches/main`), 'commit', 'sha'));
  } catch {
    return '';
  }
}

/**
 * Trap 1 (AC-3): lokale HEAD, kop van main en modus, elk alleen; geeft de SHA van main en de padtabel, of de reden.
 * @param {Api} rest @param {{ repo: string, head: string }} doel
 * @returns {{ mainSha: string, gates: unknown } | { reden: string }}
 */
function trapEen(rest, { repo, head }) {
  if (!SHA.test(head)) return { reden: 'geen geldige lokale HEAD' };
  const mainSha = kopVanMain(rest, repo);
  if (!SHA.test(mainSha)) return { reden: 'de kop van main is niet leesbaar' };
  const gates = bestandOp(rest, { repo, sha: mainSha, bestand: '.claude/gates.json' });
  if (leesModus(gates) !== 'niet-kritiek')
    return { reden: 'de modus op main is niet "niet-kritiek": de eigenaar sluit de gesprekken' };
  return { mainSha, gates };
}

/**
 * Trap 3 (AC-3): de PR zelf en de padtoets van het mergescript op de kop van main, alle redenen samen.
 * @param {unknown} pr @param {{ head: string, paden: string[] }} doel @returns {string[]}
 */
function trapDrie(pr, { head, paden }) {
  const redenen = [];
  if (veld(pr, 'state') !== 'OPEN') redenen.push('de PR is niet open');
  if (veld(pr, 'baseRefName') !== 'main') redenen.push('de basis is niet main');
  if (veld(pr, 'isCrossRepository') !== false) redenen.push('de head staat niet in deze repository (fork)');
  const prHead = tekst(veld(pr, 'headRefOid'));
  if (prHead !== head) {
    const kort = prHead === '' ? '?' : prHead.slice(0, 7);
    redenen.push(`de head van de PR (${kort}) is niet de lokale HEAD (${head.slice(0, 7)})`);
  }
  return [...redenen, ...paden];
}

/** Sluit één gesprek; `true` alleen als GitHub het gevraagde gesprek als gesloten teruggeeft (AC-5). @param {Graphql} graphql @param {string} id */
function sluit(graphql, id) {
  try {
    const body = graphql(SLUIT_MUTATIE, { threadId: id });
    if (!isObject(body) || veld(body, 'errors') !== undefined) return false;
    const thread = pad(body, 'data', 'resolveReviewThread', 'thread');
    return veld(thread, 'isResolved') === true && veld(thread, 'id') === id;
  } catch {
    return false;
  }
}

/** `<pad> (<url>)`; onleesbaar wordt `?`. @param {unknown} gesprek */
function plek(gesprek) {
  const padTekst = veld(gesprek, 'path');
  const url = veld(opmerkingen(gesprek)[0], 'url');
  return `${typeof padTekst === 'string' ? padTekst : '?'} (${typeof url === 'string' ? url : '?'})`;
}

/**
 * Na alle toetsen: per gesprek in leesvolgorde een regel, dan de slotregel (AC-5, AC-6).
 * @param {Graphql} graphql @param {{ nummer: number, gesprekken: unknown[] }} doel @returns {Uitkomst}
 */
function schrijf(graphql, { nummer, gesprekken }) {
  const teSluiten = gesprekken
    .filter((gesprek) => veld(gesprek, 'isResolved') !== true)
    .map((gesprek) => ({ gesprek, reden: gesprekRedenen(gesprek)[0] }));
  const al = gesprekken.length - teSluiten.length;
  const uit = teSluiten.map(({ gesprek, reden }) => {
    const gelukt = reden === undefined && sluit(graphql, tekst(veld(gesprek, 'id')));
    return gelukt ? `- gesloten: ${plek(gesprek)}` : `- open: ${plek(gesprek)}: ${reden ?? MISLUKT}`;
  });
  const gesloten = uit.filter((regel) => regel.startsWith('- gesloten: ')).length;
  const open = uit.length - gesloten;
  const slot = `PR #${String(nummer)}: ${String(gesloten)} gesloten, ${String(open)} open, ${String(al)} waren al gesloten.`;
  return { uit: [...uit, slot], fout: [], code: open === 0 ? 0 : 1 };
}

/**
 * De drie trappen en daarna het sluiten (AC-3 tot en met AC-6). `fout`: regels voor stderr (een stop); `uit`: die voor
 * stdout; bij een stop is `uit` leeg en is er geen mutatie.
 * @param {{ rest: Api, graphql: Graphql }} api @param {{ repo: string, nummer: number, head: string }} doel
 * @returns {Uitkomst}
 */
export function sluitGesprekken({ rest, graphql }, { repo, nummer, head }) {
  const basis = trapEen(rest, { repo, head });
  if ('reden' in basis) return stop([basis.reden]);
  const [owner = '', name = ''] = repo.split('/');
  const gelezen = leesGesprekken(graphql, { owner, name, number: nummer });
  if ('reden' in gelezen) return stop([gelezen.reden]);
  const paden = padRedenen(rest, { repo, nummer, mainSha: basis.mainSha, gates: basis.gates });
  const redenen = trapDrie(gelezen.pr, { head, paden });
  if (redenen.length > 0) return stop(redenen);
  return schrijf(graphql, { nummer, gesprekken: gelezen.gesprekken });
}

/**
 * `gh api graphql` met de vaste tekst als `query` en de variabelen als `-f` (tekst) of `-F` (getal); `null` gaat niet mee.
 * Een exitcode anders dan 0 of geen JSON op stdout: gooit.
 * @type {Graphql}
 */
function graphql(query, variabelen) {
  const args = ['api', 'graphql', '-f', `query=${query}`];
  for (const [naam, waarde] of Object.entries(variabelen)) {
    if (typeof waarde === 'number') args.push('-F', `${naam}=${String(waarde)}`);
    else if (typeof waarde === 'string') args.push('-f', `${naam}=${waarde}`);
  }
  return JSON.parse(execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: ZONDER_BIN }));
}

function main() {
  const root = process.cwd();
  const nummer = nummerUit(process.argv.slice(2), 'pr:resolve');
  const base = gitText(root, ['rev-parse', 'origin/main'])?.trim();
  const authority = base === undefined ? null : readAuthority({ root, base });
  const head = gitText(root, ['rev-parse', 'HEAD'])?.trim() ?? '';
  if (authority === null) throw new Error('Geen leesbare vertrouwde basis');
  const { uit, fout, code } = sluitGesprekken({ rest: gh, graphql }, { repo: authority.repository, nummer, head });
  if (fout.length > 0) console.error(fout.join('\n'));
  if (uit.length > 0) console.log(uit.join('\n'));
  process.exitCode = code;
}

if (import.meta.main) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
