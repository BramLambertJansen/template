import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { beslisOvergang, documentInfo } from '../../rails/hooks/lib/document-state.mjs';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { canRecordStatus } from '../../rails/hooks/lib/task-authority.mjs';

// Spec gebouwd-zonder-nummer (ADR 0104), AC-20, tests vóór de bouw: niemand schrijft nog `status: gebouwd`. Het rolhek weigert
// elke rol een statusregel die met `status: gebouwd` begint en niet letterlijk zo in de vertrouwde basis staat, ook bij een
// nieuw bestand, ook als de vertrouwde basis een besluit heeft of alleen de statusregel verschilt (de weg "status uit main"), met de
// rolhektekst uit de spec (Hergebruik en UX). Toegestaan voor hoofdsessie en architect: `status: gebouwd` naar
// `status: goedgekeurd` bij verder gelijke inhoud, en een wijziging elders in een spec met een ongewijzigde oude gebouwd-regel.
// De developer krijgt gebouwd naar goedgekeurd geweigerd door `recordedStatus` met de ingekorte tekst, omdat `canRecordStatus`
// daarvoor `false` geeft. `beslisOvergang` geeft nooit meer de uitslag `gebouwd`.
const ROOT = '/repo';
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

type Ctx = Parameters<typeof decide>[1];
type Authority = NonNullable<Ctx['authority']>;

const spec = (status: string, tekst = 'Bestaande kit.'): string =>
  `---\nstatus: ${status}\nnamespace: demo\n---\n\n# Demo\n\n## Hergebruik en UX\n\n${tekst}\n\n## Acceptatiecriteria\n\n- **demo/AC-1** — Gegeven iets, dan iets.\n`;

const SPEC_VOORSTEL = 'docs/template/specs/voorstel.md';
const SPEC_GOEDGEKEURD = 'docs/template/specs/goedgekeurd.md';
const SPEC_OUD = 'docs/template/specs/oud.md';
const SPEC_OUD_NUMMER = 'docs/template/specs/oud-nummer.md';
const SPEC_NIEUW = 'docs/template/specs/nieuw.md';
const APP_GOEDGEKEURD = 'docs/specs/goedgekeurd.md';

const FILES: Record<string, string> = {
  [SPEC_VOORSTEL]: spec('voorstel'),
  [SPEC_GOEDGEKEURD]: spec('goedgekeurd'),
  [SPEC_OUD]: spec('gebouwd'),
  [SPEC_OUD_NUMMER]: spec('gebouwd # #5'),
  [APP_GOEDGEKEURD]: spec('goedgekeurd'),
};

function authority(): Authority {
  return {
    registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
    repository: 'BramLambertJansen/template',
    branch: 'feat/x',
    trusted: (file) => FILES[file] ?? null,
    working: (file) => FILES[file] ?? null,
    safe: () => true,
  };
}

type Basis = 'authority' | 'zonder';

function run(payload: unknown, met: Basis = 'authority') {
  return decide(payload, {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => FILES[rel] ?? null,
    committed: (rel: string) => rel in FILES,
    isDir: () => false,
    branch: 'feat/x',
    authority: met === 'authority' ? authority() : null,
  });
}

const as = (agent: string | undefined) => (agent === undefined ? {} : { agent_type: agent });
const write = (file: string, content: string, agent?: string) => ({
  tool_name: 'Write',
  tool_input: { file_path: `${ROOT}/${file}`, content },
  ...as(agent),
});
const edit = (file: string, [from, to]: [string, string], agent?: string) => ({
  tool_name: 'Edit',
  tool_input: { file_path: `${ROOT}/${file}`, old_string: from, new_string: to },
  ...as(agent),
});

const ROLLEN: [string, string | undefined][] = [
  ['hoofdsessie', undefined],
  ['architect', 'architect'],
  ['developer', 'developer'],
  ['tester', 'tester'],
  ['docs', 'docs'],
];
const BASIS: Basis[] = ['authority', 'zonder'];

