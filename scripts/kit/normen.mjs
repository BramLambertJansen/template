// Krimpcontrole op normen (ADR 0067, spec krimp-op-normen): elke R-id die uit het regelboek verdwijnt, staat op de vaste lijst
// `docs/normen-vervallen.md`; de bytedrempel blijft voor normen zonder R-id. Puur: de git-kant staat in `leesbudget.mjs`.
//  - Definitie (AC-1): een regel buiten een codeblok en HTML-commentaar die exact begint met `- **R-<GROEP>-<n>[letter]**`.
//    Lijkt een regel op een definitie maar voldoet hij niet, staat een R-id er twee keer, of volgt een ingesprongen
//    vervolgregel, dan is dat rood.
//  - Lijst (AC-2, AC-4): uitleg vóór de eerste `## `-kop, daarna alleen `## <pad>`, `- <oud> → <doel>` en lege regels; hij
//    krimpt nooit. Een doel is een gedefinieerde R-id, `geschrapt: <reden van minstens drie woorden>`, of een R-id die via
//    de lijst daarop uitkomt.
//  - Bytes (AC-3): een bindend document dat meer dan 20 % en minstens 1 KB krimpt, vraagt een nieuwe regel onder `## <pad>`.

/** @typedef {{ key: string, message: string }} Violation */
/** @typedef {{ oud: string, doel: string }} Regel */
/** @typedef {{ intro: string[], secties: Map<string, Regel[]>, fouten: string[] }} Lijst */

export const LIJST = 'docs/normen-vervallen.md';
export const REGELBOEK = 'docs/framework.md';
const KB = 1024;

/** Het enige patroon van een definitie (krimp-op-normen/AC-1). */
export const DEFINITIE = /^- \*\*(R-[A-Z]+-\d+[a-z]?)\*\*(?=\s|$)/;
const LIJKT_OP_DEFINITIE = /^\s*[-*]\s+\*\*\s*R-/;
const R_ID = /^R-[A-Z]+-\d+[a-z]?$/;
const PIJL = ' → ';

/**
 * De regels buiten codeblokken (```` ``` ````, `~~~`) en HTML-commentaar, met hun regelnummer.
 * @param {string} tekst @returns {{ regel: string, nr: number }[]}
 */
export function zichtbareRegels(tekst) {
  /** @type {{ regel: string, nr: number }[]} */
  const uit = [];
  let blok = '';
  let commentaar = false;
  tekst.split('\n').forEach((regel, index) => {
    const hek = /^\s*(`{3,}|~{3,})/.exec(regel)?.[1]?.slice(0, 3) ?? '';
    if (!commentaar && hek !== '' && (blok === '' || blok === hek)) blok = blok === '' ? hek : '';
    else if (blok === '' && (commentaar || regel.includes('<!--'))) commentaar = !regel.includes('-->');
    else if (blok === '') uit.push({ regel, nr: index + 1 });
  });
  return uit;
}

/**
 * De R-id's die het regelboek definieert (met hun regel) en de fouten van AC-1.
 * @param {string} tekst @returns {{ ids: Map<string, string>, fouten: string[] }}
 */
export function definities(tekst) {
  /** @type {Map<string, string>} */
  const ids = new Map();
  /** @type {string[]} */
  const fouten = [];
  let vorige = false;
  for (const { regel, nr } of zichtbareRegels(tekst)) {
    const id = DEFINITIE.exec(regel)?.[1];
    if (vorige && /^\s+\S/.test(regel))
      fouten.push(`regel ${String(nr)}: vervolgregel onder een definitie; een definitie beslaat één regel`);
    vorige = id !== undefined;
    if (id === undefined) {
      if (LIJKT_OP_DEFINITIE.test(regel))
        fouten.push(`regel ${String(nr)}: lijkt op een definitie maar voldoet niet aan \`- **R-<GROEP>-<n>**\``);
      continue;
    }
    if (ids.has(id)) fouten.push(`${id} is meer dan één keer gedefinieerd`);
    ids.set(id, regel);
  }
  return { ids, fouten };
}

/**
 * Leest de lijst (AC-4): uitleg tot de eerste `## `-kop, daarna koppen, lijstregels en lege regels.
 * @param {string} tekst @returns {Lijst}
 */
export function leesLijst(tekst) {
  /** @type {Lijst} */
  const lijst = { intro: [], secties: new Map(), fouten: [] };
  const zichtbaar = zichtbareRegels(tekst);
  if (zichtbaar.length !== tekst.split('\n').length) lijst.fouten.push('bevat een codeblok of HTML-commentaar');
  /** @type {Regel[] | null} */
  let sectie = null;
  for (const { regel, nr } of zichtbaar) {
    const kop = /^## (\S.*?)\s*$/.exec(regel)?.[1];
    if (kop !== undefined) sectie = lijst.secties.get(kop) ?? lijst.secties.set(kop, []).get(kop) ?? [];
    else if (sectie === null) lijst.intro.push(regel);
    else sectieRegel(regel, { sectie, nr, fouten: lijst.fouten });
  }
  if (lijst.intro.some((regel) => /^\s*[-*]\s/.test(regel)))
    lijst.fouten.push('de uitleg vóór de eerste kop bevat lijstregels');
  return lijst;
}

