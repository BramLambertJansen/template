// Rail klassen-kit (spec app-thema, deel B): de kit in src/core/web/ui en src/web/ui zet vorm en kleur alleen via
// token-klassen uit @theme en @utility. De regel leest elke string in `className`, in `cn(…)` en in `cva(…)`, ook in een
// constante in hetzelfde bestand die daarin gelezen wordt (`variantClasses[variant]`), en meldt per klasse een arbitrary
// value (`w-[13rem]`, ook met `var()`), de vorm `x-(--y)`, een hex- of oklch-kleur, `!` en `dark:`. Arbitrary variants
// (`[&_svg]:size-4`, `data-[state=open]:`) mogen. Een `style` met een vaste waarde meldt hij ook; een waarde die uit props
// of een variabele berekend wordt (een voortgangsbreedte) mag.

/**
 * Het deel van een ESTree/JSX-node dat deze regel leest; de rest staat ongetypeerd achter de index.
 * @typedef {{ type: string, parent?: AstNode | null, [veld: string]: unknown }} AstNode
 */

const MESSAGE =
  'In de kit (src/core/web/ui, src/web/ui) geen arbitrary value, `x-(--y)`, hex- of oklch-kleur, `!`, `dark:` of ' +
  '`style` met een vaste waarde ({{wat}}). Een maat of kleur wordt een token met een klasse via `@theme` of `@utility` ' +
  'in src/core/web/styles/; arbitrary variants zoals `data-[state=open]:` mogen wel (framework §7, spec app-thema).';

const KLASSE_FUNCTIES = new Set(['cn', 'cva']);

/**
 * @param {unknown} waarde
 * @returns {waarde is AstNode}
 */
function isNode(waarde) {
  return typeof waarde === 'object' && waarde !== null && typeof Reflect.get(waarde, 'type') === 'string';
}

/**
 * @param {AstNode | null | undefined} node
 * @param {string} veld
 * @returns {AstNode | null}
 */
function kind(node, veld) {
  const waarde = node?.[veld];
  return isNode(waarde) ? waarde : null;
}

/**
 * Splitst een klasse in variants en basis op `:` buiten haken: `data-[a=b]:md:w-4` → ['data-[a=b]', 'md'] en 'w-4'.
 * @param {string} klasse
 */
function splitVariants(klasse) {
  const variants = [];
  let diepte = 0;
  let begin = 0;
  for (let i = 0; i < klasse.length; i += 1) {
    const teken = klasse[i];
    if (teken === '[' || teken === '(') diepte += 1;
    else if (teken === ']' || teken === ')') diepte -= 1;
    else if (teken === ':' && diepte === 0) {
      variants.push(klasse.slice(begin, i));
      begin = i + 1;
    }
  }
  return { variants, basis: klasse.slice(begin) };
}

/**
 * De reden waarom een klasse in de kit niet mag, of null.
 * @param {string} klasse
 * @returns {string | null}
 */
