// Leerlus met bewijs (ADR 0078, spec leerlus-bewijs; ADR 0081, spec leerlus-herzien): pure functies voor de issue-check (AC-5, AC-6), de sectie
// `## Leerpunt` in een PR-beschrijving (AC-1, AC-2, AC-4) en het oordeel over de bewijsruns (AC-3). Zonder dependencies:
// de workflows draaien dit vanaf main zonder install, net als de guard (alleen `node:`- en relatieve imports).

/** @typedef {{ label: string, verplicht: boolean, opties: string[] }} Veld */
/** @typedef {{ nummer: number, trede: string, pad: string | null, reden: string | null, meting: string | null, baseline: string | null, geenBaseline: string | null }} Regel */
/** @typedef {{ status: string, assertieFouten: number, laadFout: boolean }} RunUitslag */

export const LADDER = ['Type', 'Check', 'Gouden pad of generator', 'Skill', 'Padregel', 'AGENTS.md'];
/** De plek naast de ladder voor schrappen, vereenvoudigen of versnellen (ADR 0081 punt 1); de keuzelijst is `PLEKKEN`. */
export const PLEK_SCHRAPPEN = 'Schrappen of vereenvoudigen';
export const PLEKKEN = [PLEK_SCHRAPPEN, ...LADDER];
/** De drie verplichte delen van `Onderbouwing` bij `PLEK_SCHRAPPEN` (ADR 0081 punt 2). */
export const ONDERBOUWING = ['Meting', 'Overname', 'Terugval'];
const KOP_PLEK = 'Voorstel voor de plek';
const KOP_ONDERBOUWING = 'Onderbouwing';
/** Teksttreden: het bewijs is `baseline: …` of `geen baseline: <reden>` (ADR 0107, spec gedragsbaseline). */
export const TEKSTTREDEN = ['Skill', 'Padregel', 'AGENTS.md'];
/** Paden waarvan een baseline er minstens één in de diff vraagt (ADR 0107 punt 1): mappen en exacte bestanden. */
export const TEKSTPADEN = ['.claude/agents/', '.claude/skills/', '.claude/rules/'];
const TEKSTBESTANDEN = ['AGENTS.md', 'CLAUDE.md'];
export const GEEN_ANTWOORD = '_No response_';
export const SCHRIJFRECHT = ['OWNER', 'MEMBER', 'COLLABORATOR'];
export const COMMENT_ONVOLLEDIG = 'Dit leerpunt volgt het sjabloon niet:';
export const COMMENT_ZONDER_BEWIJS =
  'Gesloten zonder sluitbewijs (ADR 0078): geen gemergde PR met een sectie Leerpunt voor dit issue en geen comment "achterhaald: <reden>".';

/** @param {string} waarde */
function ontquote(waarde) {
  const t = waarde.trim();
  return t.length >= 2 && t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
}

/**
 * De velden van `.github/ISSUE_TEMPLATE/leerpunt.yml` in de vaste opmaak die `leerpunt-sjabloon.test.ts` bewaakt: per veld
 * het label, of het verplicht is en de opties van een keuzelijst.
 * @param {string} tekst @returns {Veld[]}
 */
export function leesSjabloon(tekst) {
  /** @type {Veld[]} */
  const velden = [];
  let inOpties = false;
  for (const regel of tekst.split('\n')) {
    const huidig = velden.at(-1);
    if (/^ {2}- type: /.test(regel)) velden.push({ label: '', verplicht: false, opties: [] });
    else if (huidig === undefined) continue;
    else if (/^ {6}options:\s*$/.test(regel)) inOpties = true;
    else if (inOpties && /^ {8}- /.test(regel)) huidig.opties.push(ontquote(regel.replace(/^ {8}- /, '')));
    else {
      inOpties = false;
      const label = /^ {6}label: (.+)$/.exec(regel);
      if (label !== null) huidig.label = ontquote(label[1] ?? '');
      if (/^ {6}required: true\s*$/.test(regel)) huidig.verplicht = true;
    }
  }
  return velden;
}

/**
 * De `### `-koppen van een issuebody met hun waarde, in volgorde.
 * @param {string} body @returns {{ kop: string, waarde: string }[]}
 */
