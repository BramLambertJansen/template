import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// docs/template/specs/templateregime.md AC-10 en AC-11 (ADR 0089 punt 1): het rolhek behandelt `docs/template/specs/` en
// `docs/template/adr/` exact als `docs/specs/` en `docs/adr/`. Per rol dezelfde beslissing voor beide paden (pariteit), plus de
// verwachte uitkomst zelf, zodat twee even foute uitkomsten niet groen blijven.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

type Ctx = Parameters<typeof decide>[1];
type Payload = Parameters<typeof decide>[0];

const spec = (status: string, tekst = 'Bestaande kit.'): string =>
  `---\nstatus: ${status}\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\n${tekst}\n`;
const adr = (status: string, tekst = 'Het besluit.'): string => `# 0001 — Demo\n\nStatus: ${status}\n\n${tekst}\n`;

/** De twee kanten van de vergelijking: de map van de app en die van de template. */
const MAPPEN = [
  { naam: 'app', spec: 'docs/specs', adr: 'docs/adr' },
  { naam: 'template', spec: 'docs/template/specs', adr: 'docs/template/adr' },
] as const;

// Wijzigingen als [van, naar, basis]: `basis` is de tekst op main en in de werkmap.
const SPEC_INHOUD: [string, string, string] = ['Bestaande kit.', 'Andere kit.', spec('voorstel')];
const SPEC_GOEDKEUREN: [string, string, string] = ['status: voorstel', 'status: goedgekeurd', spec('voorstel')];
const ADR_HERSCHRIJVEN: [string, string, string] = ['Het besluit.', 'Een ander besluit.', adr('geaccepteerd')];

const ROLLEN: readonly (string | undefined)[] = [undefined, 'architect', 'developer', 'tester', 'reviewer', 'docs'];
const naam = (rol: string | undefined): string => rol ?? 'hoofdsessie';
const als = (rol: string | undefined) => (rol === undefined ? {} : { agent_type: rol });
const perRol = ROLLEN.map((rol) => [naam(rol), rol] as const);

/** Een context waarin `bestanden` op main staan (de vertrouwde basis) en in de werkmap. */
function ctx(bestanden: Record<string, string>): Ctx {
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => bestanden[rel] ?? null,
    committed: (rel: string) => rel in bestanden,
    isDir: () => false,
    branch: 'feat/x',
    authority: {
      registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
      repository: 'BramLambertJansen/template',
      branch: 'feat/x',
      trusted: (file) => bestanden[file] ?? null,
      working: (file) => bestanden[file] ?? null,
      safe: () => true,
    },
  };
}

interface Beslissing {
  deny: string[];
  ask: string[];
  context: string[];
}

/** De beslissing van het rolhek, met het pad vervangen door `<pad>` zodat beide mappen vergelijkbaar worden. */
function beslis(payload: Payload, bestanden: Record<string, string>, pad: string): Beslissing {
  const uit = decide(payload, ctx(bestanden));
  const neutraal = (regels: readonly string[]) => regels.map((regel) => regel.replaceAll(pad, '<pad>'));
  return { deny: neutraal(uit.deny), ask: neutraal(uit.ask), context: neutraal(uit.context) };
}

const schrijf = (pad: string, content: string, rol: string | undefined) =>
  beslis({ tool_name: 'Write', tool_input: { file_path: `${ROOT}/${pad}`, content }, ...als(rol) }, {}, pad);

const wijzig = (pad: string, [van, naar, basis]: [string, string, string], rol: string | undefined) =>
  beslis(
    { tool_name: 'Edit', tool_input: { file_path: `${ROOT}/${pad}`, old_string: van, new_string: naar }, ...als(rol) },
    { [pad]: basis },
    pad,
  );

const verwijder = (pad: string, basis: string, rol: string | undefined) =>
  beslis({ tool_name: 'Bash', tool_input: { command: `rm ${pad}` }, ...als(rol) }, { [pad]: basis }, pad);

const alleen = (regels: readonly string[]): string => regels.join('\n');
const GEEN_SPEC = 'de developer schrijft geen spec; dat doet de architect';

