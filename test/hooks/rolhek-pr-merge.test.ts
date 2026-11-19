import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { MERGE_FILES, trustedMerge } from '../../rails/hooks/lib/runner-authority.mjs';

// ADR 0069 punt 4, agent-samenvoegen/AC-9: alleen de hoofdsessie, alleen `pnpm pr:merge <nr>`, en zonder prompt
// alleen met modus `niet-kritiek` in het anker en ongewijzigde scripts, rails en hostbestanden. Andere merge-routes blijven dicht.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

/** De lijsten met tekst onder één sectie van een JSON-bestand. */
function lijsten(tekst: string, sectie: string): Record<string, string[]> {
  const ruw: unknown = JSON.parse(tekst);
  const blok: unknown =
    typeof ruw === 'object' && ruw !== null ? Object.entries(ruw).find(([k]) => k === sectie)?.[1] : undefined;
  if (typeof blok !== 'object' || blok === null) return {};
  return Object.fromEntries(
    Object.entries(blok).flatMap(([k, v]: [string, unknown]) =>
      Array.isArray(v) && v.every((x) => typeof x === 'string') ? [[k, v.map(String)]] : [],
    ),
  );
}

function verdict(command: string, opties: { agent?: string; vertrouwd?: boolean; cwd?: string } = {}) {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: opties.agent ?? '' },
    {
      root: '/repo',
      cwd: opties.cwd ?? '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
      mergeTrusted: opties.vertrouwd ?? true,
    },
  );
  if (decision.deny.length > 0) return { uitslag: 'deny', reden: decision.deny.join('; ') };
  if (decision.ask.length > 0) return { uitslag: 'ask', reden: decision.ask.join('; ') };
  return { uitslag: decision.allow === true ? 'allow' : 'context', reden: '' };
}