const weigering = (pad: string) =>
  `${pad}: status: gebouwd schrijft niemand meer; gebouwd volgt uit de AC-dekking op main (ADR 0104)`;
const ingekort = (pad: string) => `${pad}: deze statusovergang heeft geen geldig besluit uit de vertrouwde basis`;

/** Elke schrijfactie die een nieuwe `status: gebouwd`-regel zet, met het pad dat de weigering noemt. */
const GEBOUWD_SCHRIJVEN: [string, string, (agent?: string) => unknown][] = [
  [
    'goedgekeurd naar gebouwd (Edit)',
    SPEC_GOEDGEKEURD,
    (a) => edit(SPEC_GOEDGEKEURD, ['status: goedgekeurd', 'status: gebouwd'], a),
  ],
  [
    'goedgekeurd naar gebouwd # #<n> (Edit)',
    SPEC_GOEDGEKEURD,
    (a) => edit(SPEC_GOEDGEKEURD, ['status: goedgekeurd', 'status: gebouwd # #5'], a),
  ],
  [
    'voorstel naar gebouwd (Edit)',
    SPEC_VOORSTEL,
    (a) => edit(SPEC_VOORSTEL, ['status: voorstel', 'status: gebouwd'], a),
  ],
  ['een nieuw bestand met gebouwd (Write)', SPEC_NIEUW, (a) => write(SPEC_NIEUW, spec('gebouwd'), a)],
  [
    'alleen de statusregel verschilt, hele bestand geschreven (status uit main)',
    SPEC_GOEDGEKEURD,
    (a) => write(SPEC_GOEDGEKEURD, spec('gebouwd'), a),
  ],
  [
    'gebouwd naar gebouwd # #<n> (de regel is niet letterlijk die van main)',
    SPEC_OUD,
    (a) => edit(SPEC_OUD, ['status: gebouwd', 'status: gebouwd # #9'], a),
  ],
  [
    'een nieuwe gevalideerd-sha achter een oude regel',
    SPEC_OUD_NUMMER,
    (a) => edit(SPEC_OUD_NUMMER, ['status: gebouwd # #5', `status: gebouwd # #5; gevalideerd: ${'a'.repeat(40)}`], a),
  ],
  [
    'inhoud en gebouwd tegelijk',
    SPEC_GOEDGEKEURD,
    (a) => write(SPEC_GOEDGEKEURD, spec('gebouwd', 'Andere inhoud.'), a),
  ],
  [
    'een app-spec in docs/specs/',
    APP_GOEDGEKEURD,
    (a) => edit(APP_GOEDGEKEURD, ['status: goedgekeurd', 'status: gebouwd'], a),
  ],
];

describe('AC-20: het rolhek weigert een nieuwe status: gebouwd elke rol', () => {
  describe.each(ROLLEN)('%s', (_rol, agent) => {
    test.each(GEBOUWD_SCHRIJVEN)(
      'gebouwd-zonder-nummer/AC-20: %s: geweigerd met de rolhektekst, met en zonder vertrouwde basis',
      (_naam, pad, maak) => {
        for (const basis of BASIS) expect(run(maak(agent), basis).deny, basis).toContain(weigering(pad));
      },
    );
  });

  test('gebouwd-zonder-nummer/AC-20: de weigering komt ook als de vertrouwde basis al een besluit voor de spec heeft', () => {
    // Een goedgekeurde spec in de vertrouwde basis, met een record in het register: de statusregel gebouwd opent daar niets.
    const metRecord = authority();
    metRecord.registry.decisions.push({
      file: SPEC_GOEDGEKEURD,
      digest: documentInfo(SPEC_GOEDGEKEURD, spec('goedgekeurd'))?.digest ?? '',
      repository: 'BramLambertJansen/template',
      branch: 'feat/x',
      status: 'goedgekeurd',
      paths: [SPEC_GOEDGEKEURD],
    });
    for (const [, agent] of ROLLEN) {
      const beslissing = decide(edit(SPEC_GOEDGEKEURD, ['status: goedgekeurd', 'status: gebouwd'], agent), {
        root: ROOT,
        cwd: ROOT,
        config,
        read: (rel: string) => FILES[rel] ?? null,
        committed: (rel: string) => rel in FILES,
        isDir: () => false,
        branch: 'feat/x',
        authority: metRecord,
      });
      expect(beslissing.deny, String(agent)).toContain(weigering(SPEC_GOEDGEKEURD));
    }
  });
});

