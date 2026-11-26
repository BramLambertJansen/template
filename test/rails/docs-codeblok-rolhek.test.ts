import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { HEK, sluitHek } from '../../scripts/kit/markdown.mjs';

// Spec cloud-netwerkvorm/AC-17 (vervolg op de review van #890, B-3): een corpustoets op de codeblokken in `docs/**` en
// `.claude/skills/**`. Een codeblokregel die als commando leest (zoals in spec agent-recepten: begint met `git `, `gh `,
// `pnpm ` of `node `; geen `*`, `…` of `...`; geen afgebroken regel met `\`; `<…>` wordt `1`) komt door het rolhek voor de
// hoofdsessie. Een blok voor de terminal van de eigenaar staat direct onder de regel `<!-- terminal: eigenaar -->`.

const ROOT = path.resolve(import.meta.dirname, '../..');
const MARKERING = '<!-- terminal: eigenaar -->';
const PROGRAMMA = /^(?:git|gh|pnpm|node) /;
const AFGEKORT = /[*…]|\.\.\./;

function kind(waarde: unknown, sleutel: string): unknown {
  if (typeof waarde !== 'object' || waarde === null) return undefined;
  return Object.entries(waarde).find(([naam]) => naam === sleutel)?.[1];
}

function netwerkvormen(): string[] {
  const settings: unknown = JSON.parse(readFileSync(path.join(ROOT, '.claude/settings.json'), 'utf8'));
  const lijst = kind(kind(settings, 'sandbox'), 'excludedCommands');
  return Array.isArray(lijst) ? lijst.filter((regel): regel is string => typeof regel === 'string') : [];
}

const ctx = {
  root: '/repo',
  cwd: '/repo',
  // In een app ook `.claude/gates.app.json`, zoals het echte rolhek (spec agent-recepten, Ontwerp punt 5).
  config: loadConfig(
    readFileSync(path.join(ROOT, '.claude/gates.json'), 'utf8'),
    existsSync(path.join(ROOT, '.claude/gates.app.json'))
      ? readFileSync(path.join(ROOT, '.claude/gates.app.json'), 'utf8')
      : null,
  ),
  read: () => null,
  committed: () => false,
  isDir: () => false,
  branch: 'feat/x',
  netwerkvormen: netwerkvormen(),
  mergeTrusted: true,
  kitTrusted: true,
  runnerTrusted: true,
};

interface Regel {
  readonly regel: number;
  readonly commando: string;
}

/** De commandoregels uit codeblokken, behalve uit een blok direct onder de markering. */
function blokCommandos(tekst: string): Regel[] {
  const gevonden: Regel[] = [];
  let open: string | null = null;
  let eigenaar = false;
  let vorige = '';
  tekst.split('\n').forEach((ruw, index) => {
    if (open === null) {
      open = HEK.exec(ruw)?.[1] ?? null;
      if (open !== null) eigenaar = vorige === MARKERING;
      if (ruw.trim() !== '') vorige = ruw.trim();
      return;
    }
    if (sluitHek(ruw, open)) {
      open = null;
      vorige = '';
      return;
    }
    const commando = ruw.trim();
    if (eigenaar || !PROGRAMMA.test(commando) || AFGEKORT.test(commando) || commando.endsWith('\\')) return;
    gevonden.push({ regel: index + 1, commando });
  });
  return gevonden;
}

/** De weigeringen van het rolhek, als `<bestand>:<regel>: <commando> → <reden>`. */
function meldingen(bestand: string, tekst: string): string[] {
  return blokCommandos(tekst).flatMap(({ regel, commando }) => {
    const ingevuld = commando.replace(/<[^>]+>/g, '1');
    const reden = decide({ tool_name: 'Bash', tool_input: { command: ingevuld } }, ctx).deny[0];
    return reden === undefined ? [] : [`${bestand}:${String(regel)}: ${commando} → ${reden}`];
  });
}

const corpus = execFileSync('git', ['ls-files', '--', 'docs/**.md', '.claude/skills/**.md'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\n')
  .filter((bestand) => bestand !== '');

describe('cloud-netwerkvorm/AC-17 corpustoets: codeblokken in docs/** en .claude/skills/** tegen het rolhek', () => {
  test('cloud-netwerkvorm/AC-17 het corpus is niet leeg en bevat skills en docs', () => {
    expect(corpus.some((bestand) => bestand.startsWith('.claude/skills/'))).toBe(true);
    expect(corpus.some((bestand) => bestand.startsWith('docs/operations/'))).toBe(true);
  });

  test('cloud-netwerkvorm/AC-17 geen codeblok schrijft een vorm voor die het rolhek weigert', () => {
    const fouten = corpus.flatMap((bestand) => meldingen(bestand, readFileSync(path.join(ROOT, bestand), 'utf8')));
    expect(fouten).toStrictEqual([]);
  });

  test('cloud-netwerkvorm/AC-17 de toets vangt een geweigerde vorm, een commentaar en een pipe', () => {
    const tekst = [
      '```bash',
      'git push -u origin HEAD',
      'gh api user --jq .x    # uitleg',
      'pnpm test:db | tail',
      '```',
    ].join('\n');
    expect(meldingen('x.md', tekst).map((melding) => melding.split(' → ')[0])).toStrictEqual([
      'x.md:2: git push -u origin HEAD',
      'x.md:3: gh api user --jq .x    # uitleg',
      'x.md:4: pnpm test:db | tail',
    ]);
  });

  test('cloud-netwerkvorm/AC-17 een blok direct onder de markering telt niet, het volgende blok wel', () => {
    const tekst = [
      MARKERING,
      '',
      '```bash',
      'git push -u origin HEAD',
      '```',
      '',
      '```bash',
      'git push -u origin HEAD',
      '```',
    ].join('\n');
    expect(meldingen('x.md', tekst).map((melding) => melding.split(' → ')[0])).toStrictEqual([
      'x.md:8: git push -u origin HEAD',
    ]);
  });

  test('cloud-netwerkvorm/AC-17 markering met tekst ertussen telt niet; een ~~~-blok onder de markering wel', () => {
    const tekst = [
      MARKERING,
      'Uitleg.',
      '```bash',
      'git push -u origin HEAD',
      '```',
      MARKERING,
      '~~~bash',
      'git push -u origin HEAD',
      '~~~',
    ].join('\n');
    expect(meldingen('x.md', tekst).map((melding) => melding.split(' → ')[0])).toStrictEqual([
      'x.md:4: git push -u origin HEAD',
    ]);
  });

  test('cloud-netwerkvorm/AC-17 toegestane vormen en afkortingen geven geen melding', () => {
    const tekst = ['```bash', 'git push origin HEAD', 'git commit -F <bestand>', 'gh pr …', 'git push \\', '```'].join(
      '\n',
    );
    expect(meldingen('x.md', tekst)).toStrictEqual([]);
  });
});