describe('agent-samenvoegen/AC-9 rolhek op pnpm pr:merge', () => {
  test.each(['pnpm pr:merge 12', '  pnpm  pr:merge 7 '])('hoofdsessie, vertrouwd: allow (%s)', (command) => {
    expect(verdict(command).uitslag).toBe('allow');
  });

  test('hoofdsessie, niet vertrouwd (modus of bestanden wijken af): deny met de reden', () => {
    const uitslag = verdict('pnpm pr:merge 12', { vertrouwd: false });
    expect(uitslag.uitslag).toBe('deny');
    expect(uitslag.reden).toMatch(/hostbestanden \(package\.json, \.npmrc/);
  });

  test('buiten de repo-root: deny', () => {
    expect(verdict('pnpm pr:merge 12', { cwd: '/repo/src' }).uitslag).toBe('deny');
  });

  test.each(['developer', 'tester', 'architect', 'reviewer', 'docs', 'onbekend'])(
    'subagent %s: altijd deny',
    (agent) => {
      const uitslag = verdict('pnpm pr:merge 12', { agent });
      expect(uitslag.uitslag).toBe('deny');
      expect(uitslag.reden).toMatch(/hoofdsessie|lezen|niet/);
    },
  );

  test.each([
    'node scripts/kit/pr-merge.mjs 12',
    'pnpm pr:merge 12 && echo klaar',
    'pnpm pr:merge 12 --force',
    'npm run pr:merge 12',
    'pnpm run pr:merge 12',
    'pnpm pr:merge 012',
    'pnpm pr:merge $(echo 12)',
    'env X=1 node scripts/kit/pr-merge.mjs 12',
    '/usr/bin/node scripts/kit/pr-merge.mjs 12',
    'sh -c "pnpm pr:merge 12"',
    "bash -c 'node scripts/kit/pr-merge.mjs 12'",
    'cd scripts/kit && node pr-merge.mjs 12',
    'pnpm p\\r:merge 12',
    "git -c alias.x='!node scripts/kit/pr-merge.mjs 12' x",
    'rg --pre node x scripts/kit/pr-merge.mjs',
    'LESSOPEN="|node %s" less scripts/kit/pr-merge.mjs',
    'node scripts/kit/pr-mer*.mjs 12',
    'node scripts/kit/pr-merg?.mjs 12',
    'node scripts/kit/pr-mer[g]e.mjs 12',
    'cd scripts/kit && node pr-*.mjs 12',
    'pnpm pr:*e 12',
  ])('andere vorm: deny (%s)', (command) => {
    expect(verdict(command).uitslag).toBe('deny');
  });

  test.each(['gh pr merge 12 --squash', 'gh api -X PUT repos/o/r/pulls/12/merge', 'gh pr merge 12 --auto'])(
    'andere merge-routes blijven voor de hoofdsessie dicht (%s)',
    (command) => {
      expect(verdict(command).uitslag).toBe('deny');
    },
  );

  test.each([
    'cat scripts/kit/pr-merge.mjs',
    'git log -- scripts/kit/pr-merge.mjs',
    'grep -n x scripts/kit/pr-merge.mjs',
  ])('lezen blijft vrij (%s)', (command) => {
    expect(verdict(command).uitslag).not.toBe('deny');
  });

  // rolhek-lezen/AC-8: aangehaalde globs bij git ls-files en git grep (pad onder scripts/kit) blijven voor elke rol vrij.
  describe.each([
    { agent: undefined, naam: 'hoofdsessie' },
    ...['developer', 'tester', 'architect', 'docs', 'reviewer'].map((agent) => ({ agent, naam: agent })),
  ])('lezen met een aangehaalde glob: $naam', ({ agent }) => {
    test.each(["git ls-files -- 'docs/**'", "git grep -n -e x -- 'scripts/kit/*'"])('%s → niet deny', (command) => {
      expect(verdict(command, agent === undefined ? {} : { agent }).uitslag).not.toBe('deny');
    });

    test("git -c x=y ls-files -- 'docs/**' → deny (basis zonder -c slaagt)", () => {
      const opties = agent === undefined ? {} : { agent };
      expect(verdict("git ls-files -- 'docs/**'", opties).uitslag).not.toBe('deny');
      expect(verdict("git -c x=y ls-files -- 'docs/**'", opties).uitslag).toBe('deny');
    });
  });

  test('settings.json: deny voor gh pr merge, ask en sandbox-uitzondering voor pnpm pr:merge, niet in allow', () => {
    const tekst = readFileSync('.claude/settings.json', 'utf8');
    const settings = { permissions: lijsten(tekst, 'permissions'), sandbox: lijsten(tekst, 'sandbox') };
    expect(settings.permissions['deny']).toEqual(
      expect.arrayContaining(['Bash(gh pr merge*)', 'Bash(gh api *merge*)']),
    );
    expect(settings.permissions['ask']).toContain('Bash(pnpm pr:merge *)');
    expect(settings.sandbox['excludedCommands']).toContain('pnpm pr:merge *');
    expect(settings.permissions['allow']?.some((regel) => regel.includes('pr:merge'))).toBe(false);
  });
});

// trustedMerge op een echte git-fixture: anker = main, branch eraf.
const ROOTS: string[] = [];
const GIT_ENV = {
  GIT_AUTHOR_NAME: 'Merge test',
  GIT_AUTHOR_EMAIL: 'merge@example.test',
  GIT_COMMITTER_NAME: 'Merge test',
  GIT_COMMITTER_EMAIL: 'merge@example.test',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

afterEach(() => {
  for (const root of ROOTS.splice(0)) rmSync(root, { recursive: true, force: true });
});

function git(root: string, args: string[]) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } }).trim();
}

function write(root: string, file: string, text: string) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), text);
}

function fixture(modus = 'niet-kritiek') {
  const root = mkdtempSync(path.join(tmpdir(), 'pr-merge-'));
  ROOTS.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  const gates = JSON.stringify({ merge: modus });
  write(root, '.claude/gates.json', gates);
  write(root, 'package.json', '{"scripts":{"pr:merge":"node scripts/kit/pr-merge.mjs"}}\n');
  write(root, '.npmrc', '# fixture\n');
  write(root, 'scripts/kit/pr-merge.mjs', '// fixture; nooit uitvoeren\n');
  write(root, 'rails/hooks/lib/x.mjs', '// fixture\n');
  write(root, 'src/web/x.ts', 'export {};\n');
  git(root, ['add', '.']);
  git(root, ['commit', '-q', '-m', 'test: fixture']);
  const sha = git(root, ['rev-parse', 'HEAD']);
  git(root, ['switch', '-q', '-c', 'feat/x']);
  return { root, basis: { sha, read: (rel: string) => (rel === '.claude/gates.json' ? gates : null) } };
}

