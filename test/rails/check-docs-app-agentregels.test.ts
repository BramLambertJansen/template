import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { APP_STUB } from '../../scripts/kit/app-init.mjs';
import { docsViolations } from '../../scripts/kit/check-docs.mjs';
import { codeownersTekst } from '../../scripts/kit/codeowners.mjs';
import { IN_TE_VULLEN, STUB, skelet } from '../scripts/app-agentregels-kit';
import { NIEUW_ALTIJD_VRAGEN, REPO, nieuw } from './padtabel-kit';

// app-agentregels/AC-2 en AC-3 (docs/template/specs/app-agentregels.md): check-docs regel 13 op tijdelijke git-repo's. In de
// template (`onderhoud.repository` in .claude/gates.json) is `docs/app.md` byte-gelijk aan de stub; overal bestaat het bestand
// als `CLAUDE.md` het importeert. Sleutel `docs:app-md:<…>`, tekst na `docs/app.md: `.
const TEMPLATE_REPO = 'acme/sjabloon';
const AFWIJKING =
  'docs/app.md: wijkt af van de stub; de template wijzigt dit bestand niet (een app herschrijft het, spec app-agentregels)';
const ONTBREEKT = 'docs/app.md: ontbreekt; CLAUDE.md importeert het';
const IMPORT = '@AGENTS.md\n@docs/app.md\n\nAanvullingen voor Claude Code.\n';
const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Opzet {
  /** `true`: gates.json heeft `onderhoud.repository` (de template zelf). */
  template: boolean;
  bestanden: Record<string, string>;
  /** Bestanden die in de werkmap staan maar niet getrackt zijn. */
  ongetrackt?: Record<string, string>;
}

