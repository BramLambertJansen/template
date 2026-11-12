import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { codeownersTekst } from '../../scripts/kit/codeowners.mjs';

// Gedeelde fixtures voor de tests van spec padtabel (ADR 0079): de bevroren stand van 30cc352 (oude lijsten, `KRITIEK` uit
// lane.mjs en het register met 26 records) en een kleine gates.json in de nieuwe vorm die elke samenhangregel en de vloer haalt.
export const REPO = path.join(import.meta.dirname, '../..');
const FIXTURES = path.join(import.meta.dirname, 'fixtures/padtabel');

// De bevroren stand van 30cc352 heeft in `agentMerge` nog een sleutel die vervallen is en dicht faalt (agent-merge-niet-kritiek
// AC-8): de fixture wordt gelezen met alleen de huidige sleutels van het blok. Het bronbestand blijft historie en ongewijzigd.
const AGENT_MERGE_SLEUTELS = new Set(['toegestaan', 'kritiek', 'maxRegels', 'maxBytes']);
function metHuidigeSleutels(tekst: string): string {
  const ruw: unknown = JSON.parse(tekst);
  if (typeof ruw !== 'object' || ruw === null) return tekst;
  const blok: unknown = Reflect.get(ruw, 'agentMerge');
  if (typeof blok !== 'object' || blok === null) return tekst;
  const schoon = Object.fromEntries(Object.entries(blok).filter(([sleutel]) => AGENT_MERGE_SLEUTELS.has(sleutel)));
  return JSON.stringify({ ...ruw, agentMerge: schoon });
}

export const OUDE_GATES_TEKST = metHuidigeSleutels(readFileSync(path.join(FIXTURES, 'gates-30cc352.json'), 'utf8'));
export const OUDE_DECISIONS_TEKST = readFileSync(path.join(FIXTURES, 'decisions-30cc352.json'), 'utf8');

/** Een object (geen lijst) of een fout: de fixtures zijn hand geschreven en moeten deze vorm hebben. */
export function object(waarde: unknown): Record<string, unknown> {
  if (typeof waarde !== 'object' || waarde === null || Array.isArray(waarde)) throw new Error('verwacht een object');
  return Object.fromEntries(Object.entries(waarde));
}

export function tekstLijst(waarde: unknown): string[] {
  if (!Array.isArray(waarde) || !waarde.every((item) => typeof item === 'string')) throw new Error('verwacht tekst[]');
  return waarde.map(String);
}

const oudRuw = object(JSON.parse(OUDE_GATES_TEKST));
const oudAgentMerge = object(oudRuw['agentMerge']);

/** De lijsten van 30cc352, zoals ze in `.claude/gates.json` stonden. */
export const OUD = {
  ruw: oudRuw,
  gates: tekstLijst(oudRuw['gates']),
  voorReview: tekstLijst(oudRuw['voorReview']),
  altijdVragen: tekstLijst(oudRuw['altijdVragen']),
  testpaden: tekstLijst(oudRuw['testpaden']),
  toegestaan: tekstLijst(oudAgentMerge['toegestaan']),
  agentKritiek: tekstLijst(oudAgentMerge['kritiek']),
  kritiek: tekstLijst(JSON.parse(readFileSync(path.join(FIXTURES, 'oude-kritiek.json'), 'utf8'))),
};

const STRENG = { schrijven: 'altijdVragen', besluit: 'besluit-pr' };
export const VLOER = [
  '.github/**',
  '.claude/hooks/**',
  '.claude/settings.json',
  '.claude/gates.json',
  '.claude/decisions.json',
  'package.json',
  'pnpm-lock.yaml',
];

/** Rijen in de nieuwe vorm: agent-mergebare app-code, gates, de vloer. */
export function nieuwePaden(): Record<string, Record<string, string>> {
  return {
    'src/**': { besluit: 'agent' },
    'docs/**': { besluit: 'agent' },
    'CHANGELOG.md': { besluit: 'agent' },
    'src/core/**': { schrijven: 'gate' },
    'docs/adr/**': { schrijven: 'gate', besluit: 'besluit-pr' },
    '**/*.test.*': { schrijven: 'gate' },
    'test/**': { schrijven: 'gate' },
    '.claude/**': { schrijven: 'voorReview' },
    ...Object.fromEntries(VLOER.map((glob) => [glob, { ...STRENG }])),
  };
}

/** Een volledige gates.json in de nieuwe vorm (zonder `gates`, `voorReview`, `altijdVragen`, `agentMerge.toegestaan/kritiek`). */
export function nieuw(paden: Record<string, unknown> = nieuwePaden()): Record<string, unknown> {
  return {
    paden,
    merge: 'niet-kritiek',
    agentMerge: { maxRegels: 400, maxBytes: 40000 },
    testpaden: ['**/*.test.*', 'test/**'],
    jsonGates: { 'package.json': ['scripts'] },
    gegenereerd: [],
    migraties: ['db/migrations/**'],
    mcpLezen: [],
    goedkeurders: ['eigenaar'],
    schrijfrecht: {
      architect: ['docs/specs/**', 'docs/adr/**'],
      tester: ['**/*.test.*', 'test/**'],
      reviewer: [],
      docs: ['docs/reviews/**', 'CHANGELOG.md'],
      developer: ['**'],
    },
  };
}

/** De afgeleide gates en altijdVragen van `nieuwePaden()`, met de jsonGates-sleutel `package.json` niet als gate. */
export const NIEUW_GATES = [
  'src/core/**',
  'docs/adr/**',
  '**/*.test.*',
  'test/**',
  '.claude/**',
  ...VLOER.filter((glob) => glob !== 'package.json'),
];
export const NIEUW_ALTIJD_VRAGEN = [...VLOER];

type RepoOpties = { gatesTekst: string; codeowners?: string[]; ask?: string[] };

// GEWIJZIGD (templateregime, ADR 0089 punt 3): CODEOWNERS is gelijk aan `codeownersTekst(gates, eigenaar)` en niet meer aan
// de gates plus jsonGates; zonder `codeowners` maakt de kit die tekst uit `gatesTekst`. Een gates.json die geen afleiding
// geeft (de oude vorm, een onleesbare `paden`) houdt de oude lijst: check-docs slaat de CODEOWNERS-check dan over.
function codeownersVan(gatesTekst: string): string {
  try {
    return codeownersTekst(JSON.parse(gatesTekst), 'eigenaar');
  } catch {
    return [...NIEUW_GATES, 'package.json'].map((glob) => `${glob} @eigenaar`).join('\n') + '\n';
  }
}

/** Een tijdelijke git-repo voor `docsViolations`: CODEOWNERS en de Edit-`ask` spiegelen standaard de nieuwe vorm. */
export function repo({ gatesTekst, codeowners, ask }: RepoOpties): string {
  const root = mkdtempSync(path.join(tmpdir(), 'padtabel-'));
  const vragen = ask ?? NIEUW_ALTIJD_VRAGEN;
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ scripts: {} }),
    '.github/CODEOWNERS':
      codeowners === undefined
        ? codeownersVan(gatesTekst)
        : codeowners.map((glob) => `${glob} @eigenaar`).join('\n') + '\n',
    '.claude/settings.json': JSON.stringify({ permissions: { ask: vragen.map((glob) => `Edit(${glob})`) } }),
    '.claude/gates.json': gatesTekst,
  };
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return root;
}

/** Een pad dat een glob dekt, zoals `voorbeeldPad` in scripts/kit/check-docs.mjs. */
export function voorbeeldPad(glob: string): string {
  return glob.replaceAll('**', 'x/y').replaceAll('*', 'x');
}
