import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { expectAbsent } from '../support/absence';
import * as prMerge from '../../scripts/kit/pr-merge.mjs';
import { voorwaarden } from '../../scripts/kit/pr-merge.mjs';

// docs/specs/templateregime.md, stap 3 (AC-7, AC-9 deel "verdwijnt in stap 3", AC-13) en ADR 0089 punt 5: de documentbewaking
// van de template verdwijnt (check-document-status, lane, diff-guard, agent-merge, document-status-lokaal, functional-ui-status,
// adr-herzien, drie jobs in guard.yml, `document-status` in requiredChecks, de inhoudstoets van `pnpm pr:merge`). Wat blijft:
// check-core, de verplichte CI-checks op code, de effecttoets en de modus `merge` van pr:merge, `rails/hooks/lib/document-state.mjs`.
const ROOT = path.resolve(import.meta.dirname, '../..');
const lees = (pad: string): string => readFileSync(path.join(ROOT, pad), 'utf8');

const VERWIJDERD = [
  'check-document-status',
  'lane',
  'diff-guard',
  'agent-merge',
  'document-status-lokaal',
  'functional-ui-status',
  'adr-herzien',
] as const;
const ALTERNATIEF = VERWIJDERD.join('|');

/** Alle bestanden onder `map` (relatief aan de root), zonder node_modules, .git en .cache. */
function bestanden(map: string): string[] {
  const volledig = path.join(ROOT, map);
  if (!existsSync(volledig)) return [];
  return readdirSync(volledig).flatMap((naam) => {
    if (['node_modules', '.git', '.cache'].includes(naam)) return [];
    const rel = path.posix.join(map, naam);
    return statSync(path.join(ROOT, rel)).isDirectory() ? bestanden(rel) : [rel];
  });
}

function job(tekst: string, naam: string): string | null {
  const start = tekst.search(new RegExp(`^ {2}${naam}:$`, 'm'));
  if (start < 0) return null;
  const rest = tekst.slice(start + 1);
  const volgende = rest.search(/^ {2}[a-z][a-z-]*:$/m);
  return volgende < 0 ? rest : rest.slice(0, volgende);
}

describe('templateregime/AC-7 de scripts van de documentbewaking bestaan niet meer', () => {
  test('templateregime/AC-7: de zeven scripts van de documentbewaking bestaan niet meer in scripts/kit/', () => {
    const bestaand = (namen: readonly string[]): string[] =>
      namen.filter((naam) => existsSync(path.join(ROOT, `scripts/kit/${naam}.mjs`)));
    // Controle dat de toets bestaande scripts ziet: check-core en document-status blijven.
    expect(bestaand(['check-core', 'document-status'])).toEqual(['check-core', 'document-status']);
    expect(bestaand(VERWIJDERD)).toEqual([]);
  });

  test('templateregime/AC-7: rails/hooks/lib/document-state.mjs blijft, met wat check-docs, docs:status en het rolhek gebruiken', async () => {
    expect(existsSync(path.join(ROOT, 'rails/hooks/lib/document-state.mjs'))).toBe(true);
    const module: Record<string, unknown> = await import('../../rails/hooks/lib/document-state.mjs');
    for (const naam of ['documentInfo', 'documentKind', 'beslisOvergang', 'acIds', 'builtReference']) {
      expect(typeof module[naam], `document-state.mjs exporteert ${naam}`).toBe('function');
    }
  });
});

describe('templateregime/AC-7 guard.yml', () => {
  const workflow = lees('.github/workflows/guard.yml');

  test.each(['diff-guard', 'agent-merge', 'document-status'])(
    'templateregime/AC-7: guard.yml heeft geen job %s',
    (naam) => {
      expect(job(workflow, naam)).toBeNull();
    },
  );

  test('templateregime/AC-7: guard.yml noemt geen verwijderd script en geen oordeel agent-merge', () => {
    const genoemd = VERWIJDERD.filter((naam) => workflow.includes(`${naam}.mjs`));
    expect(genoemd).toEqual([]);
    expectAbsent(workflow, /outputs\.agent-merge|needs: diff-guard/, {
      recognizes: [
        'needs: diff-guard',
        "if: needs.diff-guard.outputs.agent-merge == 'ja'",
        'agent-merge: ${{ steps.diff-guard.outputs.agent-merge }}',
      ],
      allows: ['needs: check-core', 'name: check-core'],
    });
  });

  test('templateregime/AC-7: guard.yml houdt de job check-core, die de PR als git-data behandelt', () => {
    const tekst = job(workflow, 'check-core');
    expect(tekst).not.toBeNull();
    expect(tekst).toMatch(/^ {4}name: check-core$/m);
    expect(tekst).toContain('node scripts/kit/check-core.mjs');
    expect(tekst).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(tekst).toContain('persist-credentials: false');
    expect(workflow).toMatch(/^on:\n {2}pull_request_target:/m);
  });
});

