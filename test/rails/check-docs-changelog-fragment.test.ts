import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { codeownersTekst } from '../../scripts/kit/codeowners.mjs';
import { STUB } from '../scripts/app-agentregels-kit';
import { NIEUW_ALTIJD_VRAGEN, nieuw } from './padtabel-kit';

// template-release/AC-1 (docs/template/specs/template-release.md): check-docs keurt een geldig changelogfragment in
// docs/template-changelog.d/ goed en is rood met `docs:changelog-fragment:<bestand>` en de reden bij een ongeldig fragment.
// Tijdelijke git-repo's, verder schoon (de fixture heeft geen andere overtreding). `README.md` in de map is geen fragment.
// De exacte tekst van een reden laat de spec open; de test toetst het kernwoord en dat elke reden een eigen melding is.
const REPOSITORY = 'acme/sjabloon';
const MAP = 'docs/template-changelog.d';
const SLEUTEL = 'docs:changelog-fragment:';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function schrijf(root: string, bestanden: Record<string, string>) {
  for (const [file, content] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

/** Een tijdelijke git-repo; `template: true` zet `onderhoud.repository` in `.claude/gates.json` (de template zelf). */
function repo(opzet: { template: boolean; fragmenten: Record<string, string> }): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-changelog-fragment-'));
  dirs.push(root);
  const gates = {
    ...nieuw(),
    template: { repository: REPOSITORY },
    ...(opzet.template ? { onderhoud: { repository: REPOSITORY } } : {}),
  };
  schrijf(root, {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': codeownersTekst(gates, 'eigenaar'),
    '.claude/settings.json': JSON.stringify({
      permissions: { ask: NIEUW_ALTIJD_VRAGEN.map((glob) => `Edit(${glob})`) },
    }),
    '.claude/gates.json': JSON.stringify(gates),
    ...(opzet.template ? { 'docs/app.md': STUB } : {}),
    ...Object.fromEntries(Object.entries(opzet.fragmenten).map(([naam, tekst]) => [`${MAP}/${naam}`, tekst])),
  });
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

/** De meldingen over fragmenten; elke andere overtreding in de fixture is zelf een fout. */
async function fragmentMeldingen(opzet: {
  template: boolean;
  fragmenten: Record<string, string>;
}): Promise<{ key: string; message: string }[]> {
  const alle = await docsViolations(repo(opzet));
  expect(alle.filter(({ key }) => !key.startsWith(SLEUTEL))).toStrictEqual([]);
  return alle.map(({ key, message }) => ({ key, message }));
}

const fragment = (soort: string, rest: string): string => `---\nsoort: ${soort}\n---\n\n${rest}`;
const GELDIG = fragment('toegevoegd', '- Een wijziging, met spec en pad.\n');
const MET_UPDATE = fragment('gewijzigd', '- Een wijziging.\n\n### Bij een update\n\n- Doe dit in de app.\n');

describe('template-release/AC-1: een geldig fragment is groen', () => {
  test.each(['toegevoegd', 'gewijzigd', 'opgelost', 'verwijderd', 'documentatie'])(
    'template-release/AC-1: soort %s',
    async (soort) => {
      const meldingen = await fragmentMeldingen({
        template: false,
        fragmenten: { 'docs-spec-template-release.md': fragment(soort, '- Een wijziging.\n') },
      });

      expect(meldingen).toStrictEqual([]);
    },
  );

  test('template-release/AC-1: een fragment met "### Bij een update" en een lijstitem eronder, in de template en in een app', async () => {
    const fragmenten = { 'chore-template-release-0-3-0.md': MET_UPDATE, 'docs-spec-template-release-2.md': GELDIG };

    expect(await fragmentMeldingen({ template: true, fragmenten })).toStrictEqual([]);
    expect(await fragmentMeldingen({ template: false, fragmenten })).toStrictEqual([]);
  });

  test('template-release/AC-1: README.md in de map wordt niet als fragment getoetst', async () => {
    const meldingen = await fragmentMeldingen({
      template: false,
      fragmenten: {
        'README.md': '# Fragmenten\n\nGeen front matter en geen soort; dit is uitleg.\n',
        'een.md': GELDIG,
      },
    });

    expect(meldingen).toStrictEqual([]);
  });
});

describe('template-release/AC-1: een ongeldig fragment is rood met docs:changelog-fragment:<bestand> en de reden', () => {
  test.each([
    { naam: 'zonder soort (geen front matter)', bestand: 'kaal.md', tekst: '- Een wijziging.\n', reden: /soort/ },
    {
      naam: 'met een onbekende soort',
      bestand: 'onbekend.md',
      tekst: fragment('nieuw', '- Een wijziging.\n'),
      reden: /soort/,
    },
    {
      naam: 'met een lege soort',
      bestand: 'leeg-soort.md',
      tekst: '---\nsoort:\n---\n\n- Een wijziging.\n',
      reden: /soort/,
    },
    {
      naam: 'zonder lijstitem',
      bestand: 'zonder-lijst.md',
      tekst: fragment('opgelost', 'Alleen een alinea.\n'),
      reden: /lijstitem/,
    },
    {
      naam: 'helemaal zonder inhoud',
      bestand: 'zonder-inhoud.md',
      tekst: '---\nsoort: opgelost\n---\n',
      reden: /lijstitem/,
    },
    {
      naam: 'met een andere ###-kop dan "Bij een update"',
      bestand: 'andere-kop.md',
      tekst: fragment('toegevoegd', '- Een wijziging.\n\n### Toegevoegd\n\n- Nog een.\n'),
      reden: /kop/,
    },
    {
      naam: 'met een ##-kop',
      bestand: 'grote-kop.md',
      tekst: fragment('toegevoegd', '## Een kop\n\n- Een wijziging.\n'),
      reden: /kop/,
    },
    {
      naam: 'met "### Bij een update" zonder lijstitem',
      bestand: 'update-leeg.md',
      tekst: fragment('toegevoegd', '- Een wijziging.\n\n### Bij een update\n\nGeen lijst.\n'),
      reden: /Bij een update/,
    },
    {
      naam: 'met "### Bij een update" als laatste regel',
      bestand: 'update-einde.md',
      tekst: fragment('toegevoegd', '- Een wijziging.\n\n### Bij een update\n'),
      reden: /Bij een update/,
    },
    { naam: 'met hoofdletters in de bestandsnaam', bestand: 'Hoofdletter.md', tekst: GELDIG, reden: /naam/i },
    { naam: 'met een underscore in de bestandsnaam', bestand: 'met_underscore.md', tekst: GELDIG, reden: /naam/i },
    { naam: 'met een bestandsnaam die met een streep begint', bestand: '-streep.md', tekst: GELDIG, reden: /naam/i },
    { naam: 'met een punt in de bestandsnaam', bestand: 'a.b.md', tekst: GELDIG, reden: /naam/i },
  ])('template-release/AC-1: $naam', async ({ bestand, tekst, reden }) => {
    const meldingen = await fragmentMeldingen({ template: false, fragmenten: { [bestand]: tekst } });

    expect(meldingen).toHaveLength(1);
    expect(meldingen[0]?.key.startsWith(SLEUTEL)).toBe(true);
    expect(meldingen[0]?.key.endsWith(bestand)).toBe(true);
    expect(meldingen[0]?.message).toMatch(reden);
  });

  test('template-release/AC-1: elk ongeldig fragment geeft zijn eigen melding naast de geldige', async () => {
    const meldingen = await fragmentMeldingen({
      template: true,
      fragmenten: {
        'goed.md': GELDIG,
        'fout-een.md': fragment('nieuw', '- Een wijziging.\n'),
        'fout-twee.md': fragment('opgelost', 'Geen lijst.\n'),
      },
    });

    expect(meldingen.map(({ key }) => key.slice(key.lastIndexOf(':') + 1)).toSorted()).toStrictEqual([
      'fout-een.md',
      'fout-twee.md',
    ]);
  });
});
