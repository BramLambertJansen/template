// Voorwaardelijk geregistreerde tests (spec voorwaardelijke-tests, leerpunt #410): een pass over de tokens van
// testteller.mjs die per token zegt of een aanroep daar voorwaardelijk loopt (binnen `if`/`else`/`switch`/`catch`, na
// kortsluiting of een ternary, of na een `return`/`throw` in dezelfde of een omsluitende functie), en die `test` als waarde
// telt. Lussen en `try`/`finally` tellen niet (OV-2). Lexicaal, zonder dependency (ADR 0045 punt 15–19).

/** @typedef {{ soort: 'naam' | 'teken' | 'literal', tekst: string }} Token */
/** @typedef {{ soort: 'functie' | 'voorwaarde' | 'neutraal', naReturn: boolean }} Blok */

const VOORWAARDE_HAAKJES = new Set(['if', 'switch', 'catch']);
const LUS_HAAKJES = new Set(['for', 'while', 'with']);
const NEUTRAAL_WOORDEN = new Set(['try', 'finally', 'do']);
const TESTNAMEN = new Set(['test', 'it', 'describe', 'suite']);
/** Na deze woorden is de naam een declaratie, import of type, geen waarde (AC-2). */
const GEEN_WAARDE_NA = new Set([
  'const', 'let', 'var', 'function', 'typeof', 'export', 'import', 'as', 'of', 'in', 'type', 'interface', 'class',
]);
const DECLARATIE_LIJST = new Set(['import', 'export', 'const', 'let', 'var']);

/** @param {Token | undefined} token @param {string} tekst */
function teken(token, tekst) {
  return token?.soort === 'teken' && token.tekst === tekst;
}

/** @param {Token | undefined} token @param {string} tekst */
function naam(token, tekst) {
  return token?.soort === 'naam' && token.tekst === tekst;
}

/** Per `)` de bijbehorende `(`. @param {Map<number, number>} paren */
function openers(paren) {
  /** @type {Map<number, number>} */
  const open = new Map();
  for (const [o, s] of paren) open.set(s, o);
  return open;
}

/** Het woord vóór de `(` die bij de `)` op `index` hoort. @param {Token[]} tokens @param {number} index @param {Map<number, number>} open */
function haakjesWoord(tokens, index, open) {
  const o = open.get(index);
  const voor = o === undefined ? undefined : tokens[o - 1];
  return voor?.soort === 'naam' ? voor.tekst : null;
}

/** Soort van het blok dat met de `{` op `index` opent (AC-1c: elke andere `{` is een functiegrens). @param {Token[]} tokens @param {number} index @param {Map<number, number>} open @returns {Blok['soort']} */
function bloksoort(tokens, index, open) {
  const vorige = tokens[index - 1];
  if (naam(vorige, 'else') || naam(vorige, 'catch')) return 'voorwaarde';
  if (vorige?.soort === 'naam' && NEUTRAAL_WOORDEN.has(vorige.tekst)) return 'neutraal';
  if (!teken(vorige, ')')) return 'functie';
  const woord = haakjesWoord(tokens, index - 1, open);
  if (woord !== null && VOORWAARDE_HAAKJES.has(woord)) return 'voorwaarde';
  return woord !== null && LUS_HAAKJES.has(woord) ? 'neutraal' : 'functie';
}

/** De laatste index van de aanroepketen vanaf `start` (`a.b(…)(…)`, getagde template). @param {Token[]} tokens @param {number} start @param {Map<number, number>} paren */
function ketenEind(tokens, start, paren) {
  let j = start + 1;
  for (;;) {
    const token = tokens[j];
    if (teken(token, '.') && tokens[j + 1]?.soort === 'naam') j += 2;
    else if (teken(token, '.') && teken(tokens[j + 1], '(')) j += 1;
    else if (teken(token, '(')) j = (paren.get(j) ?? tokens.length) + 1;
    else if (token?.soort === 'literal' && token.tekst === '`') j += 1;
    else return j - 1;
  }
}

/** Volgt de keten op kortsluiting (`&&`, `||`, `??`) of op `?`/`:` van een ternary (AC-1b)? @param {Token[]} tokens @param {number} index */
function naKortsluiting(tokens, index) {
  const vorige = tokens[index - 1];
  const ervoor = tokens[index - 2];
  if (teken(vorige, '&')) return teken(ervoor, '&');
  if (teken(vorige, '|')) return teken(ervoor, '|');
  return teken(vorige, '?') || teken(vorige, ':');
}

/** Begint op `index + 1` een body zonder accolades van `if (…)` of `else`? @param {Token[]} tokens @param {number} index @param {Map<number, number>} open */
function losseBody(tokens, index, open) {
  const token = tokens[index];
  const volgende = tokens[index + 1];
  if (volgende?.soort !== 'naam' || volgende.tekst === 'if') return false;
  if (naam(token, 'else')) return true;
  return teken(token, ')') && haakjesWoord(tokens, index, open) === 'if';
}