describe('templateregime/AC-7 requiredChecks', () => {
  const TIEN = [
    'gate:fast',
    'gate:slow',
    'secrets',
    'image',
    'check:new-resource',
    'check-core',
    'codeql (javascript-typescript)',
    'codeql (actions)',
    'osv-scanner',
    'leerpunt-bewijs',
  ];

  function requiredChecks(): string[] {
    const ruw: unknown = JSON.parse(lees('.claude/decisions.json'));
    const lijst: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, 'requiredChecks') : undefined;
    if (!Array.isArray(lijst)) throw new Error('requiredChecks ontbreekt in .claude/decisions.json');
    return lijst.map(String);
  }

  test('templateregime/AC-7: requiredChecks bevat document-status niet meer', () => {
    expect(requiredChecks()).not.toContain('document-status');
  });

  test('templateregime/AC-7: requiredChecks bevat de tien andere checks, niet meer en niet minder', () => {
    expect([...requiredChecks()].sort()).toEqual([...TIEN].sort());
  });
});

describe('templateregime/AC-7 package.json, lefthook.yml en de rest van scripts/, rails/ en .github/', () => {
  const NAAM = new RegExp(`(?<![\\w-])(${ALTERNATIEF})\\.mjs`);

  test('templateregime/AC-7: package.json en lefthook.yml verwijzen naar geen verwijderd script', () => {
    const gevonden = ['package.json', 'lefthook.yml'].flatMap((bestand) =>
      lees(bestand)
        .split('\n')
        .filter((regel) => NAAM.test(regel) && !regel.trim().startsWith('#'))
        .map((regel) => `${bestand}: ${regel.trim()}`),
    );
    expect(gevonden).toEqual([]);
  });

  test('templateregime/AC-7: pnpm docs:status wijst nog naar scripts/kit/document-status.mjs', () => {
    const ruw: unknown = JSON.parse(lees('package.json'));
    const scripts: unknown = typeof ruw === 'object' && ruw !== null ? Reflect.get(ruw, 'scripts') : undefined;
    const docsStatus: unknown =
      typeof scripts === 'object' && scripts !== null ? Reflect.get(scripts, 'docs:status') : undefined;
    expect(docsStatus).toBe('node scripts/kit/document-status.mjs');
    expect(existsSync(path.join(ROOT, 'scripts/kit/document-status.mjs'))).toBe(true);
  });

  // Een import (`from './x.mjs'`, `import('./x.mjs')`) of een aanroep (`node scripts/kit/x.mjs`, `run: … x.mjs`). Een pad als
  // tekenreeks in de padtabel of CODEOWNERS is geen aanroep en telt hier niet.
  const IMPORT = new RegExp(`(?:from\\s+|import\\s*\\(\\s*)['"][^'"]*(?<![\\w-])(?:${ALTERNATIEF})\\.mjs['"]`);
  const AANROEP = new RegExp(
    `(?:\\bnode\\s|\\brun:|execFileSync\\(|spawnSync\\()[^\\n]*scripts/kit/(?:${ALTERNATIEF})\\.mjs`,
  );

  test('templateregime/AC-7: geen bestand onder scripts/, rails/ of .github/ importeert of roept een verwijderd script aan', () => {
    const eigen = new Set(VERWIJDERD.map((naam) => `scripts/kit/${naam}.mjs`));
    const gevonden = ['scripts', 'rails', '.github']
      .flatMap(bestanden)
      .filter((bestand) => !eigen.has(bestand) && /\.(?:mjs|js|ts|sh|ya?ml|json)$/.test(bestand))
      .flatMap((bestand) =>
        lees(bestand)
          .split('\n')
          .filter(
            (regel) => !regel.trim().startsWith('//') && !regel.trim().startsWith('*') && !regel.trim().startsWith('#'),
          )
          .filter((regel) => IMPORT.test(regel) || AANROEP.test(regel))
          .map((regel) => `${bestand}: ${regel.trim()}`),
      );
    expect(gevonden).toEqual([]);
  });
});

