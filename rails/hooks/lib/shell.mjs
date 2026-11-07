// Kleine shell-lezer voor het rolhek (framework §8, ADR 0045): splitst een Bash-commando in losse commando's (`;`, `&&`, `||`,
// `|`, `&`, regeleinde), haalt aanhalingstekens weg, slaat heredoc-teksten over en verzamelt redirect-doelen. Bewust geen
// volledige shell: wat tekstheuristiek niet vangt (`bash -c`, `node -e`, `$(…)`), vangt de diff-guard in CI.

/**
 * @typedef {{ words: string[], redirects: string[], expanded?: string[], patterns?: string[], raws?: string[], ruim?: boolean }} Command
 * `raws`: per woord van `words` (zelfde index) de ruwe tekst zoals in het commando, met quotes en escapes.
 * `expanded`: woorden waarin de shell nog uitbreidt (`$` of een backtick buiten enkele aanhalingstekens, ook `$'…'`); hun
 * waarde hier is dus niet wat het programma krijgt.
 * `patterns`: per woord van `words` (zelfde index) de vorm waarin glob-, brace- en tildetekens tussen aanhalingstekens of na
 * een backslash `QUOTED` zijn; bash expandeert die daar niet (spec rolhek-vooraf-krimp AC-10 (b)).
 * `ruim`: het commando (of de substitutie eromheen) bevat een `\`, `'` of `"`; een glob-klasse in een woord of redirect leest
 * dan ruim (`globTekstRegex`; review B3, #622, AC-3, eigenaarbesluit 7 november 2026).
 */
/** @typedef {{ kind: 'word' | 'op', value: string, expands?: boolean, pattern?: string, raw?: string }} Token */

// Staat in `Command.patterns` voor een aangehaald glob-, brace- of tildeteken: zelf geen glob-teken en geen letter van `gh`.
export const QUOTED = '\u0000';
const SEPARATORS = new Set([';', '&&', '||', '|', '&', '|&', '\n', '(', ')']);
const OPERATORS = ['&>>', '>>', '>|', '&>', '>&', '<<-', '<<<', '<<', '<&', '&&', '||', '|&', '<', '>', ';', '|', '&', '(', ')', '\n'];