function schrijf(root: string, bestanden: Record<string, string>) {
  for (const [file, content] of Object.entries(bestanden)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
}

function repo({ template, bestanden, ongetrackt = {} }: Opzet): string {
  const root = mkdtempSync(path.join(tmpdir(), 'check-docs-app-agentregels-'));
  dirs.push(root);
  const gates = {
    ...nieuw(),
    template: { repository: TEMPLATE_REPO },
    ...(template ? { onderhoud: { repository: TEMPLATE_REPO } } : {}),
  };
  schrijf(root, {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS': codeownersTekst(gates, 'eigenaar'),
    '.claude/settings.json': JSON.stringify({
      permissions: { ask: NIEUW_ALTIJD_VRAGEN.map((glob) => `Edit(${glob})`) },
    }),
    '.claude/gates.json': JSON.stringify(gates),
    ...bestanden,
  });
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  schrijf(root, ongetrackt);
  return root;
}

/** De meldingen van regel 13, en alle sleutels (een fixture hoort verder schoon te zijn). */
async function regel13(opzet: Opzet): Promise<{ key: string; message: string }[]> {
  const alle = await docsViolations(repo(opzet));
  expect(alle.filter(({ key }) => !key.startsWith('docs:app-md:'))).toStrictEqual([]);
  return alle.map(({ key, message }) => ({ key, message }));
}

describe('app-agentregels/AC-2 check-docs in de template: docs/app.md is de stub', () => {
  test('app-agentregels/AC-2: met de stub groen, met en zonder de import in CLAUDE.md', async () => {
    expect(await regel13({ template: true, bestanden: { 'docs/app.md': STUB } })).toStrictEqual([]);
    expect(await regel13({ template: true, bestanden: { 'docs/app.md': STUB, 'CLAUDE.md': IMPORT } })).toStrictEqual(
      [],
    );
  });

  test.each([
    ['één teken gewijzigd', STUB.replace('Deze repo', 'Deze Repo')],
    ['een teken erbij aan het eind', `${STUB}\n`],
    ['de eindregel weg', STUB.trimEnd()],
    ['het skelet van een app', skelet('Urenregistratie')],
  ])('app-agentregels/AC-2: %s is rood met "wijkt af van de stub"', async (_naam, inhoud) => {
    const meldingen = await regel13({ template: true, bestanden: { 'docs/app.md': inhoud } });

    expect(meldingen.map(({ message }) => message)).toStrictEqual([AFWIJKING]);
    expect(meldingen.map(({ key }) => key.startsWith('docs:app-md:'))).toStrictEqual([true]);
  });

  test('app-agentregels/AC-2: APP_STUB uit scripts/kit/app-init.mjs is precies de stub uit de spec', () => {
    expect(APP_STUB).toBe(STUB);
  });

  test('app-agentregels/AC-2: docs/app.md in de repo zelf is byte-gelijk aan APP_STUB (in de template)', () => {
    const gates: unknown = JSON.parse(readFileSync(path.join(REPO, '.claude/gates.json'), 'utf8'));
    const inTemplate = typeof gates === 'object' && gates !== null && 'onderhoud' in gates;
    const bestand = (() => {
      try {
        return readFileSync(path.join(REPO, 'docs/app.md'));
      } catch {
        return null;
      }
    })();

    expect(bestand).not.toBeNull();
    // In een app is het bestand herschreven (check:new-resource draait deze test na app:init); daar geldt de stub niet.
    if (inTemplate) expect(bestand?.equals(Buffer.from(APP_STUB))).toBe(true);
  });

  test('app-agentregels/AC-2: de repo zelf heeft geen melding van regel 13', async () => {
    const meldingen = (await docsViolations(REPO)).filter(({ key }) => key.startsWith('docs:app-md:'));

    expect(meldingen).toStrictEqual([]);
  });
});

describe('app-agentregels/AC-3 check-docs in een app: het bestand bestaat als CLAUDE.md het importeert', () => {
  test('app-agentregels/AC-3: het skelet van app:init is groen', async () => {
    const bestanden = { 'docs/app.md': skelet('Urenregistratie'), 'CLAUDE.md': IMPORT };

    expect(await regel13({ template: false, bestanden })).toStrictEqual([]);
  });

  test('app-agentregels/AC-3: een ingevuld bestand is groen', async () => {
    const ingevuld = skelet('Urenregistratie').replace(
      IN_TE_VULLEN,
      'Urenregistratie voor een bureau van tien mensen.',
    );
    expect(ingevuld).not.toBe(skelet('Urenregistratie'));

    expect(
      await regel13({ template: false, bestanden: { 'docs/app.md': ingevuld, 'CLAUDE.md': IMPORT } }),
    ).toStrictEqual([]);
  });

  test('app-agentregels/AC-3: de stub van de template is in een app ook groen (bestaande app vóór het skelet)', async () => {
    expect(await regel13({ template: false, bestanden: { 'docs/app.md': STUB, 'CLAUDE.md': IMPORT } })).toStrictEqual(
      [],
    );
  });

  test('app-agentregels/AC-3: zonder docs/app.md en met @docs/app.md in CLAUDE.md rood met "ontbreekt"', async () => {
    const meldingen = await regel13({ template: false, bestanden: { 'CLAUDE.md': IMPORT } });

    expect(meldingen.map(({ message }) => message)).toStrictEqual([ONTBREEKT]);
    expect(meldingen.map(({ key }) => key.startsWith('docs:app-md:'))).toStrictEqual([true]);
  });

  test('app-agentregels/AC-3: een bestand dat er staat maar niet getrackt is, telt als ontbrekend', async () => {
    const meldingen = await regel13({
      template: false,
      bestanden: { 'CLAUDE.md': IMPORT },
      ongetrackt: { 'docs/app.md': skelet('Urenregistratie') },
    });

    expect(meldingen.map(({ message }) => message)).toStrictEqual([ONTBREEKT]);
  });

  test('app-agentregels/AC-3: "ontbreekt" geldt overal, ook in de template', async () => {
    const meldingen = await regel13({ template: true, bestanden: { 'CLAUDE.md': IMPORT } });

    expect(meldingen.map(({ message }) => message)).toStrictEqual([ONTBREEKT]);
  });

  test.each([
    ['zonder CLAUDE.md', {}],
    ['met een CLAUDE.md zonder de import', { 'CLAUDE.md': '@AGENTS.md\n\nAanvullingen.\n' }],
    ['met de import alleen in een codeblok', { 'CLAUDE.md': '@AGENTS.md\n\n```\n@docs/app.md\n```\n' }],
    ['met het pad alleen midden in een zin', { 'CLAUDE.md': '@AGENTS.md\n\nZie @docs/app.md voor de app.\n' }],
  ])('app-agentregels/AC-3: zonder docs/app.md en %s groen', async (_naam, bestanden) => {
    expect(await regel13({ template: false, bestanden })).toStrictEqual([]);
  });
});