/** @param {string} regel @param {{ sectie: Regel[], nr: number, fouten: string[] }} waar */
function sectieRegel(regel, { sectie, nr, fouten }) {
  if (regel.trim() === '') return;
  const inhoud = /^- (.+)$/.exec(regel)?.[1];
  const pijl = inhoud?.indexOf(PIJL) ?? -1;
  if (inhoud === undefined || pijl <= 0) {
    fouten.push(`regel ${String(nr)}: alleen \`## <pad>\` en \`- <oud> → <doel>\` horen na de uitleg`);
    return;
  }
  sectie.push({ oud: inhoud.slice(0, pijl).trim(), doel: inhoud.slice(pijl + PIJL.length).trim() });
}

/**
 * Waarom een doel ongeldig is, of null (AC-2). Een R-id-doel volgt de keten in de regelboeksectie.
 * @param {string} doel @param {{ gedefinieerd: ReadonlySet<string>, keten: ReadonlyMap<string, string> }} stand
 */
export function doelProbleem(doel, { gedefinieerd, keten }) {
  /** @type {Set<string>} */
  const gezien = new Set();
  let huidig = doel;
  while (R_ID.test(huidig)) {
    if (gedefinieerd.has(huidig)) return null;
    if (gezien.has(huidig)) return `kringverwijzing via ${huidig}`;
    gezien.add(huidig);
    const volgend = keten.get(huidig);
    if (volgend === undefined) return `${huidig} is niet gedefinieerd en staat niet op de lijst`;
    huidig = volgend;
  }
  const reden = /^geschrapt:\s*(.*)$/.exec(huidig)?.[1] ?? '';
  if (/^geschrapt:/.test(huidig))
    return reden.split(/\s+/).filter(Boolean).length >= 3
      ? null
      : 'de reden van schrappen heeft minder dan drie woorden';
  return `"${huidig}" is geen R-id en geen "geschrapt: <reden>"`;
}

/** @param {string} detail @param {string} message @returns {Violation} */
const fout = (detail, message) => ({
  key: `docs:normen:${detail}`,
  message: `${message} (ADR 0067, spec krimp-op-normen)`,
});

/**
 * De lijst zelf (AC-2, AC-4): vorm, doelen, dubbele en nog gedefinieerde R-id's, en krimp tegenover de basis.
 * @param {{ lijst: Lijst, basis: Lijst | null, gedefinieerd: ReadonlySet<string> }} stand
 * @returns {Violation[]}
 */
export function lijstViolations({ lijst, basis, gedefinieerd }) {
  const boek = lijst.secties.get(REGELBOEK) ?? [];
  const keten = new Map(boek.map(({ oud, doel }) => [oud, doel]));
  // Onder het regelboek mag ook een norm zonder R-id staan (AC-3); alleen R-id's links tellen voor keten en dubbel.
  const links = boek.map(({ oud }) => oud).filter((oud) => R_ID.test(oud));
  return [
    ...lijst.fouten.map((tekst) => fout(`vorm:${tekst}`, `${LIJST}: ${tekst}`)),
    ...[...new Set(links.filter((id, i) => links.indexOf(id) !== i))].map((id) =>
      fout(`dubbel:${id}`, `${LIJST}: ${id} staat er twee keer`),
    ),
    ...links
      .filter((id) => gedefinieerd.has(id))
      .map((id) => fout(`bestaat:${id}`, `${LIJST}: ${id} is nog gedefinieerd in ${REGELBOEK}`)),
    ...[...lijst.secties].flatMap(([pad, regels]) =>
      regels.flatMap(({ oud, doel }) => {
        const probleem = doelProbleem(doel, { gedefinieerd, keten });
        return probleem === null ? [] : [fout(`doel:${pad}:${oud}`, `${LIJST}: ${oud} (${pad}): ${probleem}`)];
      }),
    ),
    ...krimpVanLijst(lijst, basis),
  ];
}

/** Elke kop en regel van de basis staat er nog, onder dezelfde kop (AC-4). @param {Lijst} lijst @param {Lijst | null} basis */
function krimpVanLijst(lijst, basis) {
  if (basis === null) return [];
  return [...basis.secties].flatMap(([pad, regels]) => {
    const nu = lijst.secties.get(pad);
    if (nu === undefined) return [fout(`weg:${pad}`, `${LIJST}: de kop "## ${pad}" verdween; de lijst krimpt nooit`)];
    // Wat de basis had en nu ontbreekt (als multiset): verdwenen of veranderd.
    return nieuweRegels(nu, regels).map((r) =>
      fout(
        `weg:${pad}:${r.oud}`,
        `${LIJST}: de regel "${r.oud} → ${r.doel}" verdween of veranderde; de lijst krimpt nooit`,
      ),
    );
  });
}

