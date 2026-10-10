# Gouden pad: een feature door alle lagen

Kopieer van accountbeheer (spec `docs/specs/accountbeheer.md`). Volgorde zoals de werkstraat (framework §8): eerst de spec,
dan van database naar scherm. Elke stap verwijst naar het bestand dat het voordoet.

1. **Spec** met status `goedgekeurd`: `docs/specs/accountbeheer.md` (routes, foutcodes, teksten, ACs, testplan).
2. **Migratie** met RLS, grants en policies, of een view van `app_definer`: `db/migrations/*_user_roles.sql`, `*_accounts_view.sql`.
   pgTAP per policy: `db/tests/user_roles.sql`, `db/tests/accounts.sql`; nieuwe functie → regel in `db/tests/functies.sql`.
3. **Schema genereren**: `pnpm db:generate` (snapshot en `src/api/db/schema.ts`); nieuwe id-kolom → `db/ids.json`.
4. **Permissie** en **foutcode**: `src/shared/permissions.ts`, `src/shared/errors.ts`, tekst in `src/web/copy/errors.ts`.
5. **Contract** (zod, `.strict()`): `src/shared/contracts/accounts.ts`, opgenomen in `src/shared/contracts/index.ts`.
6. **Route** met `defineRoute` en `tx`: `src/api/routes/accounts.ts`, opgenomen in `src/api/app.ts`. Iets buiten de database
   via `ctx.services`: `src/api/services.ts`.
7. **Integratietests** (verboden rol, admin zonder MFA, ongeldige input, ACs): `test/api/accounts.int.test.ts` met de testkit
   (`beginTestDb`, `asUser`).
8. **Queries** (key-factory, hooks, mutaties die invalideren): `src/web/features/accounts/queries.ts`.
9. **Scherm** met kitcomponenten uit `src/web/ui` en teksten uit `src/web/copy/ui.ts`: `src/web/features/accounts/accounts-page.tsx`,
   `invite-dialog.tsx`.
10. **Route** met guard: `src/web/routes/_app/admin/accounts.tsx`; menu-item per rol in `src/web/lib/nav.ts`.
11. **E2E** per AC met axe op 375 en 1280 px: `e2e/accounts.spec.ts`.

Bewijs per PR: `pnpm gate:fast`, `pnpm test:db` en `pnpm ui:check` (de laatste twee in de runner, door de eigenaar).