// Allowlist (eigenaarbesluit 6 november 2026, AC-10 (b)): `patterns` neutraliseert alleen wat deze lezer zeker leest, gewone
// enkele en dubbele aanhalingstekens. Elke constructie die de quotegrenzen kan verschuiven en die de lezer niet volledig kent,
// maakt het hele commando onzeker: `#` (commentaar), `${`, `$'` (ANSI-C), `$(`, `((` (arithmetic, review R4-1), backtick, `\`
// en een newline (heredoc, meerdere regels). Een verkeerde quotegrens zou echte onaangehaalde tekst als aangehaald lezen (reviews B1, R2-B1); dan
// neutraliseert `patterns` niets, ook niet in een substitutie daarbinnen (`onzeker` van de aanroeper). Een quote zonder
// sluitteken hoeft er niet bij: bash voert zo'n commando niet uit.
const ONZEKERE_TEKST = /[#`\\\n]|\$[{'(]|\(\(/;
// Review B3 (#622, eigenaarbesluit 7 november 2026): de tokenizer haalt escapes en aanhalingen weg vóór de glob-omzetting;
// met een van deze tekens in het commando is de klassegrens in een woordwaarde niet meer zeker (`Command.ruim`).
const KLASSE_ONZEKER = /[\\'"]/;

/**
 * @param {string} script
 * @param {boolean} [onzeker] true: `patterns` gelijk aan `words`, ook als `script` zelf geen `ONZEKERE_TEKST` heeft
 * @returns {Command[]}
 */
export function parseCommands(script, onzeker = false) {
  const neutraal = onzeker || ONZEKERE_TEKST.test(script);
  const ruim = onzeker || KLASSE_ONZEKER.test(script);
  /** @type {Command[]} */
  const commands = [];
  /** @type {Command} */
  let current = { words: [], redirects: [], expanded: [], patterns: [], raws: [], ruim };
  /** @type {'redirect' | 'dup' | 'skip' | null} */
  let expect = null;
  for (const token of tokenize(script)) {
    if (token.kind === 'op' && SEPARATORS.has(token.value)) {
      if (current.words.length > 0 || current.redirects.length > 0) commands.push(current);
      current = { words: [], redirects: [], expanded: [], patterns: [], raws: [], ruim };
      expect = null;
    } else if (token.kind === 'op') {
      // `<`, `<<<`, `<<` en kopieën van een descriptor (`>&2`, `2>&1`, `>&-`) schrijven geen bestand; `>&bestand` wel.
      if (token.value === '>&') expect = 'dup';
      else expect = token.value.startsWith('<') || token.value.endsWith('&') ? 'skip' : 'redirect';
    } else {
      if (expect === 'redirect' || (expect === 'dup' && !/^(?:\d+|-)$/.test(token.value))) current.redirects.push(token.value);
      else if (expect === null) {
        current.words.push(token.value);
        current.patterns?.push(neutraal ? token.value : (token.pattern ?? token.value));
        current.raws?.push(token.raw ?? token.value);
      }
      if (token.expands === true) current.expanded?.push(token.value);
      expect = null;
    }
  }
  if (current.words.length > 0 || current.redirects.length > 0) commands.push(current);
  return commands;
}

// `$TMPDIR/`, `"$TMPDIR/` of `"$TMPDIR"/` aan het begin van een woord (spec rolhek-vooraf-krimp OV-6, AC-10 (d)), of een
// woord dat precies `$TMPDIR`, `${TMPDIR}` of `"$TMPDIR"` is (AC-10 (a), eigenaarbesluit 6 november 2026).
const TMPDIR_VOORAAN = /(?<=^|[ \t\n;&|()<>])(?:"?\$TMPDIR"?\/|(?:\$TMPDIR|\$\{TMPDIR\}|"\$TMPDIR")(?=$|[ \t\n;&|()<>]))/g;

/**
 * Of `$TMPDIR` (kaal of met `/…`) in dit commando letterlijk telt: alleen als het commando `TMPDIR` nergens anders noemt
 * (geen `TMPDIR=…`, `export TMPDIR`, `${TMPDIR:-…}`, `$TMPDIRX`). Geef het hele commando, ook bij een substitutie.
 * Dicht falen bij een naam die pas na het weghalen van quotes of escapes `TMPDIR` is (`declare T\MPDIR=x`), en bij elke
 * builtin die een variabelenaam neemt (`NAAM_BUILTINS`, `printf -v`): die kan TMPDIR zetten zonder het letterlijk te noemen
 * (review B2).
 * @param {string} script
 */
export function tmpdirLetterlijk(script) {
  const genoemd = script.match(/TMPDIR/g)?.length ?? 0;
  if (genoemd === 0 || genoemd !== (script.match(TMPDIR_VOORAAN)?.length ?? 0)) return false;
  const woorden = tokenize(script).filter((token) => token.kind === 'word').map((token) => token.value);
  if (woorden.some((woord) => woord.includes('TMPDIR') && !tmpdirWoord(woord))) return false;
  return !parseCommands(script).some(({ words }) => zetVariabele(splitCommand(words).argv));
}

// Builtins die een variabelenaam als woord nemen of tekst als shell uitvoeren, en die dus TMPDIR kunnen zetten of wissen;
// `builtin` en `source`/`.` omdat ze zo'n builtin of een script kunnen starten.
const NAAM_BUILTINS = new Set(['declare', 'typeset', 'local', 'export', 'readonly', 'read', 'unset', 'mapfile', 'readarray',
  'getopts', 'eval', 'builtin', 'source', '.']);

/** Of dit commando een variabele kan zetten of wissen (`NAAM_BUILTINS`, `printf -v`). @param {readonly string[]} argv */
export function zetVariabele(argv) {
  const [woord = '', ...args] = argv;
  return NAAM_BUILTINS.has(woord) || (woord === 'printf' && args.some((arg) => arg.startsWith('-v')));
}

/**
 * Eén teken als letterlijk deel van een reguliere klasse (zonder vlag `u`): een woordteken blijft staan, elk ander teken
 * krijgt een backslash. Zo wordt een `-`, `]`, `^` of `\` nooit syntaxis van de klasse.
 * @param {string} teken
 */
function klasseTeken(teken) {
  return /\w/.test(teken) ? teken : `\\${teken}`;
}

// POSIX-klassen als ASCII-inhoud van een reguliere klasse (al geëscaped). `upper` en `lower` staan apart: de aanroepers
// gebruiken vlag `i`, en `[[:upper:]]` past in bash niet op `l` (spec rolhek-vooraf-krimp AC-3, #618).
/** @type {Readonly<Record<string, string>>} */
const POSIX_KLASSE = {
  alpha: 'A-Za-z', digit: '0-9', alnum: 'A-Za-z0-9', space: ' \\t\\n\\r\\f\\v', blank: ' \\t',
  punct: '!-\\/:-@\\[-`{-~', print: ' -~', graph: '!-~', cntrl: '\\x00-\\x1f\\x7f', xdigit: '0-9A-Fa-f', word: 'A-Za-z0-9_',
};
/** @type {Readonly<Record<string, string>>} */
const POSIX_HOOFDLETTER = { upper: 'A-Z', lower: 'a-z' };

/**
 * `vast`: inhoud van een reguliere klasse, al geëscaped; `hoofd`: upper en lower (hoofdlettergevoelig); `elk`: de klasse
 * past op elk teken; `escape`: de klasse bevat een `\x`.
 * @typedef {{ vast: string, hoofd: string, elk: boolean, escape: boolean }} KlasseDelen
 */

/**
 * Eén atoom van de klasse-inhoud. `teken`: een letterlijk teken (gewoon, uit `\x` of uit `[.x.]`); alleen dit atoom kan
 * een bereik begrenzen. `gelijk`: het teken uit `[=x=]`; `posix`: de naam uit `[:naam:]`; `elk`: een meerletterig
 * `[.naam.]` of `[=naam=]`. `escape`: het atoom kwam uit `\x`.
 * @typedef {{ soort: 'teken' | 'gelijk' | 'posix' | 'elk', waarde: string, escape: boolean }} KlasseAtoom
 */

/**
 * Het atoom bij een afgesloten deel `[:naam:]`, `[=x=]` of `[.x.]` (`soort` is `:`, `=` of `.`). Een meerletterige naam
 * bij `=` of `.` wordt `elk`: bash kent namen als `[.hyphen.]`, en meer treffers is een strenger vangnet (AC-3, #622).
 * @param {string} soort @param {string} naam
 * @returns {KlasseAtoom}
 */
function deelAtoom(soort, naam) {
  if (soort === ':') return { soort: 'posix', waarde: naam, escape: false };
  if (naam.length !== 1) return { soort: 'elk', waarde: '', escape: false };
  return { soort: soort === '.' ? 'teken' : 'gelijk', waarde: naam, escape: false };
}

/**
 * Leest één atoom vanaf `positie`, zoals bash in een klasse: `\x` is het teken x (een `\]` sluit de klasse dus niet). Een
 * deel `[:naam:]`, `[=x=]` of `[.x.]` telt alleen als het gesloten is, anders is de `[` een gewoon teken; een `]` binnen
 * zo'n deel sluit de klasse niet.
 * @param {string} tekst @param {number} positie
 * @returns {{ atoom: KlasseAtoom, na: number }}
 */
function klasseAtoom(tekst, positie) {
  const teken = tekst[positie] ?? '';
  const volgende = tekst[positie + 1] ?? '';
  if (teken === '\\' && volgende !== '') return { atoom: { soort: 'teken', waarde: volgende, escape: true }, na: positie + 2 };
  const sluit = teken === '[' && /[:=.]/.test(volgende) ? tekst.indexOf(`${volgende}]`, positie + 2) : -1;
  if (sluit === -1) return { atoom: { soort: 'teken', waarde: teken, escape: false }, na: positie + 1 };
  return { atoom: deelAtoom(volgende, tekst.slice(positie + 2, sluit)), na: sluit + 2 };
}

/**
 * Een los atoom als inhoud van de klasse; een atoom uit `\x` zet `escape` (zie `klasseUit`). Met een onbekende POSIX-naam
 * past de hele klasse, ook genegeerd, op elk teken (AC-3, #618).
 * @param {KlasseAtoom} atoom @param {KlasseDelen} delen
 */
function voegAtoomToe(atoom, delen) {
  delen.escape ||= atoom.escape;
  if (atoom.soort === 'elk') delen.elk = true;
  else if (atoom.soort !== 'posix') delen.vast += klasseTeken(atoom.waarde);
  else if (Object.hasOwn(POSIX_HOOFDLETTER, atoom.waarde)) delen.hoofd += POSIX_HOOFDLETTER[atoom.waarde] ?? '';
  else if (Object.hasOwn(POSIX_KLASSE, atoom.waarde)) delen.vast += POSIX_KLASSE[atoom.waarde] ?? '';
  else delen.elk = true;
}

/**
 * Leest vanaf `positie` één atoom of één bereik en voegt het toe; geeft de positie erna. Een bereik ontstaat alleen op
 * atoomniveau: een atoom `teken` (ook `[.x.]` of `\x`), dan een echte `-` die niet vlak voor `]` staat, dan een atoom
 * `teken` (of `elk`) als eind. Een `[.-.]` is dus nooit de bereik-`-`. Naast `[=x=]` of `[:naam:]` is een `-` letterlijk
 * (`[a-[:digit:]]` is {a, -, 0-9}): bash leest daar de `[` als eindteken en sluit de klasse eerder, maar dat past alleen op
 * namen met een `]`, en zo past de klasse op meer gewone namen. Een omgekeerd bereik (`z-a`) valt weg: het past in bash
 * op niets, en een reguliere expressie weigert het. Zo is `[z-a]` geen interne fout en past `g[z-ah]` via `h` nog op gh
 * (spec rolhek-vooraf-krimp AC-3 en AC-10 (c), #622). Elk teken staat geëscaped, zodat aan elkaar geplakte stukken nooit
 * een nieuw bereik vormen.
 * @param {string} tekst @param {number} positie @param {KlasseDelen} delen
 */
function klasseStuk(tekst, positie, delen) {
  const begin = klasseAtoom(tekst, positie);
  const streep = begin.na;
  const bereik = begin.atoom.soort === 'teken' && tekst[streep] === '-' && (tekst[streep + 1] ?? ']') !== ']';
  const eind = bereik ? klasseAtoom(tekst, streep + 1) : null;
  if (eind === null || eind.atoom.soort === 'gelijk' || eind.atoom.soort === 'posix') {
    voegAtoomToe(begin.atoom, delen);
    return begin.na;
  }
  const van = begin.atoom;
  const tot = eind.atoom;
  delen.escape ||= van.escape || tot.escape;
  if (tot.soort === 'elk') delen.elk = true;
  else if (van.waarde <= tot.waarde) delen.vast += `${klasseTeken(van.waarde)}-${klasseTeken(tot.waarde)}`;
  return eind.na;
}

/**
 * De reguliere expressie bij de delen van een klasse. Een lege klasse past op niets; een lege negatie op elk teken, zoals
 * `[!z-a]` in bash (een omgekeerd bereik past op niets). Een negatie en `hoofd` staan in `(?-i:…)`: bash telt hoofdletters
 * daar (`[!L]` past op `l`, `[[:upper:]]` niet), en vlag `i` mag dat niet veranderen. Een positieve gewone klasse blijft
 * onder `i`: die past dan op meer, een strenger vangnet. Met een `\x` neemt een positieve klasse ook `\` zelf op: of de
 * tokenizer een rauwe `\` laat staan is niet zeker, en zo past de klasse op x en op `\` (strenger mag, nauwer niet). Een
 * negatie sluit `\` niet extra uit: dat zou haar nauwer maken dan bash.
 * @param {KlasseDelen} delen @param {boolean} negatie
 */
function klasseUit(delen, negatie) {
  const gewoon = delen.vast;
  if (delen.elk) return '[\\s\\S]';
  if (negatie) return gewoon + delen.hoofd === '' ? '[\\s\\S]' : `(?-i:[^${gewoon}${delen.hoofd}])`;
  const positief = delen.escape ? gewoon + klasseTeken('\\') : gewoon;
  const hoofd = delen.hoofd === '' ? '' : `(?-i:[${delen.hoofd}])`;
  const delenUit = [positief === '' ? '' : `[${positief}]`, hoofd].filter((deel) => deel !== '');
  if (delenUit.length === 0) return '(?!)';
  return delenUit.length === 1 ? (delenUit[0] ?? '') : `(?:${delenUit.join('|')})`;
}

/**
 * `klasseUit`, gecontroleerd: is de uitkomst onverwacht geen geldige reguliere expressie, dan past de klasse op elk teken.
 * Dichtvallen is hier meer treffers, zodat een vreemde klasse geen interne fout of sluiproute wordt (#622).
 * @param {KlasseDelen} delen @param {boolean} negatie
 */
function geldigeKlasse(delen, negatie) {
  const regex = klasseUit(delen, negatie);
  try {
    new RegExp(regex, 'i');
    return regex;
  } catch {
    return '[\\s\\S]';
  }
}

/**
 * Een bash-glob-klasse vanaf de `[` op `index` als reguliere expressie (zonder vlag `u`, geschikt voor vlag `i`), of null
 * als er geen sluitende `]` is: dan is de `[` letterlijk (`g[!]`, `[^]h`). Na `[` mag `!` of `^` (negatie) staan; een `]`
 * direct daarna hoort bij de klasse. De inhoud wordt gelezen als atomen (`klasseStuk`): letterlijke tekens, `\x`,
 * `[:naam:]`, `[=x=]` en `[.x.]` (spec rolhek-vooraf-krimp AC-3 en AC-10 (c), leerpunten #618 en #622). Gebruikt door
 * `globTekstRegex`, en via die functie door `globForGh` (rolhek.mjs) en `stukRegex` (zelfladend.mjs).
 * @param {string} tekst @param {number} index
 * @returns {{ regex: string, eind: number } | null} `eind`: de index van de sluitende `]`
 */
export function globKlasseRegex(tekst, index) {
  const negatie = /[!^]/.test(tekst[index + 1] ?? '');
  const begin = index + (negatie ? 2 : 1);
  let positie = begin;
  /** @type {KlasseDelen} */
  const delen = { vast: '', hoofd: '', elk: false, escape: false };
  // Het eerste atoom hoort altijd bij de klasse, ook een `]`; daarna sluit een `]` buiten een atoom de klasse.
  let eerste = true;
  while (positie < tekst.length && (eerste || tekst[positie] !== ']')) {
    positie = klasseStuk(tekst, positie, delen);
    eerste = false;
  }
  if (positie >= tekst.length) return null;
  return { regex: geldigeKlasse(delen, negatie), eind: positie };
}

/**
 * @typedef {{ teken: (teken: string) => string, elk: string, alles: string, ruim: boolean }} GlobOpties
 * `teken`: een teken buiten een klasse als regex (`*`, `?`, letterlijk); `elk`: één willekeurig teken; `alles`: de hele tekst
 * als die te veel lezingen heeft; `ruim`: zie `globTekstRegex`.
 * @typedef {GlobOpties & { memo: Map<number, string>, glob: boolean }} GlobStand
 */

// Bovengrens voor het aantal extra lezingen van een tekst: per `[` die ruim gelezen wordt (`ruimeKlasse`) het aantal latere
// `]`; daarboven past de hele tekst op alles (dicht). Elk vervolg staat één keer per startindex in de memo, dus de regex
// groeit hooguit met dit aantal keer de tekstlengte en blijft zo in de praktijk begrensd (review N1).
const RUIM_MAX = 16;

/**
 * Een glob-tekst (een woordwaarde zonder quotes en escapes) als reguliere expressie, met klassen volgens `globKlasseRegex`.
 * `ruim` (review B3, #622, spec rolhek-vooraf-krimp AC-3 en AC-10 (c), eigenaarbesluit 7 november 2026): het commando had een
 * `\`, `'` of `"`, die de tokenizer al weghaalde; welke `[` een klasse opent en welke `]` haar sluit, is dan niet meer te zien
 * (`.g[\!i]t`, `.gi[a\]t]`, `.gi[t']']`). Dan telt elke `[` met een `]` erna op drie manieren (`ruimeKlasse`): letterlijk,
 * als bash-klasse en als één willekeurig teken tot elke latere `]`. Zo is de regex nooit nauwer dan bash; zonder `[`
 * verandert niets. Bevat de tekst ergens `[=`, `[:` of `[.`, dan leest ze ook zonder `ruim` zo, per hele tekst: bash 5.2
 * en 5.3 lezen een klasse met een benoemd deel verschillend, een misvormd deel kan de sluitende `]` opslokken
 * (`.gi[t[=][x=]`), en de lezer bouwt geen bash-versie na (eigenaarbesluit 7 november 2026, #622).
 * `glob`: de tekst bevat een `*`, `?` of klasse.
 * @param {string} tekst @param {GlobOpties} opties
 * @returns {{ regex: string, glob: boolean }}
 */
export function globTekstRegex(tekst, opties) {
  const ruim = opties.ruim || /\[[=:.]/.test(tekst);
  if (ruimeLezingen(tekst, ruim) > RUIM_MAX) return { regex: opties.alles, glob: true };
  /** @type {GlobStand} */
  const stand = { ...opties, ruim, memo: new Map(), glob: false };
  const regex = regexVanaf(tekst, 0, stand);
  return { regex, glob: stand.glob };
}

/**
 * Het aantal extra lezingen voor `RUIM_MAX`: bij `ruim` per `[` het aantal latere `]`, anders nul. Een `[` binnen een
 * klasse telt ook; dat telt hooguit te veel (dicht).
 * @param {string} tekst @param {boolean} ruim
 */
function ruimeLezingen(tekst, ruim) {
  let aantal = 0;
  if (!ruim) return aantal;
  for (let index = tekst.indexOf('['); index !== -1; index = tekst.indexOf('[', index + 1))
    aantal += tekst.slice(index + 1).split(']').length - 1;
  return aantal;
}

/** @param {string} tekst @param {number} start @param {GlobStand} stand */
function regexVanaf(tekst, start, stand) {
  const bekend = stand.memo.get(start);
  if (bekend !== undefined) return bekend;
  let uit = '';
  let index = start;
  while (index < tekst.length) {
    const teken = tekst[index] ?? '';
    if (teken === '[' && stand.ruim && tekst.includes(']', index + 1)) {
      uit += ruimeKlasse(tekst, index, stand);
      break;
    }
    const klasse = teken === '[' ? globKlasseRegex(tekst, index) : null;
    stand.glob ||= klasse !== null || teken === '*' || teken === '?';
    uit += klasse === null ? stand.teken(teken) : klasse.regex;
    index = klasse === null ? index + 1 : klasse.eind + 1;
  }
  stand.memo.set(start, uit);
  return uit;
}

/**
 * De lezingen van een `[` die ruim gelezen wordt (`globTekstRegex`): letterlijk, als bash-klasse en als één willekeurig
 * teken tot elke `]` erna.
 * @param {string} tekst @param {number} index @param {GlobStand} stand
 */
function ruimeKlasse(tekst, index, stand) {
  stand.glob = true;
  const lezingen = [stand.teken('[') + regexVanaf(tekst, index + 1, stand)];
  const klasse = globKlasseRegex(tekst, index);
  if (klasse !== null) lezingen.push(klasse.regex + regexVanaf(tekst, klasse.eind + 1, stand));
  for (let sluit = tekst.indexOf(']', index + 1); sluit !== -1; sluit = tekst.indexOf(']', sluit + 1))
    lezingen.push(stand.elk + regexVanaf(tekst, sluit + 1, stand));
  return `(?:${lezingen.join('|')})`;
}

/**
 * Een woord (waarde uit `Command.words`) dat `$TMPDIR` of `${TMPDIR}` is, of met `$TMPDIR/` begint en daarna niets meer
 * expandeert. Telt alleen samen met `tmpdirLetterlijk`.
 * @param {string} word
 */
export function tmpdirWoord(word) {
  return /^(?:\$TMPDIR|\$\{TMPDIR\})$|^\$TMPDIR\/[^$`]*$/.test(word);
}

/**
 * @param {string} script
 * @returns {Token[]}
 */
export function tokenize(script) {
  /** @type {Token[]} */
  const tokens = [];
  /** @type {{ delimiter: string, strip: boolean }[]} */
  const heredocs = [];
  let index = 0;
  while (index < script.length) {
    const char = script[index] ?? '';
    if (char === ' ' || char === '\t') {
      index += 1;
    } else if (char === '\\' && script[index + 1] === '\n') {
      // Een voortzetting tussen woorden is geen (leeg) woord; zo blijft `argv[0]` het echte commandowoord (review R4-2).
      index += 2;
    } else if (char === '#' && (index === 0 || /[ \t\n]/.test(script[index - 1] ?? ''))) {
      while (index < script.length && script[index] !== '\n') index += 1;
    } else {
      index = nextToken(script, index, { tokens, heredocs });
    }
  }
  return tokens;
}

/**
 * Leest het token op `index`, voegt het toe en geeft de positie erna. Na een regeleinde slaat hij openstaande heredocs over.
 * @param {string} script
 * @param {number} index
 * @param {{ tokens: Token[], heredocs: { delimiter: string, strip: boolean }[] }} state
 */
function nextToken(script, index, { tokens, heredocs }) {
  const descriptor = /^\d+(?=[<>])/.exec(script.slice(index))?.[0] ?? '';
  const op = OPERATORS.find((candidate) => script.startsWith(candidate, index + descriptor.length));
  if (op === undefined) {
    const word = readWord(script, index);
    const previous = tokens.at(-1);
    if (previous?.kind === 'op' && (previous.value === '<<' || previous.value === '<<-'))
      heredocs.push({ delimiter: word.value, strip: previous.value === '<<-' });
    tokens.push({ kind: 'word', value: word.value, expands: word.expands, pattern: word.pattern, raw: script.slice(index, word.end) });
    return word.end;
  }
  tokens.push({ kind: 'op', value: op });
  const end = index + descriptor.length + op.length;
  return op === '\n' && heredocs.length > 0 ? skipHeredocBodies(script, end, heredocs.splice(0)) : end;
}

/**
 * Slaat de tekst van de heredocs over die op de vorige regel begonnen; geeft de positie na de laatste sluitregel.
 * @param {string} script
 * @param {number} from
 * @param {{ delimiter: string, strip: boolean }[]} heredocs
 */
function skipHeredocBodies(script, from, heredocs) {
  let index = from;
  for (const { delimiter, strip } of heredocs) {
    while (index < script.length) {
      const end = script.indexOf('\n', index);
      const line = script.slice(index, end === -1 ? script.length : end);
      index = end === -1 ? script.length : end + 1;
      if ((strip ? line.replace(/^\t+/, '') : line) === delimiter) break;
    }
  }
  return index;
}

/**
 * Leest één woord; haalt aanhalingstekens en escapes weg. `$(…)` blijft letterlijk in het woord. `pattern`: de waarde met
 * aangehaalde glob-, brace- en tildetekens als `QUOTED`; `parseCommands` gebruikt die vorm alleen zonder `ONZEKERE_TEKST`.
 * @param {string} script
 * @param {number} start
 */
function readWord(script, start) {
  let value = '';
  let pattern = '';
  let expands = false;
  let index = start;
  while (index < script.length) {
    const char = script[index] ?? '';
    // Bash scheidt woorden alleen op spatie, tab, newline en metatekens; andere witruimte (`\r`, `\v`, U+00A0, U+2028) hoort bij het woord (#604).
    if (/[ \t\n;&|<>()]/.test(char)) break;
    const part = wordPart(script, index, char);
    // Buiten enkele aanhalingstekens breidt de shell `$` en backticks uit; binnen dubbele ook, tenzij geëscaped.
    if (char === '$' || char === '`' || (char === '"' && /[$`]/.test(script.slice(index + 1, part.end - 1).replace(/\\./g, ''))))
      expands = true;
    value += part.text;
    pattern += char === "'" || char === '"' ? part.text.replace(/[*?[{,~]/g, QUOTED) : part.text;
    index = part.end;
  }
  return { value, end: index, expands, pattern };
}

/**
 * @param {string} script
 * @param {number} index
 * @param {string} char
 * @returns {{ text: string, end: number }}
 */
function wordPart(script, index, char) {
  // `\` + regeleinde is een voortzetting: bash haalt beide weg en plakt de regels aaneen (`g\⏎[h]` is `g[h]`).
  if (char === '\\' && script[index + 1] === '\n') return { text: '', end: index + 2 };
  if (char === '\\') return { text: script[index + 1] ?? '', end: index + 2 };
  if (char === "'" || char === '"') {
    const close = findClose(script, index + 1, char);
    const inner = script.slice(index + 1, close);
    return { text: char === '"' ? inner.replace(/\\(["\\$`])/g, '$1') : inner, end: close + 1 };
  }
  if (char === '$' && script[index + 1] === '(') {
    const close = findParen(script, index + 2);
    return { text: script.slice(index, close + 1), end: close + 1 };
  }
  return { text: char, end: index + 1 };
}

/**
 * @param {string} script
 * @param {number} from
 * @param {string} quote
 */
function findClose(script, from, quote) {
  let index = from;
  while (index < script.length && script[index] !== quote) index += quote === '"' && script[index] === '\\' ? 2 : 1;
  return index;
}

/**
 * @param {string} script
 * @param {number} from
 */
function findParen(script, from) {
  let depth = 1;
  for (let index = from; index < script.length; index += 1) {
    if (script[index] === '(') depth += 1;
    if (script[index] === ')') depth -= 1;
    if (depth === 0) return index;
  }
  return script.length;
}

/** Omhulsels die een ander commando starten; het rolhek kijkt naar dat commando. */
const WRAPPERS = new Set(['sudo', 'env', 'command', 'time', 'nohup', 'exec', 'nice']);

/**
 * De programmanaam zonder pad: `/usr/bin/gh` en `./gh` zijn voor een weigering gewoon `gh` (V-13). Alleen voor wat het
 * rolhek weigert of als schrijfdoel ziet (ook `gh.exe` onder WSL); een toestemming (zoals de leescommando's van de reviewer) kijkt
 * naar het woord zelf, en `pathWrappers` meldt omhulsels met pad, zodat `./env` geen leescommando vrijgeeft.
 * @param {string} word
 */
export function programName(word) {
  return word
    .slice(word.lastIndexOf('/') + 1)
    .replace(/\.exe$/i, '')
    .toLowerCase();
}

/**
 * De woorden van het eigenlijke commando: zonder voorafgaande variabelen (`A=1 cmd`) en omhulsels (`env`, `sudo`).
 * `pathWrappers`: weggehaalde omhulsels met een pad (`/usr/bin/env`, `./env`); dat kan elk programma zijn.
 * @param {readonly string[]} words
 * @returns {{ assignments: string[], argv: string[], pathWrappers: string[] }}
 */
export function splitCommand(words) {
  let index = 0;
  /** @type {string[]} */
  const assignments = [];
  /** @type {string[]} */
  const pathWrappers = [];
  while (index < words.length) {
    const word = words[index] ?? '';
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(word)) assignments.push(word);
    else if (!WRAPPERS.has(programName(word))) break;
    else if (programName(word) !== word) pathWrappers.push(word);
    index += 1;
  }
  return { assignments, argv: words.slice(index), pathWrappers };
}

/** @typedef {{ writes: string[], deletes: string[], trees?: string[], indexOnly?: boolean }} Targets */

/**
 * Bestanden die een commando schrijft of verwijdert (redirect, tee, sed -i, perl -i, cp, mv, ln, rm, touch, truncate, dd,
 * find -delete/-fprint/-fls, awk-uitvoer en -i inplace, sort -o, git checkout/restore/rm/mv). Paden zoals geschreven; het
 * rolhek maakt ze relatief aan de repo. `trees`: schrijfdoelen waarvan een map met alles eronder telt (`cp -r x map`).
 * `indexOnly`: de eigen doelen (niet de redirects) raken alleen de git-index (`git restore --staged`).
 * @param {Command} command
 * @returns {Targets}
 */
export function writeTargets(command) {
  const { argv } = splitCommand(command.words);
  const [word = '', ...args] = argv;
  const targets = fileTargets(programName(word), args);
  return {
    writes: [...command.redirects, ...targets.writes],
    deletes: targets.deletes,
    trees: targets.trees ?? [],
    ...(targets.indexOnly === true ? { indexOnly: true } : {}),
  };
}

const DIRECTORY_WRITERS = new Set(['cp', 'mv', 'ln', 'install']);

/**
 * @param {string} program
 * @param {string[]} args
 * @returns {Targets}
 */
function fileTargets(program, args) {
  const operands = args.filter((arg) => !arg.startsWith('-'));
  const directory = DIRECTORY_WRITERS.has(program) ? targetDirectory(args) : null;
  switch (program) {
    case 'tee':
    case 'touch':
    case 'truncate':
      return { writes: operands, deletes: [] };
    case 'rm':
    case 'unlink':
    case 'rmdir':
      return { writes: [], deletes: operands };
    case 'cp':
    case 'install': {
      const writes = directory === null ? operands.slice(-1) : [directory];
      return { writes, deletes: [], trees: args.some((arg) => RECURSIVE.test(arg)) ? writes : [] };
    }
    case 'find':
      return findTargets(args);
    case 'awk':
    case 'gawk':
    case 'mawk':
    case 'nawk':
      return { writes: awkTargets(args), deletes: [] };
    case 'sort':
      return { writes: sortOutputs(args), deletes: [] };
    case 'mv':
      return { writes: directory === null ? operands.slice(-1) : [directory], deletes: directory === null ? operands.slice(0, -1) : operands };
    case 'ln':
      return { writes: directory === null ? operands : [...operands, directory], deletes: [] };
    case 'dd':
      return { writes: args.filter((arg) => arg.startsWith('of=')).map((arg) => arg.slice(3)), deletes: [] };
    case 'sed':
    case 'perl':
      return { writes: inPlaceFiles(program, args), deletes: [] };
    case 'git':
      return gitTargets(args);
    default:
      return { writes: [], deletes: [] };
  }
}

/** GNU cp/mv/ln/install kiezen met -t/--target-directory een ander schrijfdoel dan het laatste operand. @param {readonly string[]} args */
function targetDirectory(args) {
  for (const [index, arg] of args.entries()) {
    if (arg === '--') break;
    const option = arg.split('=')[0] ?? '';
    if (option.length > 2 && '--target-directory'.startsWith(option))
      return arg.includes('=') ? arg.slice(option.length + 1) : (args[index + 1] ?? null);
    const short = /^-[a-su-zA-Z]*t(.*)$/.exec(arg);
    if (short !== null) return short[1] || (args[index + 1] ?? null);
  }
  return null;
}

const RECURSIVE = /^(?:-[a-zA-Z]*[rRa][a-zA-Z]*|--recursive|--archive)$/;
const FIND_PREFIX = new Set(['-H', '-L', '-P']);
const FIND_OUTPUTS = new Set(['-fprint', '-fprint0', '-fprintf', '-fls']);

/**
 * `find`: `-fprint`/`-fprint0`/`-fprintf`/`-fls` schrijven het bestand erna; `-delete` verwijdert wat onder de startpaden
 * valt (zonder startpad: `.`). Het rolhek beslist voor een startmap over alles eronder.
 * @param {readonly string[]} args
 * @returns {Targets}
 */
function findTargets(args) {
  let index = 0;
  while (FIND_PREFIX.has(args[index] ?? '') || /^-D$|^-O\d*$/.test(args[index] ?? ''))
    index += args[index] === '-D' ? 2 : 1;
  /** @type {string[]} */
  const starts = [];
  while (index < args.length && !/^[-(!,]/.test(args[index] ?? '')) starts.push(args[index++] ?? '');
  const writes = args.flatMap((arg, at) => (FIND_OUTPUTS.has(arg) && at + 1 < args.length ? [args[at + 1] ?? ''] : []));
  return { writes, deletes: args.includes('-delete') ? (starts.length > 0 ? starts : ['.']) : [] };
}

const AWK_VALUE_OPTIONS = new Set(['-v', '-F', '-i', '-l', '--include', '--load', '--assign', '--field-separator']);

/**
 * `awk`: bestanden waarnaar het programma schrijft (`print > "x"`, `>> "x"`) en bij `-i inplace` de invoerbestanden.
 * Een programma uit een bestand (`-f`) of een niet-letterlijk doel ziet het rolhek niet (vangnet, framework §8).
 * @param {readonly string[]} args
 */
function awkTargets(args) {
  let inplace = false;
  let programFile = false;
  /** @type {string[]} */
  const sources = [];
  /** @type {string[]} */
  const operands = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (/^(?:-i|--include=?)inplace$/.test(arg) || (['-i', '--include'].includes(arg) && args[index + 1] === 'inplace'))
      inplace = true;
    if (/^-[fE]/.test(arg) || arg.startsWith('--file')) programFile = true;
    // Programmatekst via `-e`/`--source`, los of aangeplakt (`-e'…'`, `--source='…'`); dan is er geen positioneel programma.
    if (arg === '-e' || arg === '--source') sources.push(args[index + 1] ?? '');
    else if (/^-e./.test(arg)) sources.push(arg.slice(2));
    else if (arg.startsWith('--source=')) sources.push(arg.slice('--source='.length));
    if (AWK_VALUE_OPTIONS.has(arg) || ['-f', '-E', '--file', '-e', '--source'].includes(arg)) index += 1;
    else if (!arg.startsWith('-') || arg === '-') operands.push(arg);
  }
  const positioneel = !programFile && sources.length === 0;
  const [program = '', ...files] = positioneel ? operands : ['', ...operands];
  const redirects = [program, ...sources].flatMap((text) => [...text.matchAll(/>>?\s*(?:\(\s*)?"([^"]+)"/g)].map((match) => match[1] ?? ''));
  return [...redirects, ...(inplace ? files : [])];
}

/**
 * `sort -o f`, `-of`, `--output=f`, `--output f` (ook afkortingen vanaf `--o`).
 * @param {readonly string[]} args
 */
function sortOutputs(args) {
  return args.flatMap((arg, index) => {
    const option = arg.split('=')[0] ?? '';
    if (option.length > 2 && option.startsWith('--o') && '--output'.startsWith(option))
      return [arg.includes('=') ? arg.slice(option.length + 1) : (args[index + 1] ?? '')];
    // Lees de cluster tot de eerste `o`; `-k`, `-t`, `-S` en `-T` nemen de rest als waarde (`-to x` is een scheidingsteken).
    const short = /^-(?:(?![ktSTo])[a-zA-Z])*o(.*)$/.exec(arg);
    return short === null || arg.startsWith('--') ? [] : [short[1] || (args[index + 1] ?? '')];
  });
}

/**
 * `sed -i`/`perl -pi`: de bestanden na het script (of na `-e`/`-f`).
 * @param {string} program
 * @param {string[]} args
 */
function inPlaceFiles(program, args) {
  const inPlace = args.some((arg) => (program === 'sed' && arg === '--in-place') || /^-[a-zA-Z]*i/.test(arg));
  if (!inPlace) return [];
  /** @type {string[]} */
  const operands = [];
  let scriptGiven = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';
    if (arg === '-e' || arg === '-f' || arg === '--expression' || arg === '--file') {
      scriptGiven = true;
      index += 1;
    } else if (!arg.startsWith('-')) operands.push(arg);
  }
  return scriptGiven ? operands : operands.slice(1);
}

/**
 * @param {string[]} args
 * @returns {Targets}
 */
function gitTargets(args) {
  const { subcommand, rest } = gitSubcommand(args);
  const operands = rest.filter((arg) => !arg.startsWith('-'));
  switch (subcommand) {
    // checkout en restore met een map als pad overschrijven alles eronder: `trees`.
    case 'checkout': {
      const dashdash = rest.indexOf('--');
      const writes = dashdash === -1 ? [] : rest.slice(dashdash + 1);
      return { writes, deletes: [], trees: writes };
    }
    case 'restore': {
      const writes = withoutSource(rest);
      // `--staged`/`-S` zonder `--worktree`/`-W` raakt alleen de index, niet de werkmap. Een korte cluster telt tot de `s`
      // (die neemt een ref als waarde: `-sStable`); lange opties ook als afkorting (`--stag`, `--work`). Twijfel = werkmap.
      // Na `--` volgen alleen paden, ook als ze met `-` beginnen.
      const opties = rest.includes('--') ? rest.slice(0, rest.indexOf('--')) : rest;
      const alleenIndex = opties.some((arg) => longOption(arg, '--staged', 4) || /^-[a-rt-zA-Z]*S/.test(arg)) &&
        !opties.some((arg) => longOption(arg, '--worktree', 3) || /^-[a-rt-zA-Z]*W/.test(arg));
      return { writes, deletes: [], trees: alleenIndex ? [] : writes, ...(alleenIndex ? { indexOnly: true } : {}) };
    }
    case 'rm':
      return { writes: [], deletes: operands };
    case 'mv':
      return { writes: operands.slice(-1), deletes: operands.slice(0, -1) };
    default:
      return { writes: [], deletes: [] };
  }
}

/**
 * Een lange optie of een afkorting ervan van minstens `min` tekens (git accepteert unieke afkortingen).
 * @param {string} arg @param {string} option @param {number} min
 */
function longOption(arg, option, min) {
  return arg.length >= min && option.startsWith(arg);
}

/**
 * `git restore -s <tree> a b` → `a`, `b`.
 * @param {string[]} rest
 */
function withoutSource(rest) {
  const dashdash = rest.indexOf('--');
  const opties = dashdash === -1 ? rest : rest.slice(0, dashdash);
  const paden = dashdash === -1 ? [] : rest.slice(dashdash + 1);
  return [...opties.filter((arg, index) => !arg.startsWith('-') && opties[index - 1] !== '-s' && opties[index - 1] !== '--source'), ...paden];
}

const GIT_OPTIONS_WITH_VALUE = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path']);

/**
 * `git -C x -c a=b commit …` → subcommand `commit`, met de globale `-c`-instellingen apart.
 * @param {readonly string[]} args
 */
export function gitSubcommand(args) {
  /** @type {string[]} */
  const config = [];
  let index = 0;
  while (index < args.length) {
    const arg = args[index] ?? '';
    if (!arg.startsWith('-')) break;
    if (arg === '-c') config.push(args[index + 1] ?? '');
    else if (arg.startsWith('-c') || arg.startsWith('--config-env')) config.push(arg.replace(/^-c|^--config-env=?/, ''));
    index += GIT_OPTIONS_WITH_VALUE.has(arg) ? 2 : 1;
  }
  return { subcommand: args[index] ?? '', rest: args.slice(index + 1), config };
}
