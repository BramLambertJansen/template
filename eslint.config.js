import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import { builtinRules } from 'eslint/use-at-your-own-risk';
import tseslint from 'typescript-eslint';

// Rails (framework §2, §4, §7): elke regel een eigen alias van no-restricted-syntax, zodat elke regel zijn eigen
// bestandsbereik heeft (één no-restricted-syntax per bestand zou elkaar overschrijven). De melding noemt de juiste helper.
// Elke regel heeft fixtures in test/rails/eslint.test.ts, ook voor bekende omzeilingen.
const restrictedSyntax = builtinRules.get('no-restricted-syntax');
const ruleNames = [
  'process-env',
  'import-meta-env',
  'fetch',
  'elementen',
  'sql-sessie',
  'sql-instellingen',
  'hono',
  'import',
];
const rails = { rules: Object.fromEntries(ruleNames.map((name) => [name, restrictedSyntax])) };

const SRC = ['src/**/*.{ts,tsx}'];
const WEB = ['src/web/**/*.{ts,tsx}', 'src/core/web/**/*.{ts,tsx}'];
const ELEMENTS = '/^(button|input|select|textarea|dialog|a)$/';
const IMPORTS = ['ImportDeclaration', 'ExportNamedDeclaration', 'ExportAllDeclaration', 'ImportExpression'].join(', ');

function fromModule(sourceRegex) {
  return `:matches(${IMPORTS})[source.value=${sourceRegex}]`;
}

function restrict(rule, files, ignores, message, selectors) {
  return {
    files,
    ignores,
    plugins: { rails },
    rules: { [`rails/${rule}`]: ['error', ...selectors.map((selector) => ({ selector, message }))] },
  };
}

const railConfigs = [
  restrict(
    'process-env',
    SRC,
    ['src/core/api/env.ts'],
    "process.env alleen in src/core/api/env.ts: importeer `env` uit '#core/api/env.ts' (framework §4).",
    [
      "Identifier[name='process']",
      "MemberExpression[computed=true] > Literal.property[value='process']",
      fromModule('/^(node:)?process$/'),
    ],
  ),
  restrict(
    'import-meta-env',
    SRC,
    ['src/core/web/lib/env.ts'],
    'import.meta.env alleen in src/core/web/lib/env.ts: importeer de waarde daaruit (framework §4).',
    [
      "MemberExpression[object.type='MetaProperty'][property.name='env']",
      "MemberExpression[object.type='MetaProperty'][computed=true]",
      "VariableDeclarator[init.type='MetaProperty']",
    ],
  ),
  restrict(
    'fetch',
    WEB,
    ['src/core/web/lib/api-client.ts'],
    "Netwerkverkeer alleen via de API-client: gebruik `api` uit '#web/lib/api.ts' (framework §5).",
    [
      'Identifier[name=/^(fetch|XMLHttpRequest|EventSource|WebSocket|sendBeacon)$/]',
      'MemberExpression[computed=true] > Literal.property[value=/^(fetch|XMLHttpRequest|EventSource|WebSocket|sendBeacon)$/]',
    ],
  ),
  restrict(
    'elementen',
    WEB,
    ['src/core/web/ui/**', 'src/web/ui/**'],
    'Geen rauw <button>, <input>, <select>, <textarea>, <dialog> of <a> buiten de UI-kit: gebruik een component uit ' +
      "'#web/ui/…' (lijst: `node scripts/kit/feiten.mjs componenten`). Past er geen, stel dan een variant voor (framework §7).",
    [
      `JSXOpeningElement[name.name=${ELEMENTS}]`,
      `CallExpression[callee.name='createElement'][arguments.0.value=${ELEMENTS}]`,
      `CallExpression[callee.property.name='createElement'][arguments.0.value=${ELEMENTS}]`,
      fromModule('/^react\\/jsx(-dev)?-runtime$/'),
    ],
  ),
  restrict(
    'sql-sessie',
    SRC,
    [],
    'Nooit SET ROLE, SET SESSION AUTHORIZATION of set_config(…, false): op een gedeelde verbinding lekt dat naar de ' +
      "volgende gebruiker. Gebruik withUser() uit src/core/api/db (framework §4, 'Geen sessielek').",
    [
      'Literal[value=/\\bset\\s+(session\\s+)?(role|authorization)\\b/i]',
      'TemplateElement[value.raw=/\\bset\\s+(session\\s+)?(role|authorization)\\b/i]',
      'Literal[value=/set_config\\s*\\([^)]*,\\s*false\\s*\\)/i]',
      'TemplateElement[value.raw=/set_config\\s*\\([^)]*,\\s*false\\s*\\)/i]',
    ],
  ),
  restrict(
    'sql-instellingen',
    SRC,
    ['src/core/api/db/**'],
    'set_config en current_setting alleen in src/core/api/db: anders kan een query een andere gebruiker of MFA ' +
      'voorwenden. Gebruik ctx.actor (framework §4).',
    [
      'Literal[value=/\\b(set_config|current_setting)\\b/i]',
      'TemplateElement[value.raw=/\\b(set_config|current_setting)\\b/i]',
    ],
  ),
  restrict(
    'hono',
    SRC,
    ['src/core/**'],
    'Hono alleen in src/core: een route ontstaat via defineRoute(), de app via createApp() (ADR 0008).',
    [fromModule('/^(hono|@hono\\/[^/]+)(\\/|$)/')],
  ),
  restrict(
    'import',
    SRC,
    [],
    "Alleen import('letterlijk pad'): een berekend pad ziet dependency-cruiser niet, dus ook de lagenregels niet.",
    ["ImportExpression[source.type!='Literal']"],
  ),
];

export default defineConfig(
  globalIgnores([
    'dist/',
    'coverage/',
    'playwright-report/',
    'test-results/',
    '.runner-output/',
    'test/rails/fixtures/',
  ]),
  {
    // Geen eslint-disable in de code: een uitzondering gaat via de ratchet (eslint-suppressions.json, framework §4).
    linterOptions: { noInlineConfig: true, reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
    },
  },
  {
    files: ['**/*.{js,mjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly' } },
  },
  railConfigs,
);
