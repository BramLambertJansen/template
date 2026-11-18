// De versie van de template (spec release-versie, ADR 0049): semver, gelijk aan de nieuwste releasekop in
// docs/template-changelog.md (test/scripts/template-version.test.ts). `pnpm template:release` zet hem (spec template-release,
// ADR 0093); een app krijgt een nieuwe versie met de merge van een `template-v<x.y.z>`-tag. GET /api/health toont hem,
// `pnpm app:init`, `pnpm template:status` en scripts/check-image.sh lezen hem.
export const TEMPLATE_VERSION = '0.2.0';