describe('agent-samenvoegen/AC-9 trustedMerge', () => {
  test('MERGE_FILES dekt de hostbestanden, scripts en rails', () => {
    expect(MERGE_FILES).toEqual(
      expect.arrayContaining(['package.json', '.npmrc', '.pnpmfile.cjs', 'mise.toml', 'scripts', 'rails']),
    );
  });

  test('ongewijzigd en modus niet-kritiek: vertrouwd; app-code wijzigen mag', () => {
    const { root, basis } = fixture();
    write(root, 'src/web/x.ts', 'export const a = 1;\n');
    git(root, ['commit', '-qam', 'feat: app']);
    expect(trustedMerge(root, basis)).toBe(true);
  });

  test.each(['gh', 'git', 'node'])('een geplante node_modules/.bin/%s: niet vertrouwd', (naam) => {
    const { root, basis } = fixture();
    write(root, `node_modules/.bin/${naam}`, '#!/bin/sh\n');
    expect(trustedMerge(root, basis)).toBe(false);
  });

  test('modus eigenaar of zonder basis: niet vertrouwd', () => {
    const { root, basis } = fixture('eigenaar');
    expect(trustedMerge(root, basis)).toBe(false);
    expect(trustedMerge(root, null)).toBe(false);
  });

  test.each([
    ['package.json', '{"scripts":{"pr:merge":"node x.mjs"}}\n'],
    ['.npmrc', 'node-options=--require ./x.cjs\n'],
    ['scripts/kit/pr-merge.mjs', '// gewijzigd\n'],
    ['rails/hooks/lib/x.mjs', '// gewijzigd\n'],
    ['.pnpmfile.cjs', 'module.exports = {};\n'],
  ])('%s gewijzigd (lokaal of gecommit): niet vertrouwd', (bestand, inhoud) => {
    const lokaal = fixture();
    write(lokaal.root, bestand, inhoud);
    expect(trustedMerge(lokaal.root, lokaal.basis)).toBe(false);
    const gecommit = fixture();
    write(gecommit.root, bestand, inhoud);
    git(gecommit.root, ['add', '.']);
    git(gecommit.root, ['commit', '-q', '-m', 'test: gewijzigd']);
    expect(trustedMerge(gecommit.root, gecommit.basis)).toBe(false);
  });
});

// rolhek-lezen/AC-17 (ADR 0099): de weigering op de naam van een kitscript geldt voor elke rol alleen voor een segment dat iets
// kan starten. Een lezer, of `git add|commit|rm|mv|restore|switch|branch|tag` met de naam als pad, patroon of berichttekst, start
// niets. `{s}` is `merge` of `resolve`, `{g}` het glob-begin (`mer*`, `res*`). Een weigering op de naam herken je aan de vier
// meldingen van het kitscript; de eigen lijst van de reviewer weigert daarnaast om andere redenen (die tellen hier niet mee).
interface Rol17 {
  naam: string;
  agent: string | undefined;
}

const ROLLEN_17: readonly Rol17[] = [
  { naam: 'hoofdsessie', agent: undefined },
  ...['architect', 'developer', 'tester', 'docs', 'reviewer'].map((agent) => ({ naam: agent, agent })),
];
const SCRIPTS_17 = ['merge', 'resolve'] as const;
const KIT_REDENEN = [
  'Mergen via pnpm pr:merge doet alleen de hoofdsessie',
  'Het mergescript draait alleen als precies',
  'Gesprekken sluiten via pnpm pr:resolve doet alleen de hoofdsessie',
  'Het sluitscript draait alleen als precies',
];

const vul = (tekst: string, script: string): string =>
  tekst.replaceAll('{s}', script).replaceAll('{g}', `${script.slice(0, 3)}*`);
const metRol = (agent: string | undefined) => (agent === undefined ? {} : { agent });

function weigertOpNaam(command: string, agent: string | undefined): boolean {
  const uitslag = verdict(command, metRol(agent));
  return uitslag.uitslag === 'deny' && KIT_REDENEN.some((reden) => uitslag.reden.includes(reden));
}

/** Per rol en per kitscript de afwijking die `toets` meldt; leeg als alles klopt. */
function afwijkingen(toets: (rol: Rol17, script: string) => string | null): string[] {
  return ROLLEN_17.flatMap((rol) =>
    SCRIPTS_17.flatMap((script) => {
      const fout = toets(rol, script);
      return fout === null ? [] : [`${rol.naam} (${script}): ${fout}`];
    }),
  );
}

// `geheel`: ook verder niet geweigerd, voor alle rollen of alle rollen behalve de reviewer (die houdt zijn eigen lijst).
interface Toegestaan17 {
  command: string;
  geheel?: 'allen' | 'zonder-reviewer';
}