/**
 * Regels van `na` die niet in `voor` staan (als multiset): wat deze PR toevoegt.
 * @param {readonly Regel[]} voor @param {readonly Regel[]} na
 */
export function nieuweRegels(voor, na) {
  /** @type {Map<string, number>} */
  const tel = new Map();
  for (const r of voor) tel.set(`${r.oud}${PIJL}${r.doel}`, (tel.get(`${r.oud}${PIJL}${r.doel}`) ?? 0) + 1);
  return na.filter((r) => {
    const sleutel = `${r.oud}${PIJL}${r.doel}`;
    const over = tel.get(sleutel) ?? 0;
    if (over > 0) tel.set(sleutel, over - 1);
    return over === 0;
  });
}

/** Een bindend document (ADR 0065 punt 6, ADR 0067 punt 3). @param {string} file */
export function bindend(file) {
  return [REGELBOEK, 'AGENTS.md', 'CLAUDE.md', 'docs/dod.md'].includes(file) || file.startsWith('.claude/rules/');
}

/**
 * Bindende documenten die meer dan 20 % en minstens 1 KB krompen zonder nieuwe regel onder hun kop (AC-3).
 * @param {{ oud: Record<string, number>, nieuw: Record<string, number> }} bytes @param {{ lijst: Lijst, basis: Lijst | null }} lijsten
 * @returns {Violation[]}
 */
export function byteViolations({ oud, nieuw }, { lijst, basis }) {
  return Object.entries(oud)
    .filter(
      ([file, voor]) => bindend(file) && (voor - (nieuw[file] ?? 0)) * 5 > voor && voor - (nieuw[file] ?? 0) >= KB,
    )
    .filter(([file]) => nieuweRegels(basis?.secties.get(file) ?? [], lijst.secties.get(file) ?? []).length === 0)
    .map(([file, voor]) =>
      fout(
        `krimp:${file}`,
        `${file}: krimpt van ${String(voor)} naar ${String(nieuw[file] ?? 0)} bytes (meer dan 20 % en 1 KB) zonder nieuwe regel onder "## ${file}" in ${LIJST}`,
      ),
    );
}

/**
 * Alle overtredingen van AC-1 tot en met AC-4, puur. `boek` en `lijst` zijn de teksten (null: het bestand ontbreekt).
 * @param {{ boek: { oud: string | null, nieuw: string | null }, lijst: { oud: string | null, nieuw: string | null }, bytes: { oud: Record<string, number>, nieuw: Record<string, number> } }} invoer
 * @returns {Violation[]}
 */
export function normViolations({ boek, lijst, bytes }) {
  const nu = definities(boek.nieuw ?? '');
  const toen = definities(boek.oud ?? '');
  const lijstNu = leesLijst(lijst.nieuw ?? '');
  const basis = lijst.oud === null ? null : leesLijst(lijst.oud);
  const gedefinieerd = new Set(nu.ids.keys());
  const opLijst = new Set((lijstNu.secties.get(REGELBOEK) ?? []).map(({ oud }) => oud));
  return [
    ...nu.fouten.map((tekst) => fout(`definitie:${tekst}`, `${REGELBOEK}: ${tekst}`)),
    ...[...toen.ids.keys()]
      .filter((id) => !gedefinieerd.has(id) && !opLijst.has(id))
      .map((id) =>
        fout(
          `vervallen:${id}`,
          `${REGELBOEK}: ${id} verdween zonder regel "${id} → <R-id>" of "${id} → geschrapt: <reden>" onder "## ${REGELBOEK}" in ${LIJST}`,
        ),
      ),
    ...lijstViolations({ lijst: lijstNu, basis, gedefinieerd }),
    ...byteViolations(bytes, { lijst: lijstNu, basis }),
  ];
}

/**
 * Meldingen (AC-6): elke R-id waarvan de definitieregel veranderde; nooit een overtreding.
 * @param {{ oud: string | null, nieuw: string | null }} boek @returns {string[]}
 */
export function normMeldingen(boek) {
  if (boek.oud === null || boek.nieuw === null) return [];
  const nu = definities(boek.nieuw).ids;
  return [...definities(boek.oud).ids]
    .filter(([id, regel]) => nu.has(id) && nu.get(id) !== regel)
    .map(
      ([id]) =>
        `let op: de tekst van ${id} veranderde; de reviewer toetst of de norm niet is uitgehold (krimp-op-normen/AC-6)`,
    );
}
