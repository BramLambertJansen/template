// Gedeelde teksten voor de tests van spec app-agentregels (geen test zelf): de stub en het skelet staan hier letterlijk zoals
// in het Ontwerp van docs/template/specs/app-agentregels.md, los van de code die ze schrijft (`APP_STUB` en
// `appAgentregels()` in scripts/kit/app-init.mjs). Zo faalt een test als code en spec uit elkaar lopen.
export const STUB = [
  '# Deze repo',
  '',
  'Dit is de template zelf; er is geen app. In een app beschrijft dit bestand de app: `pnpm app:init` schrijft het skelet.',
  '',
].join('\n');

/** Het skelet dat `app:init` schrijft, met de app-naam in de kop. */
export function skelet(naam: string): string {
  return [
    `# ${naam}`,
    '',
    "Feiten van deze app, geen regels (die staan in `docs/framework.md` en de app-ADR's in `docs/adr/`). Elke sessie laadt dit bestand: houd het kort en werk het bij in de PR die een feit wijzigt.",
    '',
    '## Wat de app is',
    '',
    'Nog in te vullen na de intake: doel en gebruikers in één alinea.',
    '',
    '## Provider en host',
    '',
    'Nog geen app-ADR.',
    '',
    '## Rollen',
    '',
    'Zie `src/shared/permissions.ts`.',
    '',
    '## Begrippen',
    '',
    'Nog geen.',
    '',
    "## Eigen commando's en valkuilen",
    '',
    'Nog geen.',
    '',
  ].join('\n');
}

/** De regel in het skelet die de hoofdsessie na de intake vervangt. */
export const IN_TE_VULLEN = 'Nog in te vullen na de intake: doel en gebruikers in één alinea.';

/** De invoer van `planAppInit`: een templatekopie met de stub van `docs/app.md`. */
export const TEMPLATE_BESTANDEN: Readonly<Record<string, string>> = {
  'package.json': '{\n  "name": "app-template",\n  "type": "module"\n}\n',
  'README.md':
    '# App-template\n\nFundering voor apps.\n\n## Nieuwe app starten\n\nSetup.\n\n## Lokaal draaien\n\nStart.\n',
  'CHANGELOG.md': '# Changelog\n\nDe wijzigingen van de template staan in docs/template-changelog.md.\n',
  'docs/app.md': STUB,
  'src/shared/app.ts': "export const APP_NAME = 'App-template';\n",
  'src/web/index.html': '<!doctype html><html lang="nl"><head><title>App-template</title></head></html>\n',
  '.claude/gates.json': '{\n  "template": { "repository": "acme/sjabloon" }\n}\n',
};