const TOEGESTAAN_17: readonly Toegestaan17[] = [
  { command: 'git add test/scripts/pr-{s}.test.ts', geheel: 'zonder-reviewer' },
  { command: "git grep -n -F -e 'pr:{s}' -- docs", geheel: 'allen' },
  { command: 'git commit -m "docs: mention pr:{s}"', geheel: 'zonder-reviewer' },
  { command: 'git log -- scripts/kit/pr-{s}.mjs', geheel: 'allen' },
  { command: "git branch --list 'chore/*'", geheel: 'zonder-reviewer' },
  { command: "git tag --list 'pr-*'", geheel: 'zonder-reviewer' },
  { command: "git ls-files -- 'scripts/kit/pr-*'", geheel: 'allen' },
  { command: 'git log -- scripts/kit/pr-{s}.mjs 2>/dev/null', geheel: 'zonder-reviewer' },
  { command: 'git log -- scripts/kit/pr-{s}.mjs 2>&1', geheel: 'zonder-reviewer' },
  { command: 'git log -- scripts/kit/pr-{s}.mjs && git status', geheel: 'allen' },
  { command: 'git log --oneline -- scripts/kit/pr-{s}.mjs | wc -l' },
  { command: 'git log -- scripts/kit/pr-{s}.mjs | head -n 5' },
  { command: 'git rm --cached test/scripts/pr-{s}.test.ts' },
  { command: 'git mv test/scripts/pr-{s}.test.ts test/scripts/x.test.ts' },
  { command: 'git restore -- test/scripts/pr-{s}.test.ts' },
  // De vorm telt (opties en script), niet de padregel: voor starten doet het pad er niet toe.
  { command: "sed -n '1,20p' scripts/kit/pr-{s}.mjs", geheel: 'zonder-reviewer' },
  { command: 'head -n 5 scripts/kit/pr-{s}.mjs', geheel: 'zonder-reviewer' },
  { command: 'wc -l scripts/kit/pr-{s}.mjs', geheel: 'zonder-reviewer' },
  { command: 'ls -la scripts/kit/pr-{s}.mjs', geheel: 'zonder-reviewer' },
  { command: 'git cat-file -p HEAD:scripts/kit/pr-{s}.mjs', geheel: 'zonder-reviewer' },
  { command: 'git cat-file -s HEAD:scripts/kit/pr-{s}.mjs', geheel: 'zonder-reviewer' },
  { command: 'git ls-tree HEAD scripts/kit/pr-{s}.mjs', geheel: 'zonder-reviewer' },
  { command: 'git rev-parse HEAD:scripts/kit/pr-{s}.mjs', geheel: 'zonder-reviewer' },
  // Een lezer met een absoluut systeempad blijft een lezer.
  { command: "/usr/bin/sed -n '1p' scripts/kit/pr-{s}.mjs" },
  { command: '/bin/cat scripts/kit/pr-{s}.mjs' },
];

function toegestaanAfwijking({ command, geheel }: Toegestaan17) {
  return (rol: Rol17, script: string): string | null => {
    const gevuld = vul(command, script);
    if (weigertOpNaam(gevuld, rol.agent)) return `geweigerd op de kitscriptnaam: ${gevuld}`;
    const geldt = geheel === 'allen' || (geheel === 'zonder-reviewer' && rol.agent !== 'reviewer');
    return geldt && verdict(gevuld, metRol(rol.agent)).uitslag === 'deny' ? `geweigerd: ${gevuld}` : null;
  };
}

describe('rolhek-lezen/AC-17 een lezer of git add|commit|rm|mv|restore|branch|tag met de naam als pad, patroon of tekst start niets', () => {
  test.each(TOEGESTAAN_17.map((geval) => [geval.command, geval] as const))(
    'rolhek-lezen/AC-17 toegestaan voor elke rol, voor merge en resolve: %s',
    (_command, geval) => {
      expect(afwijkingen(toegestaanAfwijking(geval))).toStrictEqual([]);
    },
  );
});

// `soort: 'kit'`: de weigering is die op de naam; `'deny'`: de weigering mag ook een andere gate zijn (`--output` schrijft een bestand).
interface Geweigerd17 {
  command: string;
  basis: string;
  soort?: 'kit' | 'deny';
}

