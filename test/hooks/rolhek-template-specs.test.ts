import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { A4_MELDING, beslisOvergang } from '../../rails/hooks/lib/document-state.mjs';
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

// rolhek-lezen/AC-19 (ADR 0099, OV-2): architect en hoofdsessie wijzigen de inhoud van een vervallen spec (overgang `besluit`);
// een vervallen ADR blijft voor elke rol onwijzigbaar (`a4`); een geweigerde spec-overgang noemt de overgang, niet de rollen.
const SPEC_VERVALLEN_INHOUD: [string, string, string] = ['Bestaande kit.', 'Andere kit.', spec('vervallen')];
const SPEC_GEBOUWD_INHOUD: [string, string, string] = ['Bestaande kit.', 'Andere kit.', spec('gebouwd')];
const ADR_VERVALLEN_INHOUD: [string, string, string] = ['Het besluit.', 'Een ander besluit.', adr('vervallen')];
const BESLISROL = ['hoofdsessie', 'architect'] as const;
const ALLEEN_BESLISROL = 'alleen architect en hoofdsessie';
const agentVan = (rol: string): string | undefined => (rol === 'hoofdsessie' ? undefined : rol);
const overgangMelding = (oud: string, nieuw: string): string =>
  `<pad>: de overgang van ${oud} naar ${nieuw} met deze inhoud mag voor geen enkele rol (ADR 0046 punt 6, R-WERK-08)`;

/** Een Write die een bestaand bestand (`basis` op main en in de werkmap) door `inhoud` vervangt. */
const herschrijf = (pad: string, [inhoud, basis]: [string, string], rol: string | undefined) =>
  beslis(
    { tool_name: 'Write', tool_input: { file_path: `${ROOT}/${pad}`, content: inhoud }, ...als(rol) },
    { [pad]: basis },
    pad,
  );

describe.each(MAPPEN)('rolhek-lezen/AC-19 map $naam ($spec/): de inhoud van een vervallen spec', (map) => {
  const pad = `${map.spec}/x.md`;

  test.each(BESLISROL)(
    'rolhek-lezen/AC-19 %s wijzigt de inhoud van een vervallen spec (basis: een voorstel)',
    (rol) => {
      const [van, naar] = SPEC_VERVALLEN_INHOUD;
      expect(wijzig(pad, [van, naar, spec('voorstel')], agentVan(rol)).deny).toStrictEqual([]);
      expect(wijzig(pad, SPEC_VERVALLEN_INHOUD, agentVan(rol)).deny).toStrictEqual([]);
    },
  );

  test('rolhek-lezen/AC-19 de developer is geweigerd voor de inhoud van een vervallen spec, met de melding die architect en hoofdsessie noemt', () => {
    const [van, naar] = SPEC_VERVALLEN_INHOUD;
    expect(alleen(wijzig(pad, [van, naar, spec('voorstel')], 'developer').deny)).not.toContain(ALLEEN_BESLISROL);
    expect(alleen(wijzig(pad, SPEC_VERVALLEN_INHOUD, 'developer').deny)).toContain(ALLEEN_BESLISROL);
  });

  test.each(['tester', 'reviewer', 'docs'])(
    'rolhek-lezen/AC-19 %s heeft geen schrijfrecht op een vervallen spec',
    (rol) => {
      expect(wijzig(pad, SPEC_VERVALLEN_INHOUD, rol).deny).not.toStrictEqual([]);
    },
  );

  test('rolhek-lezen/AC-19 beslisOvergang: de inhoud van een vervallen spec is besluit, ongewijzigd is vrij', () => {
    const [van, naar, basis] = SPEC_VERVALLEN_INHOUD;
    expect(beslisOvergang(pad, basis, basis).uitslag).toBe('vrij');
    expect(beslisOvergang(pad, basis, basis.replace(van, naar)).uitslag).toBe('besluit');
  });

  test.each(BESLISROL)('rolhek-lezen/AC-19 %s wijzigt de inhoud van een gebouwde spec', (rol) => {
    expect(wijzig(pad, SPEC_GEBOUWD_INHOUD, agentVan(rol)).deny).toStrictEqual([]);
  });
});

describe.each(MAPPEN)('rolhek-lezen/AC-19 map $naam ($adr/): een vervallen ADR blijft onwijzigbaar', (map) => {
  const pad = `${map.adr}/0001-x.md`;
  const [van, naar] = ADR_VERVALLEN_INHOUD;

  test.each(perRol)(
    'rolhek-lezen/AC-19 %s: de inhoud van een vervallen ADR geeft a4 met A4_MELDING (basis: een voorgesteld ADR)',
    (_n, rol) => {
      expect(alleen(wijzig(pad, [van, naar, adr('voorgesteld')], rol).deny)).not.toContain(A4_MELDING);
      expect(wijzig(pad, ADR_VERVALLEN_INHOUD, rol).deny).toContain(`<pad>: ${A4_MELDING}`);
    },
  );

  test('rolhek-lezen/AC-19 beslisOvergang: de inhoud van een vervallen ADR is a4, een voorgesteld ADR vrij', () => {
    const basis = ADR_VERVALLEN_INHOUD[2];
    expect(beslisOvergang(pad, adr('voorgesteld'), adr('voorgesteld').replace(van, naar)).uitslag).toBe('vrij');
    expect(beslisOvergang(pad, basis, basis.replace(van, naar)).uitslag).toBe('a4');
  });
});

describe.each(MAPPEN)(
  'rolhek-lezen/AC-19 map $naam ($spec/): een geweigerde spec-overgang noemt de overgang',
  (map) => {
    const pad = `${map.spec}/x.md`;
    const terugGoedgekeurd = spec('goedgekeurd', 'Andere kit.');

    // Alleen de rollen die de statustoets bereiken (hoofdsessie, architect, developer); tester, reviewer en docs krijgen
    // de eigen melding van hun schrijfrecht of van `approvesSpec` (zie het rapport).
    test.each(['hoofdsessie', 'architect', 'developer'])(
      'rolhek-lezen/AC-19 %s: vervallen terug naar goedgekeurd geeft de overgangsmelding, zonder alleen architect en hoofdsessie',
      (rol) => {
        const melding = overgangMelding('vervallen', 'goedgekeurd');
        expect(alleen(herschrijf(pad, [terugGoedgekeurd, spec('voorstel')], agentVan(rol)).deny)).not.toContain(
          melding,
        );
        const deny = herschrijf(pad, [terugGoedgekeurd, spec('vervallen')], agentVan(rol)).deny;
        expect(deny).toContain(melding);
        expect(alleen(deny)).not.toContain(ALLEEN_BESLISROL);
      },
    );

    test('rolhek-lezen/AC-19 beslisOvergang: vervallen naar goedgekeurd met andere inhoud is geweigerd', () => {
      expect(beslisOvergang(pad, spec('voorstel'), terugGoedgekeurd).uitslag).toBe('besluit');
      expect(beslisOvergang(pad, spec('vervallen'), terugGoedgekeurd).uitslag).toBe('geweigerd');
    });
  },
);