describe('AC-20: gebouwd naar goedgekeurd en een ongewijzigde oude regel', () => {
  const NAAR_GOEDGEKEURD: [string, string, string][] = [
    ['status: gebouwd', SPEC_OUD, 'status: gebouwd'],
    ['status: gebouwd # #5', SPEC_OUD_NUMMER, 'status: gebouwd # #5'],
  ];

  test.each(NAAR_GOEDGEKEURD)(
    'gebouwd-zonder-nummer/AC-20: hoofdsessie en architect mogen "%s" naar goedgekeurd zetten bij verder gelijke inhoud',
    (_regel, pad, oud) => {
      for (const basis of BASIS)
        for (const agent of [undefined, 'architect']) {
          const beslissing = run(edit(pad, [oud, 'status: goedgekeurd'], agent), basis);
          expect([beslissing.deny, beslissing.ask], `${String(agent)} ${basis}`).toStrictEqual([[], []]);
        }
    },
  );

  test.each(NAAR_GOEDGEKEURD)(
    'gebouwd-zonder-nummer/AC-20: de developer krijgt "%s" naar goedgekeurd geweigerd door recordedStatus, met de ingekorte tekst',
    (_regel, pad, oud) => {
      const beslissing = run(edit(pad, [oud, 'status: goedgekeurd'], 'developer'));
      expect(beslissing.deny).toContain(ingekort(pad));
      expect(beslissing.deny.join('\n')).not.toContain('bouw-PR');
      expect(beslissing.deny.join('\n')).not.toContain('ADR 0095');
    },
  );

  test('gebouwd-zonder-nummer/AC-20: de twee bestaande weigeringen verliezen hun staart over de bouw-PR', () => {
    const besluit = run(edit(SPEC_GOEDGEKEURD, ['status: goedgekeurd', 'status: voorstel'], 'developer'));
    const eigenaarstatus = run(write(SPEC_GOEDGEKEURD, spec('goedgekeurd', 'Andere inhoud.'), 'developer'));
    const alles = [...besluit.deny, ...eigenaarstatus.deny].join('\n');
    expect(alles).not.toContain('status: gebouwd zetten hoofdsessie en architect in de bouw-PR (ADR 0095)');
    expect(eigenaarstatus.deny).toContain(
      `${SPEC_GOEDGEKEURD}: een eigenaarstatus of de inhoud van een goedgekeurde spec schrijven alleen architect en hoofdsessie (ADR 0046 punt 6)`,
    );
    const developerOud = run(edit(SPEC_OUD, ['status: gebouwd', 'status: goedgekeurd'], 'developer'));
    expect(developerOud.deny.join('\n')).not.toContain(
      'status: gebouwd zetten hoofdsessie en architect in de bouw-PR (ADR 0095)',
    );
  });

  test('gebouwd-zonder-nummer/AC-20: een wijziging elders in een spec met een ongewijzigde oude gebouwd-regel mag voor hoofdsessie en architect, de regel zelf aanraken niet', () => {
    for (const [, pad] of [
      ['zonder nummer', SPEC_OUD],
      ['met nummer', SPEC_OUD_NUMMER],
    ] as const)
      for (const agent of [undefined, 'architect']) {
        const elders = run(edit(pad, ['Bestaande kit.', 'Nieuw gedrag.'], agent));
        expect([elders.deny, elders.ask], `${pad} ${String(agent)}`).toStrictEqual([[], []]);
        // Controle: dezelfde Write met een andere gebouwd-regel is geweigerd.
        const regel = run(write(pad, spec('gebouwd # #77', 'Nieuw gedrag.'), agent));
        expect(regel.deny, `${pad} ${String(agent)} andere regel`).toContain(weigering(pad));
      }
  });
});