export function bodyKoppen(body) {
  const delen = body.replaceAll('\r\n', '\n').split(/^### /m).slice(1);
  return delen.map((deel) => {
    const [kop = '', ...rest] = deel.split('\n');
    return { kop: kop.trim(), waarde: rest.join('\n').trim() };
  });
}

/** @param {string} waarde */
function leeg(waarde) {
  return waarde === '' || waarde === GEEN_ANTWOORD;
}

/**
 * De fouten van een leerpunt-issue tegen het sjabloon (AC-5): ontbrekende kop, lege verplichte waarde, onbekende waarde in
 * een keuzelijst, verkeerde volgorde. Leeg = het issue klopt.
 * @param {string} body @param {Veld[]} velden @returns {string[]}
 */
export function toetsBody(body, velden) {
  const koppen = bodyKoppen(body);
  const namen = koppen.map(({ kop }) => kop);
  /** @type {string[]} */
  const fouten = [];
  let vorige = -1;
  for (const veld of velden) {
    const index = namen.indexOf(veld.label);
    const gevonden = koppen[index];
    if (gevonden === undefined) {
      if (veld.verplicht) fouten.push(`ontbreekt: ${veld.label}`);
      continue;
    }
    if (index < vorige) fouten.push(`volgorde: ${veld.label}`);
    vorige = Math.max(vorige, index);
    if (veld.verplicht && leeg(gevonden.waarde)) fouten.push(`leeg: ${veld.label}`);
    else if (veld.opties.length > 0 && !leeg(gevonden.waarde) && !veld.opties.includes(gevonden.waarde))
      fouten.push(`onbekende waarde bij ${veld.label}: ${gevonden.waarde}`);
  }
  return [...fouten, ...onderbouwingFouten(koppen)];
}

/** @param {{ kop: string, waarde: string }[]} koppen @param {string} naam */
function waardeVan(koppen, naam) {
  return koppen.find(({ kop }) => kop === naam)?.waarde ?? '';
}

/** De plek uit een issuebody, of '' (spec leerlus-herzien AC-3). @param {string} body */
export function plekVan(body) {
  return waardeVan(bodyKoppen(body), KOP_PLEK);
}

/**
 * Bij plek `Schrappen of vereenvoudigen` moet `Onderbouwing` per deel een regel `<deel>: <tekst>` hebben, ook na `- ` of
 * met `**` of na `1. ` (spec leerlus-herzien AC-2). Bij een andere plek: geen eis.
 * @param {{ kop: string, waarde: string }[]} koppen @returns {string[]}
 */
function onderbouwingFouten(koppen) {
  if (waardeVan(koppen, KOP_PLEK) !== PLEK_SCHRAPPEN) return [];
  const regels = waardeVan(koppen, KOP_ONDERBOUWING)
    .split('\n')
    .map((regel) =>
      regel
        .replace(/^\s*(?:[-*]|\d+\.)\s+/, '')
        .replaceAll('**', '')
        .trim(),
    );
  const heeft = (/** @type {string} */ deel) =>
    regels.some((regel) => regel.startsWith(`${deel}:`) && regel.slice(deel.length + 1).trim() !== '');
  return ONDERBOUWING.filter((deel) => !heeft(deel)).map((deel) => `onderbouwing ontbreekt: ${deel}`);
}

/** @param {string[]} fouten @param {Veld[]} [velden] voor een hint per keuzeveld met een onbekende waarde */
export function commentOnvolledig(fouten, velden = []) {
  return [COMMENT_ONVOLLEDIG, '', ...fouten.map((fout) => `- ${fout}`), ...keuzeHints(fouten, velden)].join('\n');
}

/**
 * Per keuzeveld met een onbekende waarde één hint met de toegestane opties (leerpunt #759): agents zetten toelichting
 * achter de waarde of kiezen een plekwaarde als Soort, en de foutregel alleen zei niet wat wel mag.
 * @param {string[]} fouten @param {Veld[]} velden @returns {string[]}
 */
function keuzeHints(fouten, velden) {
  return velden
    .filter(
      (veld) => veld.opties.length > 0 && fouten.some((f) => f.startsWith(`onbekende waarde bij ${veld.label}: `)),
    )
    .map(
      (veld) =>
        `Kies bij ${veld.label} precies één van: ${veld.opties.map((o) => `\`${o}\``).join(', ')}; zet toelichting onder Bron of Onderbouwing, niet achter de waarde.`,
    );
}

const REGEL = /^\s*[-*]\s+#(\d+):\s*trede\s+(.+?);\s*bewijs\s+(.+?)\s*$/;

/**
 * De regels uit de sectie `## Leerpunt` van een PR-beschrijving (AC-1): `- #<nr>: trede <trede>; bewijs <pad>` of
 * `- #<nr>: trede <trede>; bewijs geen test: <reden>`. De parser van de bewijsjob en de issue-check.
 * @param {string} body @returns {Regel[]}
 */
export function leesLeerpuntSectie(body) {
  const regels = body.replaceAll('\r\n', '\n').split('\n');
  const start = regels.findIndex((regel) => /^##\s+Leerpunt\s*$/.test(regel));
  if (start === -1) return [];
  /** @type {Regel[]} */
  const uit = [];
  for (const regel of regels.slice(start + 1)) {
    if (/^#{1,2}\s/.test(regel)) break;
    const m = REGEL.exec(regel);
    if (m === null) continue;
    const bewijs = (m[3] ?? '').replace(/^`|`$/g, '');
    const vorm = (/** @type {RegExp} */ re) => {
      const v = re.exec(bewijs);
      return v === null ? null : (v[1] ?? '').trim();
    };
    const reden = vorm(/^geen test:\s*(.*)$/);
    const meting = vorm(/^meting:\s*(.*)$/);
    const baseline = vorm(/^baseline:\s*(.*)$/);
    const geenBaseline = vorm(/^geen baseline:\s*(.*)$/);
    const zonderPad = [reden, meting, baseline, geenBaseline].some((waarde) => waarde !== null);
    uit.push({
      nummer: Number(m[1]),
      trede: (m[2] ?? '').trim(),
      pad: zonderPad ? null : bewijs,
      reden,
      meting,
      baseline,
      geenBaseline,
    });
  }
  return uit;
}

/** @param {string} pad */
export function soortBewijs(pad) {
  if (pad.startsWith('e2e/') || pad.endsWith('.int.test.ts')) return 'integratie';
  if (/\.test-d\.ts$/.test(pad)) return 'type';
  if (/\.test\.tsx?$/.test(pad)) return 'unit';
  return null;
}

/**
 * Toets één regel tegen trede, diff en soort bewijs (AC-2, AC-4). `geen test: <reden>` mag bij elke trede behalve de
 * teksttreden als de reden een integratie- of e2e-test noemt die de PR toevoegt of wijzigt; bij Skill, Padregel en
 * AGENTS.md is het bewijs `baseline:` of `geen baseline:` (spec gedragsbaseline AC-5). Geeft een fout of null.
 * @param {Regel} regel @param {Set<string>} diff
 */
export function regelFout(regel, diff) {
  const naam = `#${String(regel.nummer)}`;
  if (!PLEKKEN.includes(regel.trede)) return `${naam}: onbekende trede "${regel.trede}"`;
  if (regel.baseline !== null || regel.geenBaseline !== null) return baselineFout(regel, diff, naam);
  if (regel.trede === PLEK_SCHRAPPEN || regel.meting !== null) return metingFout(regel, naam);
  return testFout(regel, diff, naam);
}

/** @param {Regel} regel @param {Set<string>} diff @param {string} naam */
function testFout(regel, diff, naam) {
  const tekst = TEKSTTREDEN.includes(regel.trede);
  const alleen = `${naam}: bij trede ${regel.trede} is het bewijs "baseline: …" of "geen baseline: <reden>"`;
  if (regel.reden !== null) {
    if (regel.reden === '') return `${naam}: "geen test" zonder reden`;
    if (tekst) return `${alleen}, geen "geen test:"`;
    const integratie = regel.reden.split(/[\s`,;()]+/).filter((woord) => soortBewijs(woord) === 'integratie');
    if (integratie.some((pad) => diff.has(pad))) return null;
    return `${naam}: "geen test" mag bij trede ${regel.trede} alleen met een integratie- of e2e-test uit de diff in de reden`;
  }
  if (tekst) return `${alleen}, geen testpad`;
  const pad = regel.pad ?? '';
  const soort = soortBewijs(pad);
  if (soort === null || soort === 'integratie')
    return `${naam}: ${pad} is geen unit- of typetest (integratie of e2e: "geen test: <reden>")`;
  if (soort === 'type' && regel.trede !== 'Type') return `${naam}: een typetest hoort bij trede Type`;
  if (!diff.has(pad)) return `${naam}: ${pad} staat niet als toegevoegd of gewijzigd in de diff`;
  return null;
}

/** `zonder <a>/3, met <b>/3 (<model>)` (spec gedragsbaseline): de tellingen toetst `baselineFout` apart. */
const BASELINE = /^zonder\s+([0-3])\/3,\s*met\s+([0-3])\/3\s*\(\s*(\S[^()]*?)\s*\)$/;

/** @param {string} pad */
function isTekstpad(pad) {
  return TEKSTBESTANDEN.includes(pad) || TEKSTPADEN.some((map) => pad.startsWith(map));
}

/**
 * Toets `baseline:` en `geen baseline:` (spec gedragsbaseline AC-3, AC-5): eerst de trede, dan de reden of de vorm, dan
 * `met`, dan `zonder`, dan de diff. `geen baseline:` vraagt alleen een reden (besluit eigenaar 2026-11-22, OV-1b).
 * @param {Regel} regel @param {Set<string>} diff @param {string} naam
 */
function baselineFout(regel, diff, naam) {
  const soort = regel.baseline !== null ? 'baseline:' : 'geen baseline:';
  if (!TEKSTTREDEN.includes(regel.trede))
    return `${naam}: "${soort}" hoort alleen bij trede Skill, Padregel of AGENTS.md`;
  if (regel.geenBaseline !== null) return regel.geenBaseline === '' ? `${naam}: "geen baseline" zonder reden` : null;
  const m = BASELINE.exec(regel.baseline ?? '');
  if (m === null)
    return `${naam}: baseline "${regel.baseline ?? ''}" heeft niet de vorm zonder <a>/3, met 3/3 (<model>)`;
  if (m[2] !== '3') return `${naam}: met ${m[2] ?? ''}/3: alle drie runs met de wijziging moeten ja geven`;
  if (m[1] === '3')
    return `${naam}: zonder 3/3: het scenario reproduceert niet; wijzig de tekst niet, de eigenaar beslist over het leerpunt`;
  if (![...diff].some(isTekstpad))
    return `${naam}: geen pad onder .claude/agents/, .claude/skills/, .claude/rules/, AGENTS.md of CLAUDE.md toegevoegd of gewijzigd in de diff`;
  return null;
}

const SCENARIO_LABELS = ['Prompt', 'Beginstand', 'Criterium'];
const RUNREGEL = /^(zonder|met)\s+([1-3]):\s*(ja|nee)\s*[—–-]\s*\S.*$/i;

/** Een regel zonder opsommingsteken, nummer of `**` (zoals `onderbouwingFouten`). @param {string} regel */
function kaal(regel) {
  return regel
    .replace(/^\s*(?:[-*]|\d+\.)\s+/, '')
    .replaceAll('**', '')
    .trim();
}

/**
 * De regels van het blok `### Scenario #<nr>` binnen `## Leerpunt`, tot de volgende kop van niveau 1 tot en met 3, of null.
 * @param {string} body @param {number} nummer @returns {string[] | null}
 */
function scenarioBlok(body, nummer) {
  const regels = body.replaceAll('\r\n', '\n').split('\n');
  const start = regels.findIndex((regel) => /^##\s+Leerpunt\s*$/.test(regel));
  if (start === -1) return null;
  const sectie = regels.slice(start + 1);
  const eind = sectie.findIndex((regel) => /^#{1,2}\s/.test(regel));
  const binnen = eind === -1 ? sectie : sectie.slice(0, eind);
  const kop = binnen.findIndex((regel) => {
    const m = /^###\s+Scenario\s+#(\d+)\s*$/.exec(regel);
    return m !== null && Number(m[1]) === nummer;
  });
  if (kop === -1) return null;
  const rest = binnen.slice(kop + 1);
  const volgende = rest.findIndex((regel) => /^#{1,3}\s/.test(regel));
  return (volgende === -1 ? rest : rest.slice(0, volgende)).map(kaal);
}

/** De labels zonder waarde: een waarde loopt door tot het volgende label of de eerste runregel. @param {string[]} blok */
function legeLabels(blok) {
  /** @type {Map<string, string>} */
  const waarden = new Map();
  let huidig = '';
  for (const regel of blok) {
    const label = /^(Prompt|Beginstand|Criterium):\s*(.*)$/.exec(regel);
    if (label !== null) {
      huidig = label[1] ?? '';
      waarden.set(huidig, label[2] ?? '');
    } else if (/^(zonder|met)\s+\d/i.test(regel)) huidig = '';
    else if (huidig !== '') waarden.set(huidig, `${waarden.get(huidig) ?? ''} ${regel}`);
  }
  return SCENARIO_LABELS.filter((label) => (waarden.get(label) ?? '').trim() === '');
}

/**
 * Het aantal ja per soort uit precies één runregel per `zonder 1-3` en `met 1-3`, of null als dat niet klopt.
 * @param {string[]} blok @returns {{ zonder: number, met: number } | null}
 */
function runTellingen(blok) {
  const kandidaten = blok.filter((regel) => /^(zonder|met)\s+\d/i.test(regel));
  const runs = kandidaten.map((regel) => RUNREGEL.exec(regel));
  if (kandidaten.length !== 6 || runs.some((m) => m === null)) return null;
  const sleutels = new Set(runs.map((m) => `${(m?.[1] ?? '').toLowerCase()} ${m?.[2] ?? ''}`));
  if (sleutels.size !== 6) return null;
  const ja = (/** @type {string} */ soort) =>
    runs.filter((m) => (m?.[1] ?? '').toLowerCase() === soort && (m?.[3] ?? '').toLowerCase() === 'ja').length;
  return { zonder: ja('zonder'), met: ja('met') };
}

/**
 * Toets het scenarioblok bij een `baseline:`-regel (spec gedragsbaseline AC-4): eerst de kop, dan de labels (één fout per
 * label), dan de runregels, dan de tellingen tegen de bewijsregel.
 * @param {string} body @param {Regel} regel @returns {string[]}
 */
export function scenarioFout(body, regel) {
  const naam = `#${String(regel.nummer)}`;
  const blok = scenarioBlok(body, regel.nummer);
  if (blok === null) return [`${naam}: geen blok "### Scenario ${naam}" in de sectie ## Leerpunt`];
  const leeg = legeLabels(blok);
  if (leeg.length > 0) return leeg.map((label) => `${naam}: scenario zonder ${label}`);
  const tel = runTellingen(blok);
  if (tel === null) return [`${naam}: scenario heeft niet precies één runregel voor zonder 1-3 en met 1-3`];
  const m = BASELINE.exec(regel.baseline ?? '');
  const a = Number(m?.[1] ?? '0');
  const b = Number(m?.[2] ?? '0');
  if (tel.zonder === a && tel.met === b) return [];
  return [
    `${naam}: runregels geven zonder ${String(tel.zonder)}/3, met ${String(tel.met)}/3; de bewijsregel zegt zonder ${String(a)}/3, met ${String(b)}/3`,
  ];
}

/** `<voor> → <na> (<bron>)`: voor en na beginnen met een cijfer, de bron is niet leeg (spec leerlus-herzien AC-3). */
const METING = /^\d[^→>]*?\s*(?:→|->)\s*\d[^→>]*\(\s*\S[^()]*\)\s*$/;

/** @param {Regel} regel @param {string} naam */
function metingFout(regel, naam) {
  if (regel.trede !== PLEK_SCHRAPPEN) return `${naam}: "meting:" hoort alleen bij trede ${PLEK_SCHRAPPEN}`;
  if (regel.meting === null) return `${naam}: bij ${PLEK_SCHRAPPEN} is het bewijs "meting: <voor> → <na> (<bron>)"`;
  if (!METING.test(regel.meting))
    return `${naam}: meting "${regel.meting}" heeft niet de vorm <voor> → <na> (<bron>), met getallen voor en na`;
  return null;
}

/**
 * Het plan van de bewijsjob (AC-1, AC-2, AC-4): welke leerpunten de PR sluit, of elk een geldige regel heeft, en welke
 * testbestanden op basis en head draaien.
 * Bij trede `Schrappen of vereenvoudigen` moet het issue zelf die plek hebben (spec leerlus-herzien AC-3).
 * @param {{ gesloten: { nummer: number, labels: string[], body?: string }[], body: string, diff: string[] }} invoer
 */
export function bewijsPlan({ gesloten, body, diff }) {
  const issues = gesloten.filter(({ labels }) => labels.includes('leerpunt'));
  const leerpunten = issues.map(({ nummer }) => nummer);
  const regels = leesLeerpuntSectie(body);
  const set = new Set(diff);
  /** @type {string[]} */
  const fouten = [];
  /** @type {{ pad: string, soort: string }[]} */
  const runs = [];
  for (const nummer of leerpunten) {
    const regel = regels.find((r) => r.nummer === nummer);
    if (regel === undefined) {
      fouten.push(`#${String(nummer)}: geen regel "- #${String(nummer)}: …" in de sectie ## Leerpunt`);
      continue;
    }
    const issueBody = issues.find((issue) => issue.nummer === nummer)?.body ?? '';
    const fout =
      regelFout(regel, set) ??
      (regel.trede === PLEK_SCHRAPPEN && plekVan(issueBody) !== PLEK_SCHRAPPEN
        ? `#${String(nummer)}: het issue heeft een andere plek dan ${PLEK_SCHRAPPEN}`
        : null);
    if (fout !== null) fouten.push(fout);
    else if (regel.baseline !== null) fouten.push(...scenarioFout(body, regel));
    else if (regel.pad !== null && !runs.some((run) => run.pad === regel.pad))
      runs.push({ pad: regel.pad, soort: soortBewijs(regel.pad) ?? 'unit' });
  }
  // Leerpunt #717: een regel voor een issue dat de PR niet sluit, draait geen proef en sluit het issue niet bij de merge.
  const sluit = new Set(gesloten.map(({ nummer }) => nummer));
  for (const { nummer } of regels.filter((r) => !sluit.has(r.nummer)))
    fouten.push(
      `#${String(nummer)}: staat in ## Leerpunt, maar de PR sluit het niet; voeg "Closes #${String(nummer)}" toe aan de beschrijving`,
    );
  return { leerpunten, fouten, runs };
}

/** @param {unknown} test */
function isAssertie(test) {
  const melding = String(lijst(veld(test, 'failureMessages'))[0] ?? '');
  return /^AssertionError\b/.test(melding);
}

/**
 * Uitslag van één vitest-run uit het JSON-verslag, alleen voor het bewijsbestand (vitest filtert op deelstring, dus
 * `a.test.ts` neemt ook `a.test.tsx` mee). Een gefaalde test telt alleen als assertie bij een `AssertionError`; elke andere
 * fout is een laadfout. Zo telt een ontbrekende export op de basis (`TypeError: … is not a function`, vite geeft `undefined`
 * in plaats van een importfout) niet als bewijs (spec randgeval "nieuwe helper die op de basis niet bestaat").
 * @param {unknown} verslag @param {string} pad @returns {RunUitslag}
 */
export function leesVitest(verslag, pad) {
  const resultaten = lijst(veld(verslag, 'testResults')).filter((r) => {
    const naam = String(veld(r, 'name') ?? '').replaceAll('\\', '/');
    return naam === pad || naam.endsWith(`/${pad}`);
  });
  let assertieFouten = 0;
  let geslaagd = 0;
  let laadFout = resultaten.length === 0;
  for (const bestand of resultaten) {
    const tests = lijst(veld(bestand, 'assertionResults'));
    geslaagd += tests.filter((a) => veld(a, 'status') === 'passed').length;
    const gefaald = tests.filter((a) => veld(a, 'status') === 'failed');
    const asserties = gefaald.filter(isAssertie).length;
    assertieFouten += asserties;
    if (asserties < gefaald.length || (veld(bestand, 'status') === 'failed' && gefaald.length === 0)) laadFout = true;
  }
  // Alles overgeslagen is geen groen: er moet minstens één test echt slagen.
  if (!laadFout && assertieFouten === 0 && geslaagd === 0) laadFout = true;
  return { status: laadFout ? 'laadfout' : assertieFouten > 0 ? 'rood' : 'groen', assertieFouten, laadFout };
}

/** tsc-codes voor een ontbrekend bestand of een ontbrekende export: geen bewijs (AC-3). */
export const TYPE_LAADFOUT = /\berror TS(2305|2307|2614|2724|2792|6053)\b/;

/** tsc-codes van een onbruikbare projectconfiguratie (pad bestaat niet, onleesbaar, geen invoer): geen bewijs (#814). */
const TYPE_CONFIGFOUT = new Set(['5058', '5083', '18003']);

/**
 * Uitslag van een typetest uit de exitstatus en uitvoer van `tsc` (AC-3): 0 is groen; een ontbrekend bestand of een
 * ontbrekende export is een laadfout; een compiler die niet startte, een uitvoer zonder `error TS`-diagnose of alleen
 * configuratiefouten ook (leerpunt #814); elke andere compileerfout is rood.
 * @param {number | null} status @param {string} uitvoer @returns {RunUitslag}
 */
export function typeUitslag(status, uitvoer) {
  if (status === 0) return { status: 'groen', assertieFouten: 0, laadFout: false };
  const laadfout = { status: 'laadfout', assertieFouten: 0, laadFout: true };
  if (status === null || TYPE_LAADFOUT.test(uitvoer)) return laadfout;
  const codes = [...uitvoer.matchAll(/\berror TS(\d+)\b/g)].map(([, code = '']) => code);
  if (codes.every((code) => TYPE_CONFIGFOUT.has(code))) return laadfout;
  return { status: 'rood', assertieFouten: 1, laadFout: false };
}

/**
 * Het oordeel over één bewijsbestand (AC-3): op de basis rood op een assertie (bij een typetest: rood), op de head groen.
 * @param {{ pad: string, soort: string }} run @param {{ basis: RunUitslag, head: RunUitslag }} uitslag
 * @returns {string | null} fout of null
 */
export function runOordeel(run, { basis, head }) {
  const beide = `basis ${basis.status}, head ${head.status}`;
  if (head.status !== 'groen') return `${run.pad}: faalt op de head (${beide})`;
  if (basis.status === 'groen') return `${run.pad}: slaagt ook op de basis (${beide})`;
  if (basis.laadFout)
    return `${run.pad}: faalt op de basis op laden, niet op een assertie (${beide}); importeert de bewijstest iets dat nog niet op de basis staat, zet een nieuwe helper dan in het testbestand zelf (spec leerlus-bewijs, leerpunt #892)`;
  return null;
}

/**
 * Het sluitoordeel (AC-6): gemergde PR die het issue sluit met een regel voor dit nummer in `## Leerpunt`, of een comment
 * `achterhaald: <reden>` van een auteur met schrijfrecht.
 * @param {number} nummer
 * @param {{ prs: { merged: boolean, body: string }[], comments: { body: string, association: string }[] }} bron
 * @returns {'bewijs' | 'achterhaald' | 'zonder-bewijs'}
 */
export function sluitOordeel(nummer, { prs, comments }) {
  const metBewijs = prs.some(
    ({ merged, body }) => merged && leesLeerpuntSectie(body).some((regel) => regel.nummer === nummer),
  );
  if (metBewijs) return 'bewijs';
  const achterhaald = comments.some(
    ({ body, association }) => /^\s*achterhaald:\s*\S/i.test(body) && SCHRIJFRECHT.includes(association),
  );
  return achterhaald ? 'achterhaald' : 'zonder-bewijs';
}

/**
 * Het `data`-deel van een GraphQL-antwoord, of een fout. GitHub geeft bij een fout vaak HTTP 200 met `errors`; zonder deze
 * toets zou ontbrekende data als een lege lijst tellen en een verplichte check stil slagen.
 * @param {unknown} antwoord @param {string[]} pad sleutels onder `data` die er moeten zijn @returns {unknown}
 */
export function graphqlData(antwoord, pad) {
  const fouten = lijst(veld(antwoord, 'errors'));
  if (fouten.length > 0)
    throw new Error(`GraphQL: ${fouten.map((f) => String(veld(f, 'message') ?? 'fout')).join('; ')}`);
  let deel = veld(antwoord, 'data');
  for (const sleutel of pad) {
    deel = veld(deel, sleutel);
    if (typeof deel !== 'object' || deel === null) throw new Error(`GraphQL: geen ${sleutel} in het antwoord`);
  }
  return veld(antwoord, 'data');
}

/**
 * Een vitest-uitslag samen met de exitstatus: groen telt alleen bij status 0. Een run die faalt zonder gefaalde assertie
 * (bijv. een onafgehandelde fout) is geen bewijs op de basis en geen groen op de head: laadfout.
 * @param {RunUitslag} uitslag @param {number | null} status @returns {RunUitslag}
 */
export function metExit(uitslag, status) {
  return status !== 0 && uitslag.status === 'groen' ? { ...uitslag, status: 'laadfout', laadFout: true } : uitslag;
}

/** @param {unknown} waarde @param {string} sleutel @returns {unknown} */
export function veld(waarde, sleutel) {
  if (typeof waarde !== 'object' || waarde === null) return undefined;
  return Object.entries(waarde).find(([k]) => k === sleutel)?.[1];
}

/** @param {unknown} waarde @returns {unknown[]} */
export function lijst(waarde) {
  return Array.isArray(waarde) ? waarde : [];
}