describe('templateregime/AC-9 check-docs na stap 3', () => {
  const bron = lees('scripts/kit/check-docs.mjs');

  test('templateregime/AC-9: check-docs.mjs exporteert en gebruikt adrHerzienViolations niet meer', async () => {
    expectAbsent(bron, /adrHerzienViolations|adr-herzien/, {
      recognizes: ['adrHerzienViolations', "from './adr-herzien.mjs'", 'docs:adr-herzien:<A>:<B>'],
      allows: ['agentMergeViolations', 'docsViolations'],
    });
    const module: Record<string, unknown> = await import('../../scripts/kit/check-docs.mjs');
    expect('adrHerzienViolations' in module).toBe(false);
  });

  test('templateregime/AC-9: de archiefnaamregel ("een naam komt niet terug", ADR 0080) is uit check-docs weg', () => {
    expectAbsent(bron, /de naam staat ook in docs\/specs\/archief\/|een naam komt niet terug/, {
      recognizes: [
        'de naam staat ook in docs/specs/archief/; een naam komt niet terug (ADR 0080)',
        'een naam komt niet terug',
      ],
      allows: ['docs/specs/archief/'],
    });
  });

  test('templateregime/AC-9: check-docs importeert niets uit een verwijderd script', () => {
    const imports = bron
      .split('\n')
      .filter((regel) => /^\s*(?:import\b|\} from)/.test(regel))
      .filter((regel) => new RegExp(`(?<![\\w-])(?:${ALTERNATIEF})\\.mjs`).test(regel));
    expect(imports).toEqual([]);
  });
});