describe('templateregime/AC-10 rolhek: docs/template/specs/ is een specmap zoals docs/specs/', () => {
  test.each(perRol)(
    'templateregime/AC-10 %s: een nieuwe spec krijgt in beide mappen dezelfde beslissing',
    (_n, rol) => {
      const [app, template] = MAPPEN.map((map) => schrijf(`${map.spec}/x.md`, spec('voorstel'), rol));
      expect(template).toStrictEqual(app);
    },
  );

  test.each(perRol)(
    'templateregime/AC-10 %s: inhoud van een bestaande spec wijzigen krijgt in beide mappen dezelfde beslissing',
    (_n, rol) => {
      const [app, template] = MAPPEN.map((map) => wijzig(`${map.spec}/x.md`, SPEC_INHOUD, rol));
      expect(template).toStrictEqual(app);
    },
  );

  test.each(perRol)(
    'templateregime/AC-10 %s: een spec op goedgekeurd zetten krijgt in beide mappen dezelfde beslissing',
    (_n, rol) => {
      const [app, template] = MAPPEN.map((map) => wijzig(`${map.spec}/x.md`, SPEC_GOEDKEUREN, rol));
      expect(template).toStrictEqual(app);
    },
  );

  describe.each(MAPPEN)('map $naam ($spec/)', (map) => {
    const pad = `${map.spec}/x.md`;

    test('templateregime/AC-10 de developer schrijft geen spec: nieuwe spec en wijziging geweigerd met verwijzing naar de architect', () => {
      const nieuw = schrijf(pad, spec('voorstel'), 'developer');
      const wijziging = wijzig(pad, SPEC_INHOUD, 'developer');
      expect([alleen(nieuw.deny), alleen(wijziging.deny)]).toStrictEqual([
        expect.stringContaining(GEEN_SPEC),
        expect.stringContaining(GEEN_SPEC),
      ]);
    });

    test('templateregime/AC-10 de architect mag een spec schrijven en wijzigen', () => {
      expect([
        schrijf(pad, spec('voorstel'), 'architect').deny,
        wijzig(pad, SPEC_INHOUD, 'architect').deny,
      ]).toStrictEqual([[], []]);
    });

    test('templateregime/AC-10 de hoofdsessie mag een spec schrijven en wijzigen', () => {
      expect([schrijf(pad, spec('voorstel'), undefined).deny, wijzig(pad, SPEC_INHOUD, undefined).deny]).toStrictEqual([
        [],
        [],
      ]);
    });

    test.each(['tester', 'reviewer', 'docs'])(
      'templateregime/AC-10 de rol %s heeft geen schrijfrecht op de specmap',
      (rol) => {
        expect(alleen(schrijf(pad, spec('voorstel'), rol).deny)).toContain(`rol ${rol} mag <pad> niet schrijven`);
      },
    );

    test('templateregime/AC-10 een spec op goedgekeurd zetten is voor de developer geweigerd', () => {
      expect(wijzig(pad, SPEC_GOEDKEUREN, 'developer').deny).not.toStrictEqual([]);
    });
  });
});

describe('templateregime/AC-11 rolhek: docs/template/adr/ is een ADR-map zoals docs/adr/', () => {
  test.each(perRol)(
    'templateregime/AC-11 %s: een nieuw voorgesteld ADR krijgt in beide mappen dezelfde beslissing',
    (_n, rol) => {
      const [app, template] = MAPPEN.map((map) => schrijf(`${map.adr}/0001-x.md`, adr('voorgesteld'), rol));
      expect(template).toStrictEqual(app);
    },
  );

  test.each(perRol)(
    'templateregime/AC-11 %s: een geaccepteerd ADR herschrijven krijgt in beide mappen dezelfde beslissing',
    (_n, rol) => {
      const [app, template] = MAPPEN.map((map) => wijzig(`${map.adr}/0001-x.md`, ADR_HERSCHRIJVEN, rol));
      expect(template).toStrictEqual(app);
    },
  );

  test.each(perRol)(
    'templateregime/AC-11 %s: een geaccepteerd ADR verwijderen krijgt in beide mappen dezelfde beslissing',
    (_n, rol) => {
      const [app, template] = MAPPEN.map((map) => verwijder(`${map.adr}/0001-x.md`, adr('geaccepteerd'), rol));
      expect(template).toStrictEqual(app);
    },
  );

  describe.each(MAPPEN)('map $naam ($adr/)', (map) => {
    const pad = `${map.adr}/0001-x.md`;

    test('templateregime/AC-11 de architect en de hoofdsessie schrijven een nieuw voorgesteld ADR', () => {
      expect([
        schrijf(pad, adr('voorgesteld'), 'architect').deny,
        schrijf(pad, adr('voorgesteld'), undefined).deny,
      ]).toStrictEqual([[], []]);
    });

    test('templateregime/AC-11 de developer herschrijft een geaccepteerd ADR niet (A4)', () => {
      expect(wijzig(pad, ADR_HERSCHRIJVEN, 'developer').deny).not.toStrictEqual([]);
    });
  });
});
