import { type Dirent, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { gitIn, momentopname } from '../../rails/hooks/lib/effect-snapshot.mjs';
import { legVast, opslag } from '../../rails/hooks/lib/effect.mjs';
import {
  bash,
  blobVan,
  blok,
  git,
  MIN,
  objecten,
  repoVan,
  schrijf,
  start,
  TESTER,
  REVIEWER,
  wereld,
} from './effect-sandbox-kit';

// docs/specs/rolhek-effect.md AC-11 (c), ADR 0084 punt 3 (OV-5): geheimen komen niet als los object in `.git/objects`.
// Een pad waarvan de basisnaam, op elke diepte, past op `.env`, `.env.*` (behalve `.env.example`) of `*secret*`, hasht de
// momentopname in elk toetsmoment zonder `-w`, en van zo'n pad bewaart hij geen voorbeeld.
const UNIEK = 'GEHEIM-9f3a1c7e-uniek';

/** Alle bestanden onder een map, als tekst, om te zoeken naar een tekenreeks. */
function alleTekst(map: string): string {
  let items: Dirent[];
  try {
    items = readdirSync(map, { withFileTypes: true });
  } catch {
    return '';
  }
  return items
    .map((item) => {
      const vol = path.join(map, item.name);
      if (item.isDirectory()) return alleTekst(vol);
      return item.isFile() ? readFileSync(vol, 'utf8') : '';
    })
    .join('\n');
}

describe('rolhek-effect/AC-11 (c): geheimen worden gehasht zonder -w', () => {
  const geheimen: [string, string][] = [
    ['.env (genegeerd door .gitignore)', '.env'],
    ['config/.env.local (op diepte)', 'config/.env.local'],
    ['.env.production', '.env.production'],
    ['x/my-secret.txt (*secret* op diepte)', 'x/my-secret.txt'],
    ['secret.json', 'secret.json'],
  ];

  test.each(geheimen)(
    '%s: de blob staat niet in .git/objects en de momentopname bevat de hash',
    (_naam, rel) => {
      const { a } = wereld();
      schrijf(a, rel, `${UNIEK}\n`);
      const blob = blobVan(a, `${UNIEK}\n`);
      const snap = momentopname({ root: a, git: gitIn(a) });
      expect(snap.paden[rel]?.wt.endsWith(`:${blob}`)).toBe(true);
      expect(objecten(a)).not.toContain(blob);
    },
    MIN,
  );

  test(
    'ook de opslag van een opname bevat de tekenreeks niet, en er staat geen voorbeeld van de inhoud in',
    () => {
      const { a } = wereld();
      schrijf(a, '.env', `${UNIEK}\n`);
      schrijf(a, 'x/my-secret.txt', `${UNIEK}\n`);
      legVast(repoVan(a), { soort: 'agent', id: 'agent-x' }, {});
      expect(alleTekst(opslag(repoVan(a)))).not.toContain(UNIEK);
      expect(objecten(a)).not.toContain(blobVan(a, `${UNIEK}\n`));
    },
    MIN,
  );

  test(
    'hetzelfde in de tweede stap: een momentopname met alleenLezen en zonder geeft dezelfde staat (de hash blijft zichtbaar)',
    () => {
      const { a } = wereld();
      schrijf(a, '.env', `${UNIEK}\n`);
      const schrijvend = momentopname({ root: a, git: gitIn(a) });
      const lezend = momentopname({ root: a, git: gitIn(a), alleenLezen: true });
      expect(schrijvend.paden['.env']).toStrictEqual(lezend.paden['.env']);
      expect(objecten(a)).not.toContain(blobVan(a, `${UNIEK}\n`));
    },
    MIN,
  );

  test(
    '.env.example gaat wel met -w: de blob staat in .git/objects',
    () => {
      const { a } = wereld();
      schrijf(a, '.env.example', 'VOORBEELD=1\n');
      const blob = blobVan(a, 'VOORBEELD=1\n');
      momentopname({ root: a, git: gitIn(a) });
      expect(objecten(a)).toContain(blob);
    },
    MIN,
  );

  test(
    'een gewoon pad (src/nieuw.ts) gaat wel met -w, ook als er een geheim naast ligt (hashes() splitst)',
    () => {
      const { a } = wereld();
      schrijf(a, '.env', `${UNIEK}\n`);
      schrijf(a, 'src/nieuw.ts', 'export const x = 1;\n');
      const blob = blobVan(a, 'export const x = 1;\n');
      momentopname({ root: a, git: gitIn(a) });
      expect(objecten(a)).toContain(blob);
      expect(objecten(a)).not.toContain(blobVan(a, `${UNIEK}\n`));
    },
    MIN,
  );
});

describe('rolhek-effect/AC-11 (c): wat de reviewer doet met een geheim, in de hooks als proces', () => {
  test(
    'een gewijzigde .env blijft een overtreding voor de reviewer, via de hash',
    () => {
      const { a } = wereld();
      schrijf(a, '.env', 'A=1\n');
      start(a, REVIEWER);
      const uit = bash(a, REVIEWER, {
        command: 'printf B=2 > .env',
        doe: () => {
          schrijf(a, '.env', 'B=2\n');
        },
      });
      expect(blok(uit)).toContain('.env');
      expect(git(a, 'status', '--porcelain')).not.toContain('.env');
    },
    MIN,
  );

  test(
    'ctx.read op een geheim waarvan de blob ontbreekt valt dicht: een tester die zijn eigen *secret*-test wijzigt krijgt een blokkade op de interne fout',
    () => {
      // `existingTest` leest de inhoud van vóór het commando met `ctx.read`; voor een geheim is die blob er nooit geweest.
      const { a } = wereld();
      schrijf(a, 'test/my-secret.test.ts', "test('een', () => {});\n");
      start(a, TESTER);
      const uit = bash(a, TESTER, {
        command: "printf '%s' tweede >> test/my-secret.test.ts",
        doe: () => {
          schrijf(a, 'test/my-secret.test.ts', "test('een', () => {});\ntest('twee', () => {});\n");
        },
      });
      expect(blok(uit)).toContain('interne fout');
    },
    MIN,
  );
});