describe('templateregime/AC-7 pnpm pr:merge zonder inhoudstoets', () => {
  const REPO = 'BramLambertJansen/template';
  const HEAD = 'a'.repeat(40);
  const MAIN = 'b'.repeat(40);
  const ACTIONS = 15368;
  const VEREIST = ['gate:fast', 'leerpunt-bewijs'];
  const b64 = (waarde: unknown): string => Buffer.from(JSON.stringify(waarde)).toString('base64');
  type Wereld = Record<string, unknown>;

  const check = (name: string, sha: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
    id: 1,
    name,
    head_sha: sha,
    status: 'completed',
    conclusion: 'success',
    app: { id: ACTIONS },
    ...extra,
  });
  const PR = { state: 'open', draft: false, base: { ref: 'main' }, head: { sha: HEAD, repo: { full_name: REPO } } };

  /** Een mergebare wereld zonder bestandslijst, zonder blok `agentMerge`, zonder job `agent-merge` en zonder workflow-runs. */
  function goed(): Wereld {
    return {
      [`repos/${REPO}/branches/main`]: { commit: { sha: MAIN } },
      [`repos/${REPO}/contents/.claude/gates.json?ref=${MAIN}`]: { content: b64({ merge: 'niet-kritiek' }) },
      [`repos/${REPO}/contents/.claude/decisions.json?ref=${MAIN}`]: { content: b64({ requiredChecks: VEREIST }) },
      [`repos/${REPO}/pulls/7`]: { ...PR, additions: 9000, deletions: 9000 },
      [`repos/${REPO}/compare/${MAIN}...${HEAD}`]: { behind_by: 0 },
      [`repos/${REPO}/commits/${HEAD}/check-runs`]: { check_runs: VEREIST.map((naam) => check(naam, HEAD)) },
      [`repos/${REPO}/commits/${MAIN}/check-runs`]: { check_runs: [check('gate:fast', MAIN)] },
      [`repos/${REPO}/issues/7/comments`]: [
        { user: { login: 'BramLambertJansen' }, body: `Review ${HEAD}: geen blokkerende bevindingen` },
      ],
    };
  }

  function api(wereld: Wereld, gelezen: string[] = []) {
    return (endpoint: string): unknown => {
      const sleutel = endpoint.replace(/[?&]per_page=100&page=\d+$/, '');
      gelezen.push(sleutel);
      if (!(sleutel in wereld)) throw new Error(`onbekend endpoint ${sleutel}`);
      return wereld[sleutel];
    };
  }

  function redenen(aanpassing: (w: Wereld) => void = () => {}): string {
    const wereld = goed();
    aanpassing(wereld);
    return voorwaarden(api(wereld), { repo: REPO, nummer: 7, head: HEAD }).join('\n');
  }

  const zet = (sleutel: string, waarde: unknown) => (w: Wereld) => {
    w[`repos/${REPO}/${sleutel}`] = waarde;
  };

  test('templateregime/AC-7: pr:merge doet geen inhoudstoets: een PR van 18.000 regels zonder agentMerge-blok, bestandslijst of job agent-merge is mergebaar', () => {
    expect(redenen()).toBe('');
  });

  test('templateregime/AC-7: pr:merge leest geen bestandslijst en geen workflow-run (de inhoudstoets en de job agent-merge zijn weg)', () => {
    // Ook met het oude blok `agentMerge` op main (een app die nog niet is bijgewerkt) leest het script geen bestanden of runs.
    const gelezen: string[] = [];
    const wereld = goed();
    zet('contents/.claude/gates.json?ref=' + MAIN, {
      content: b64({
        merge: 'niet-kritiek',
        agentMerge: { toegestaan: ['src/**'], kritiek: [], maxRegels: 400, maxBytes: 40000 },
      }),
    })(wereld);
    try {
      voorwaarden(api(wereld, gelezen), { repo: REPO, nummer: 7, head: HEAD });
    } catch {
      // Een onbekend endpoint gooit in de stub; het gaat om wat het script probeerde te lezen.
    }
    expect(gelezen.filter((endpoint) => /\/files|actions\/runs|check_suite/.test(endpoint))).toEqual([]);
  });

  test('templateregime/AC-7: pr:merge exporteert omvangRedenen en guardRedenen niet meer en leest agent-merge.mjs niet meer', () => {
    expect(Reflect.has(prMerge, 'omvangRedenen')).toBe(false);
    expect(Reflect.has(prMerge, 'guardRedenen')).toBe(false);
    expectAbsent(lees('scripts/kit/pr-merge.mjs'), /agent-merge\.mjs|maxBytes|maxRegels|agentMerge/, {
      recognizes: ["} from './agent-merge.mjs';", 'agentMerge.maxBytes', 'agentMerge.maxRegels', 'agentMerge'],
      allows: ['niet-kritiek', 'leesModus', 'beoordeelMerge'],
    });
  });

  test('templateregime/AC-7: pr:merge weigert nog steeds een andere head dan de lokale HEAD', () => {
    expect(redenen(zet('pulls/7', { ...PR, head: { sha: 'c'.repeat(40), repo: { full_name: REPO } } }))).toMatch(
      /lokale HEAD/,
    );
  });

  test('templateregime/AC-7: pr:merge zet de head-SHA als voorwaarde van de squash-merge', () => {
    expect(lees('scripts/kit/pr-merge.mjs')).toMatch(/`sha=\$\{head\}`/);
  });

  test('templateregime/AC-7: pr:merge weigert nog steeds een verplichte check die niet groen is', () => {
    const rood = zet(`commits/${HEAD}/check-runs`, {
      check_runs: [check('gate:fast', HEAD, { conclusion: 'failure' }), check('leerpunt-bewijs', HEAD)],
    });
    expect(redenen(rood)).toMatch(/verplichte checks niet groen/);
  });

  test('templateregime/AC-7: pr:merge weigert nog steeds als main niet groen is', () => {
    const rood = zet(`commits/${MAIN}/check-runs`, {
      check_runs: [check('gate:fast', MAIN, { conclusion: 'failure' })],
    });
    expect(redenen(rood)).toMatch(/main is niet groen/);
  });

  test.each([
    ['modus eigenaar', { content: b64({ merge: 'eigenaar' }) }],
    ['modus ontbreekt', { content: b64({}) }],
    ['gates.json onleesbaar', { content: 'kapot' }],
  ])('templateregime/AC-7: pr:merge houdt de modus merge uit gates.json: %s weigert', (_naam, gates) => {
    expect(redenen(zet(`contents/.claude/gates.json?ref=${MAIN}`, gates))).toMatch(/modus/);
  });

  test('templateregime/AC-7: pr:merge doet de effecttoets (verifyEffect uit pr-verify.mjs) vóór de merge-aanroep', () => {
    const bron = lees('scripts/kit/pr-merge.mjs');
    expect(bron).toMatch(/import\s*\{[^}]*\bverifyEffect\b[^}]*\}\s*from\s*'\.\/pr-verify\.mjs'/);
    const toets = bron.indexOf('verifyEffect(root)');
    const merge = bron.indexOf("'PUT'");
    expect(toets).toBeGreaterThan(-1);
    expect(merge).toBeGreaterThan(toets);
  });
});