describe('AC-20: beslisOvergang en canRecordStatus kennen gebouwd niet meer', () => {
  const OVERGANGEN: [string, string | null, string][] = [
    ['goedgekeurd naar gebouwd', spec('goedgekeurd'), spec('gebouwd')],
    ['voorstel naar gebouwd', spec('voorstel'), spec('gebouwd')],
    ['een nieuwe spec met gebouwd', null, spec('gebouwd')],
    ['gebouwd naar gebouwd # #5', spec('gebouwd'), spec('gebouwd # #5')],
    ['gebouwd blijft, inhoud wijzigt', spec('gebouwd'), spec('gebouwd', 'Andere inhoud.')],
    [
      'gebouwd blijft, de markering gaat weg',
      spec('gebouwd').replace('AC-1** —', 'AC-1** (nog niet gebouwd) —'),
      spec('gebouwd'),
    ],
    ['gebouwd naar goedgekeurd', spec('gebouwd'), spec('goedgekeurd')],
    ['gebouwd naar vervallen', spec('gebouwd'), spec('vervallen')],
  ];

  test('gebouwd-zonder-nummer/AC-20: beslisOvergang geeft bij geen enkele overgang nog de uitslag gebouwd', () => {
    const gebouwd = OVERGANGEN.flatMap(([naam, voor, na]) =>
      [SPEC_GOEDGEKEURD, APP_GOEDGEKEURD]
        .filter((bestand) => beslisOvergang(bestand, voor, na).uitslag === 'gebouwd')
        .map((bestand) => `${naam} (${bestand})`),
    );
    expect(gebouwd).toStrictEqual([]);
  });

  test('gebouwd-zonder-nummer/AC-20: gebouwd naar goedgekeurd met gelijke inhoud is geen geweigerde overgang meer voor de hoofdsessie', () => {
    expect(beslisOvergang(SPEC_OUD, spec('gebouwd'), spec('goedgekeurd')).uitslag).not.toBe('geweigerd');
  });

  test('gebouwd-zonder-nummer/AC-20: canRecordStatus is false als de gebouwd-regel afwijkt van de vertrouwde basis, en blijft vastlegbaar als hij gelijk is', () => {
    const maak = (trusted: string) => ({
      registry: { version: 1, requiredChecks: ['gate:fast'], decisions: [] },
      repository: 'BramLambertJansen/template',
      branch: 'feat/x',
      trusted: () => trusted,
      working: () => trusted,
      safe: () => true,
    });
    // De regel wijkt af (gebouwd naar goedgekeurd, en andersom): niet vastlegbaar.
    expect(canRecordStatus({ file: SPEC_OUD, text: spec('goedgekeurd') }, maak(spec('gebouwd')))).toBe(false);
    expect(canRecordStatus({ file: SPEC_OUD, text: spec('gebouwd') }, maak(spec('goedgekeurd')))).toBe(false);
    expect(canRecordStatus({ file: SPEC_OUD, text: spec('gebouwd # #5') }, maak(spec('gebouwd')))).toBe(false);
    // Een ongewijzigde oude regel bij gelijke inhoud blijft vastlegbaar, zoals een goedgekeurde.
    expect(canRecordStatus({ file: SPEC_OUD, text: spec('gebouwd') }, maak(spec('gebouwd')))).toBe(true);
    // Een commentaarwijziging bij goedgekeurd blijft zoals nu.
    expect(
      canRecordStatus({ file: SPEC_GOEDGEKEURD, text: spec('goedgekeurd') }, maak(spec('goedgekeurd # #12'))),
    ).toBe(true);
  });
});