const CAT = 'cat scripts/kit/pr-{s}.mjs';
const SED = "sed -n '1p' scripts/kit/pr-{s}.mjs";
const COMMIT = 'git commit -m "docs: mention pr:{s}"';
const ADD = 'git add test/scripts/pr-{s}.test.ts';
const LOG = 'git log -- scripts/kit/pr-{s}.mjs';
const CATFILE = 'git cat-file -p HEAD:scripts/kit/pr-{s}.mjs';
const GREP = "git grep -n -F -e 'pr:{s}' -- docs";

const GEWEIGERD_17: readonly Geweigerd17[] = [
  { command: 'node scripts/kit/pr-{s}.mjs 5', basis: 'node scripts/kit/pr-x.mjs 5' },
  { command: 'pnpm run pr:{s} 5', basis: 'pnpm run pr:x 5' },
  { command: 'pnpm pr:{s} 5 && git status', basis: 'pnpm pr:x 5 && git status' },
  { command: "sh -c 'pnpm pr:{s} 5'", basis: "sh -c 'pnpm pr:x 5'" },
  { command: 'env node scripts/kit/pr-{s}.mjs', basis: 'env node scripts/kit/pr-x.mjs' },
  { command: 'git show HEAD:scripts/kit/pr-{s}.mjs | node', basis: 'git show HEAD:scripts/kit/pr-{s}.mjs' },
  { command: `${CAT} | node`, basis: CAT },
  { command: `${CAT} > m.mjs; node m.mjs 5`, basis: CAT },
  { command: `${CAT} | head -n 9999 > m.mjs; node m.mjs 5`, basis: CAT },
  { command: `${CAT} >&m.mjs; node m.mjs 5`, basis: CAT },
  { command: `${CAT} 1<>m.mjs; node m.mjs 5`, basis: CAT },
  {
    command: 'git log -p --output=m.mjs -- scripts/kit/pr-{s}.mjs',
    basis: 'git log -p -- scripts/kit/pr-{s}.mjs',
    soort: 'deny',
  },
  {
    command: 'git log -p --output m.mjs -- scripts/kit/pr-{s}.mjs',
    basis: 'git log -p -- scripts/kit/pr-{s}.mjs',
    soort: 'deny',
  },
  { command: `${LOG} > m.mjs`, basis: LOG },
  { command: `${LOG} | tee m.mjs`, basis: LOG },
  { command: "sed -n '1e pnpm pr:{s} 5' docs/framework.md", basis: SED },
  { command: 'git cat-file --textconv HEAD:scripts/kit/pr-{s}.mjs', basis: CATFILE },
  { command: 'git cat-file --filters HEAD:scripts/kit/pr-{s}.mjs', basis: CATFILE },
  { command: "git ls-files -- 'scripts/kit/pr-{g}' | xargs node", basis: "git ls-files -- 'scripts/kit/pr-{g}'" },
  // Een segment dat de naam en een vorm buiten AC-11, AC-13 en AC-14 heeft, start iets.
  { command: "sed -n 's/a/b/p' scripts/kit/pr-{s}.mjs", basis: SED },
  { command: 'sed -i 1d scripts/kit/pr-{s}.mjs', basis: SED },
  { command: "sed -n '/x/p' scripts/kit/pr-{s}.mjs", basis: SED },
  { command: "sed -n '1w x' scripts/kit/pr-{s}.mjs", basis: SED },
  { command: 'git ls-tree --format=x HEAD scripts/kit/pr-{s}.mjs', basis: 'git ls-tree HEAD scripts/kit/pr-{s}.mjs' },
  { command: 'git rev-parse --git-path scripts/kit/pr-{s}.mjs', basis: 'git rev-parse HEAD:scripts/kit/pr-{s}.mjs' },
  // Variabele vóór het commando, pad-wrapper, git `-c`, uitvoerredirect: dan telt de naam wel.
  { command: `FOO=1 ${ADD}`, basis: ADD },
  { command: `/usr/bin/env ${ADD}`, basis: ADD },
  { command: 'git -c core.x=y add test/scripts/pr-{s}.test.ts', basis: ADD },
  { command: `${GREP} > out.txt`, basis: GREP },
  // Substitutie, eval, source, heredoc of een geëxpandeerd woord: de regel van nu, elke vermelding telt.
  { command: 'git commit -m "$(node scripts/kit/pr-{s}.mjs 5)"', basis: COMMIT },
  { command: 'git commit -m "docs: mention pr:{s} `date`"', basis: COMMIT },
  { command: "git grep -n -F -e 'pr:{s}' -- <(echo docs)", basis: GREP },
  { command: `eval true; ${ADD}`, basis: ADD },
  { command: `source ./x.sh; ${LOG}`, basis: LOG },
  // Een lezer met een relatief pad (`./sed`, `./git`) is een ander programma dan de lezer: de naam telt wel.
  { command: `./${SED}`, basis: SED },
  { command: `./${CATFILE}`, basis: CATFILE },
  // Een scheidingsteken direct na `)` of `}` mag niet verloren gaan: de groep geeft zijn uitvoer wel door of schrijft het bestand.
  { command: `( ${CAT} ) | node - 5`, basis: CAT },
  { command: `{ ls; ${CAT}; } | node - 5`, basis: CAT },
  { command: 'for f in scripts/kit/pr-{s}.mjs; do cat "$f"; done | node - 5', basis: CAT },
  { command: `( ${CAT} ) > m.mjs; node m.mjs 5`, basis: CAT },
  { command: `{ ls; ${CAT}; } > m.mjs; node m.mjs 5`, basis: CAT },
  { command: "git commit -F - <<'EOF'\ndocs: mention pr:{s}\nEOF", basis: COMMIT },
  { command: 'git add "$X/scripts/kit/pr-{s}.mjs"', basis: 'git add scripts/kit/pr-{s}.mjs' },
];