describe('templateregime/AC-13 geen test toetst nog verdwenen code', () => {
  // Alleen wat een verwijderd script laadt of leest telt: een pad als voorbeeldwaarde (padtabel, rolhek) niet.
  const GEBRUIK = new RegExp(
    `(?:from\\s+|import\\s*\\(\\s*|resolve\\(\\s*|readFileSync\\(\\s*|existsSync\\(\\s*|\\[\\s*)['"](?:[^'"]*[/])?(?:scripts/kit['"]\\s*,\\s*['"])?(?:${ALTERNATIEF})\\.mjs['"]`,
  );
  const ZELF = 'test/scripts/schrap-documentbewaking-templateregime.test.ts';

  test('templateregime/AC-13: geen testbestand of testhulp importeert, leest of start een verwijderd script', () => {
    const gevonden = ['test', 'e2e']
      .flatMap(bestanden)
      .filter((bestand) => bestand !== ZELF && /\.(?:ts|tsx|mjs|js)$/.test(bestand))
      .flatMap((bestand) =>
        lees(bestand)
          .split('\n')
          .filter((regel) => GEBRUIK.test(regel))
          .map((regel) => `${bestand}: ${regel.trim()}`),
      );
    expect(gevonden).toEqual([]);
  });

  test('templateregime/AC-13: de testhulp follow-up-kit draait check-document-status niet meer', () => {
    const kit = lees('test/hooks/follow-up-kit.ts');
    expect(kit).not.toContain('check-document-status');
    expect(kit).not.toContain('draaiChecker');
  });

  test('templateregime/AC-13: de tests van de verdwenen scripts zijn weg, de tests van wat blijft niet', () => {
    const weg = [
      'test/rails/adr-herzien.test.ts',
      'test/rails/agent-merge.test.ts',
      'test/rails/agent-merge-bytegrens.test.ts',
      'test/rails/agent-merge-omvang.test.ts',
      'test/rails/diff-guard.test.ts',
      'test/rails/diff-guard-bytegrens.test.ts',
      'test/rails/diff-guard-risico.test.ts',
      'test/rails/lane.test.ts',
      'test/rails/lane-security.test.ts',
      'test/rails/lane-status.test.ts',
      'test/rails/lane-status-a4.test.ts',
      'test/rails/functional-ui-status.test.ts',
      'test/rails/document-status-lokaal-config.test.ts',
      'test/rails/archief-guard.test.ts',
      'test/rails/specarchief-guard.test.ts',
      'test/rails/bouwvorm-levende-spec.test.ts',
      'test/hooks/beslisroute-review.test.ts',
      'test/scripts/document-status-lokaal.test.ts',
      'test/scripts/pr-merge-bytegrens.test.ts',
      'test/docs/agent-merge-bytegrens-docs.test.ts',
    ];
    const blijft = [
      'test/rails/check-core.test.ts',
      'test/rails/check-docs.test.ts',
      'test/rails/check-roadmap.test.ts',
      'test/rails/padtabel.test.ts',
      'test/hooks/rolhek.test.ts',
      'test/hooks/built-evidence.test.ts',
      'test/rails/gebouwd-na-merge.test.ts',
    ];
    expect(weg.filter((bestand) => existsSync(path.join(ROOT, bestand)))).toEqual([]);
    expect(blijft.filter((bestand) => !existsSync(path.join(ROOT, bestand)))).toEqual([]);
  });
});
