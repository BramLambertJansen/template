// Markdown-herkenning die check-docs en zonder-prompt delen (CommonMark).

/** Een codespan sluit met een reeks backticks van dezelfde lengte (CommonMark), ook over regels heen. */
export const CODESPAN = /(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g;
export const HEK = /^ {0,3}(`{3,}|~{3,})/;

/**
 * Een hek sluit alleen met hetzelfde teken, minstens even lang en zonder tekst erachter (CommonMark).
 * @param {string} line @param {string} open
 */
export function sluitHek(line, open) {
  const hek = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line)?.[1] ?? '';
  return hek[0] === open[0] && hek.length >= open.length;
}