/**
 * Per token: loopt een aanroep die hier begint voorwaardelijk (AC-1)?
 * @param {Token[]} tokens @param {Map<number, number>} paren @returns {boolean[]}
 */
export function voorwaardelijkeTokens(tokens, paren) {
  const open = openers(paren);
  /** @type {Blok[]} */
  const blokken = [{ soort: 'functie', naReturn: false }];
  /** @type {Array<[number, number]>} */
  const bereiken = [];
  return tokens.map((token, index) => {
    const losstaand = token.soort === 'naam' && !teken(tokens[index - 1], '.');
    if (losstaand && naKortsluiting(tokens, index)) bereiken.push([index, ketenEind(tokens, index, paren)]);
    const uitslag =
      blokken.some((blok) => blok.soort === 'voorwaarde' || blok.naReturn) ||
      bereiken.some(([van, tot]) => van <= index && index <= tot);
    stap({ tokens, index, open, paren }, blokken, bereiken);
    return uitslag;
  });
}

/**
 * Werkt blokken en bereiken bij na het token op `index`.
 * @param {{ tokens: Token[], index: number, open: Map<number, number>, paren: Map<number, number> }} plek
 * @param {Blok[]} blokken @param {Array<[number, number]>} bereiken
 */
function stap({ tokens, index, open, paren }, blokken, bereiken) {
  const token = tokens[index];
  if (teken(token, '{')) blokken.push({ soort: bloksoort(tokens, index, open), naReturn: false });
  else if (teken(token, '}') && blokken.length > 1) blokken.pop();
  else if ((naam(token, 'return') || naam(token, 'throw')) && !teken(tokens[index - 1], '.')) {
    const functie = blokken.findLast((blok) => blok.soort === 'functie');
    if (functie !== undefined) functie.naReturn = true;
  }
  if (losseBody(tokens, index, open)) bereiken.push([index + 1, ketenEind(tokens, index + 1, paren)]);
}

/** Staat de naam in een import-, export- of destructuringlijst (`import { test } from …`)? @param {Token[]} tokens @param {number} index */
function inDeclaratieLijst(tokens, index) {
  let j = index - 1;
  while (tokens[j]?.soort === 'naam' || teken(tokens[j], ',') || teken(tokens[j], ':')) j -= 1;
  const voor = tokens[j - 1];
  return teken(tokens[j], '{') && voor?.soort === 'naam' && DECLARATIE_LIJST.has(voor.tekst);
}

/** Staat de naam in de parameterlijst van een arrow-functie (`(it) => it.id`)? @param {Token[]} tokens @param {number} index @param {Map<number, number>} paren */
function inArrowParameters(tokens, index, paren) {
  let diepte = 0;
  for (let j = index - 1; j >= 0; j -= 1) {
    if (teken(tokens[j], ')')) diepte += 1;
    if (teken(tokens[j], '(')) {
      if (diepte === 0) {
        const sluit = paren.get(j) ?? tokens.length;
        return teken(tokens[sluit + 1], '=') && teken(tokens[sluit + 2], '>');
      }
      diepte -= 1;
    }
  }
  return false;
}

/** Staat er vóór de naam een `.` of een declaratiewoord (`const`, `typeof`, `import` …)? @param {Token | undefined} vorige */
function declaratieErvoor(vorige) {
  return teken(vorige, '.') || (vorige?.soort === 'naam' && GEEN_WAARDE_NA.has(vorige.tekst));
}

/** Wordt de naam aangeroepen, gevolgd door een eigenschap of typeargumenten, of als sleutel/parameter genoemd? @param {Token[]} tokens @param {number} index */
function aanroepOfSleutel(tokens, index) {
  const vorige = tokens[index - 1];
  const volgende = tokens[index + 1];
  if (teken(volgende, '.') || teken(volgende, '(') || teken(volgende, '<')) return true;
  if (volgende?.soort === 'literal' && volgende.tekst === '`') return true;
  if (teken(volgende, '=')) return !teken(tokens[index + 2], '=');
  const sleutel = teken(vorige, '(') || teken(vorige, ',') || teken(vorige, '{');
  return sleutel && (teken(volgende, ':') || (teken(volgende, '?') && teken(tokens[index + 2], ':')));
}

/** Aantal plekken waar `test`, `it`, `describe` of `suite` als waarde staat (AC-2). @param {Token[]} tokens @param {Map<number, number>} paren */
export function testAlsWaarde(tokens, paren) {
  let aantal = 0;
  tokens.forEach((token, index) => {
    if (token.soort !== 'naam' || !TESTNAMEN.has(token.tekst) || declaratieErvoor(tokens[index - 1])) return;
    if (aanroepOfSleutel(tokens, index)) return;
    if (inDeclaratieLijst(tokens, index) || inArrowParameters(tokens, index, paren)) return;
    aantal += 1;
  });
  return aantal;
}
