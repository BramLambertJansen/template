// De versie van de template (spec release-versie, ADR 0049): semver, gelijk aan de nieuwste releasekop in
// docs/template-changelog.md (test/scripts/template-version.test.ts). Een app krijgt een nieuwe versie met de
// template-merge. GET /api/health toont hem, `pnpm app:init` en scripts/check-image.sh lezen hem.
export const TEMPLATE_VERSION = '0.1.0';