export function verbodenKlasse(klasse) {
  const { variants, basis } = splitVariants(klasse);
  if (variants.includes('dark')) return 'dark';
  if (basis.startsWith('!') || basis.endsWith('!')) return 'important';
  if (basis.includes('[')) return 'arbitrary';
  if (/(^|-)\(/.test(basis)) return 'css-variabele';
  if (/#[0-9a-f]{3,8}\b|oklch\(/i.test(basis)) return 'kleur';
  return null;
}

/** @param {AstNode} waarde */
function isVast(waarde) {
  if (waarde.type === 'Literal') return true;
  if (waarde.type === 'TemplateLiteral')
    return Array.isArray(waarde['expressions']) && waarde['expressions'].length === 0;
  return waarde.type === 'UnaryExpression' && kind(waarde, 'argument')?.type === 'Literal';
}

/** @param {AstNode} node */
function isSleutel(node) {
  const ouder = node.parent;
  return ouder?.type === 'Property' && ouder['key'] === node && ouder['computed'] !== true;
}

/**
 * @param {AstNode} node
 * @returns {string | null}
 */
function tekstVan(node) {
  if (node.type === 'Literal' && typeof node['value'] === 'string') return node['value'];
  if (node.type !== 'TemplateElement') return null;
  const cooked = Reflect.get(Object(node['value']), 'cooked');
  return typeof cooked === 'string' ? cooked : '';
}

/** @param {AstNode} node */
function isNaam(node) {
  if (node.type !== 'Identifier' || isSleutel(node)) return false;
  const ouder = node.parent;
  return !(ouder?.type === 'MemberExpression' && ouder['property'] === node && ouder['computed'] !== true);
}

/**
 * Alle string- en templatedelen onder een node, behalve sleutels van een object (cva: `variants: { size: … }`), en de
 * namen die erin gelezen worden.
 * @param {unknown} node
 * @param {{ strings: AstNode[], namen: AstNode[] }} uit
 */
function verzamel(node, uit) {
  if (Array.isArray(node)) {
    for (const element of node) verzamel(element, uit);
    return;
  }
  if (!isNode(node)) return;
  if (tekstVan(node) !== null && !isSleutel(node)) uit.strings.push(node);
  if (isNaam(node)) uit.namen.push(node);
  for (const [veld, waarde] of Object.entries(node)) {
    if (veld !== 'parent' && typeof waarde === 'object' && waarde !== null) verzamel(waarde, uit);
  }
}

/** @type {import('eslint').Rule.RuleModule} */
const regel = {
  meta: {
    type: 'problem',
    docs: { description: 'Alleen token-klassen in de UI-kit (spec app-thema, deel B).' },
    schema: [],
    messages: { verboden: MESSAGE },
  },
  create(context) {
    // Twee sets: een gevolgde beginwaarde kan zelf een string zijn (`const k = 'w-[13rem]'`), die dan nog gemeld moet worden.
    /** @type {WeakSet<object>} */
    const gemeld = new WeakSet();
    /** @type {WeakSet<object>} */
    const gevolgd = new WeakSet();
    // Elke gelezen naam met zijn verwijzing, één keer per bestand opgebouwd (lineair; per naam alle scopes doorzoeken
    // was kwadratisch in de bestandsgrootte).
    /** @type {Map<unknown, import('eslint').Scope.Reference> | null} */
    let index = null;

    function verwijzingen() {
      if (index === null) {
        const scopes = context.sourceCode.scopeManager?.scopes ?? [];
        index = new Map(scopes.flatMap((scope) => scope.references.map((ref) => [ref.identifier, ref])));
      }
      return index;
    }

    /**
     * De beginwaarde van de variabele achter een gelezen naam in dit bestand, of null (parameter, import).
     * @param {AstNode} naam
     * @returns {AstNode | null}
     */
    function waardeVan(naam) {
      const def = /** @type {unknown} */ (verwijzingen().get(naam)?.resolved?.defs[0]?.node);
      return isNode(def) && def.type === 'VariableDeclarator' ? kind(def, 'init') : null;
    }

    /** @param {AstNode} node */
    function meld(node) {
      for (const klasse of (tekstVan(node) ?? '').split(/\s+/)) {
        if (klasse !== '' && verbodenKlasse(klasse) !== null)
          context.report({ node, messageId: 'verboden', data: { wat: `\`${klasse}\`` } });
      }
    }

    /** @param {unknown} wortel */
    function controleer(wortel) {
      /** @type {{ strings: AstNode[], namen: AstNode[] }} */
      const gevonden = { strings: [], namen: [] };
      verzamel(wortel, gevonden);
      for (const waarde of gevonden.namen.map(waardeVan)) {
        if (waarde !== null && !gevolgd.has(waarde)) {
          gevolgd.add(waarde);
          controleer(waarde);
        }
      }
      for (const node of gevonden.strings.filter((s) => !gemeld.has(s))) {
        gemeld.add(node);
        meld(node);
      }
    }

    /** @param {AstNode} attribuut */
    function controleerStyle(attribuut) {
      const expressie = kind(kind(attribuut, 'value'), 'expression');
      const properties = expressie?.type === 'ObjectExpression' ? expressie['properties'] : [];
      const vast = (Array.isArray(properties) ? properties : [])
        .filter(isNode)
        .find((p) => p.type === 'Property' && isNode(p['value']) && isVast(p['value']));
      if (vast !== undefined) context.report({ node: vast, messageId: 'verboden', data: { wat: 'vaste `style`' } });
    }

    return {
      /** @param {unknown} node */
      JSXAttribute(node) {
        if (!isNode(node)) return;
        const naam = kind(node, 'name')?.['name'];
        if (naam === 'className') controleer(node['value']);
        if (naam === 'style') controleerStyle(node);
      },
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && KLASSE_FUNCTIES.has(node.callee.name)) controleer(node.arguments);
      },
    };
  },
};

export default regel;