function geweigerdAfwijking({ command, basis, soort = 'kit' }: Geweigerd17) {
  return (rol: Rol17, script: string): string | null => {
    const basisTekst = vul(basis, script);
    if (weigertOpNaam(basisTekst, rol.agent)) return `de basis weigert op de kitscriptnaam: ${basisTekst}`;
    if (rol.agent !== 'reviewer' && verdict(basisTekst, metRol(rol.agent)).uitslag === 'deny')
      return `de basis is geweigerd: ${basisTekst}`;
    const tekst = vul(command, script);
    const geweigerd =
      soort === 'kit' ? weigertOpNaam(tekst, rol.agent) : verdict(tekst, metRol(rol.agent)).uitslag === 'deny';
    return geweigerd ? null : `niet geweigerd: ${tekst}`;
  };
}

describe('rolhek-lezen/AC-17 een segment dat iets kan starten met de naam van een kitscript blijft geweigerd, voor elke rol', () => {
  test.each(GEWEIGERD_17.map((geval) => [geval.command, geval] as const))(
    'rolhek-lezen/AC-17 geweigerd tegen een basis die slaagt, voor merge en resolve: %s',
    (_command, geval) => {
      expect(afwijkingen(geweigerdAfwijking(geval))).toStrictEqual([]);
    },
  );

  test('rolhek-lezen/AC-17 de exacte vorm pnpm pr:<script> <nr> blijft alleen voor de hoofdsessie toegestaan', () => {
    expect(
      afwijkingen((rol, script) => {
        const uitslag = verdict(`pnpm pr:${script} 12`, metRol(rol.agent)).uitslag;
        return uitslag === (rol.agent === undefined ? 'allow' : 'deny') ? null : `uitslag ${uitslag}`;
      }),
    ).toStrictEqual([]);
  });

  test.each(SCRIPTS_17)(
    'rolhek-lezen/AC-17 de reviewer houdt zijn eigen lijst: een redirect blijft geweigerd (%s)',
    (script) => {
      const basis = vul(LOG, script);
      expect(verdict(basis, { agent: 'reviewer' }).uitslag).not.toBe('deny');
      expect(verdict(`${basis} 2>/dev/null`, { agent: 'reviewer' }).uitslag).toBe('deny');
    },
  );

  // AC-18 in de AC-17-lijst van het Testplan: een gh-pad als `-C` of `--work-tree` blijft voor elke subagentrol geweigerd.
  test.each(['git -C /home/x/.config/gh diff config.yml hosts.yml', 'git --work-tree=/home/x/.config/gh diff a b'])(
    'rolhek-lezen/AC-17 en rolhek-lezen/AC-18 een subagent leest niet buiten de repo (basis git diff a b): %s',
    (command) => {
      const subagents = ROLLEN_17.filter((rol) => rol.agent !== undefined);
      expect(subagents.filter((rol) => verdict('git diff a b', metRol(rol.agent)).uitslag === 'deny')).toStrictEqual(
        [],
      );
      expect(subagents.filter((rol) => verdict(command, metRol(rol.agent)).uitslag !== 'deny')).toStrictEqual([]);
    },
  );
});
