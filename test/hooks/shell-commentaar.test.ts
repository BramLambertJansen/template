import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { parseCommands } from '../../rails/hooks/lib/shell.mjs';

// GEWIJZIGD (job leerpunt-bewijs, leerpunt #892): de rijen staan hier zelf in plaats van in een import uit
// `shell-commentaar-rijen.ts`. Die import bestaat op de basis niet, en dan faalt deze bewijstest daar op laden in plaats van
// op een assertie. `shell-woorden-bash.test.ts` gebruikt het gedeelde bestand en toetst dat beide lijsten gelijk zijn.
const LOS = 'rm -rf .claude/hooks';
const COMMENTAAR_RIJEN: readonly { readonly naam: string; readonly tekst: string }[] = [
  { naam: 'cat;#<<EOF', tekst: `cat;#<<EOF\n${LOS}\nEOF` },
  { naam: 'true&&#<<E', tekst: `true&&#<<E\n${LOS}\nE` },
  { naam: '(#<<E', tekst: `(#<<E\n${LOS}\nE\n)` },
  { naam: 'echo ${x/ #/}', tekst: `echo \${x/ #/}; ${LOS}` },
  { naam: 'echo `true #`', tekst: `echo \`true #\`; ${LOS}` },
  { naam: '(( #))', tekst: `(( #)); ${LOS}` },
  { naam: 'echo ${x/;#/}', tekst: `echo \${x/;#/}; ${LOS}` },
  { naam: 'echo $(true #) <<E', tekst: `echo $(true #) <<E\n${LOS}\nE\n)` },
  { naam: '[[ -n x #⏎]] && rm', tekst: `[[ -n x #\n]] && ${LOS}` },
  // Reviewbevindingen B1 en B2 na de bouw: een nieuwe lexertoestand mag geen commando verbergen dat de oude lezer zag.
  { naam: '((true) ); #<<E', tekst: `((true) ); #<<E\n${LOS}\nE` },
  { naam: 'echo ${x:-"}"}', tekst: `echo \${x:-"}"}; ${LOS}` },
  { naam: "echo ${x:-'}'}", tekst: `echo \${x:-'}'}; ${LOS}` },
];

// Spec rolhek-herstel/AC-4 (leerpunten #603 en #617): `tokenize` begint een commentaar met `#` aan het begin van een woord,
// ook direct na een operator, en niet binnen een woord, `${…}`, backticks, `((…))`, `$((…))` of `$[…]`. Wat bash uitvoert,
// ziet de lezer: een segment met `rm` als eerste woord, zoals bij het losse `rm -rf .claude/hooks`.
const config = loadConfig(readFileSync('.claude/gates.json', 'utf8'));

function verdict(command: string, agent = '') {
  const decision = decide(
    { tool_name: 'Bash', tool_input: { command }, agent_type: agent },
    {
      root: '/repo',
      cwd: '/repo',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => false,
      branch: 'feat/x',
    },
  );
  if (decision.deny.length > 0) return 'deny';
  if (decision.ask.length > 0) return 'ask';
  return decision.allow === true ? 'allow' : 'context';
}

/** De zes vormen uit het Doel van de spec, plus de drie varianten uit AC-4. */
const VORMEN = COMMENTAAR_RIJEN;

const eersteWoorden = (tekst: string): (string | undefined)[] => parseCommands(tekst).map(({ words }) => words[0]);

describe('rolhek-herstel/AC-4: het losse rm -rf .claude/hooks is de maatstaf', () => {
  test('rolhek-herstel/AC-4: de maatstaf zelf: hoofdsessie vraagt, subagent weigert', () => {
    expect(verdict(LOS)).toBe('ask');
    expect(verdict(LOS, 'developer')).toBe('deny');
    expect(eersteWoorden(LOS)).toEqual(['rm']);
  });
});

describe('rolhek-herstel/AC-4: commentaar begint aan het begin van een woord', () => {
  test.each(VORMEN)(
    'rolhek-herstel/AC-4: parseCommands geeft een segment met rm als eerste woord: $naam',
    ({ tekst }) => {
      expect(eersteWoorden(tekst)).toContain('rm');
    },
  );

  test.each(VORMEN)('rolhek-herstel/AC-4: hoofdsessie vraagt, net als voor het losse rm: $naam', ({ tekst }) => {
    expect(verdict(tekst)).toBe('ask');
  });

  test.each(['developer', 'tester', 'docs'])('rolhek-herstel/AC-4: %s weigert elke vorm', (agent) => {
    const uitslagen = VORMEN.map(({ naam, tekst }) => ({ naam, uitslag: verdict(tekst, agent) }));
    expect(uitslagen).toEqual(VORMEN.map(({ naam }) => ({ naam, uitslag: 'deny' })));
  });

  // Review B3 na de bouw: een `}` tussen aanhalingstekens sluit `${…}` niet; anders lijkt de rest een heredoc met aangehaalde
  // delimiter, slaat `substitutions()` de body over en blijft de `$(rm …)` die bash uitvoert buiten de toets.
  // PR-review P1: twee gelijke segmenten binnen één lezing (`cd .. && cd ..`) blijven allebei staan; anders volgt de
  // werkmap één `cd` te weinig en valt een schrijfdoel op een zelfladend pad buiten de toets.
  test('rolhek-herstel/AC-4: een herhaald commando in één lezing blijft staan (cd .. && cd .. met commentaar)', () => {
    const ctx = {
      root: '/repo',
      cwd: '/repo/src/web',
      config,
      read: () => null,
      committed: () => false,
      isDir: () => true,
      branch: 'feat/x',
      mergeTrusted: true,
      kitTrusted: true,
    };
    const command = 'cd .. && cd .. && printf x > lefthook.yml # commentaar';
    expect(
      decide({ tool_name: 'Bash', tool_input: { command }, agent_type: 'developer' }, ctx).deny.length,
    ).toBeGreaterThan(0);
    expect(parseCommands(command).filter(({ words }) => words.join(' ') === 'cd ..').length).toBeGreaterThanOrEqual(2);
  });

  const B3 = `echo \${x:-"}"" <<'E'\n$(${LOS})\nE\n"}`;
  test('rolhek-herstel/AC-4: een substitutie achter een valse heredoc in ${…}: hoofdsessie vraagt', () => {
    expect(verdict(B3)).toBe('ask');
  });
  test.each(['developer', 'tester', 'docs'])(
    'rolhek-herstel/AC-4: een substitutie achter een valse heredoc in ${…}: %s weigert',
    (agent) => {
      expect(verdict(B3, agent)).toBe('deny');
    },
  );
});

describe('rolhek-herstel/AC-4: een # in een woord of rekenkundige context is geen commentaar', () => {
  // GEWIJZIGD (review B1/B2 na de bouw): parseCommands geeft de vereniging met de oude lezing, dus naast het segment van de
  // nieuwe lezing kan een tweede staan; de eis blijft dat `#` hier geen commentaar is.
  test('rolhek-herstel/AC-4: echo a#b geeft het segment echo a#b, en niets anders', () => {
    const segmenten = parseCommands('echo a#b').map(({ words }) => words.join(' '));
    expect(segmenten).toEqual(['echo a#b']);
  });

  test('rolhek-herstel/AC-4: echo $((1 #2)) geeft het segment echo $((1 #2))', () => {
    const segmenten = parseCommands('echo $((1 #2))').map(({ words }) => words.join(' '));
    expect(segmenten).toContain('echo $((1 #2))');
  });

  // Tegen een te gulzige lezer: als `#` in een woord of in `$((…))` een commentaar begon, verdween het rm erachter.
  test.each(['echo a#b', 'echo $((1 #2))', 'echo $[1 #2]', 'echo ${x#a}', 'echo ${x/#a/b}', 'echo `echo a#b`'])(
    'rolhek-herstel/AC-4: na %s blijft een rm erachter zichtbaar',
    (kop) => {
      expect(eersteWoorden(`${kop}; ${LOS}`)).toContain('rm');
    },
  );

  test.each(['echo a#b', 'echo $((1 #2))'])(
    'rolhek-herstel/AC-4: %s; rm: hoofdsessie vraagt, developer weigert',
    (kop) => {
      expect([verdict(`${kop}; ${LOS}`), verdict(`${kop}; ${LOS}`, 'developer')]).toEqual(['ask', 'deny']);
    },
  );
});

// Spec rolhek-leerpunten/AC-4 (leerpunt #955), alleen regressie: groen op `main`. De rijen `((true) ); #<<E⏎rm -rf .claude/hooks⏎E`
// en `echo ${x:-"}"}; rm -rf .claude/hooks` staan al hierboven (rolhek-herstel/AC-4). Twee rijen komen erbij, met een `verdict`
// die de werkmap (`cwd`) aanneemt.
describe('rolhek-leerpunten/AC-4: regressie, de lezer behoudt wat de lezer van main zag', () => {
  function verdictIn(command: string, agent: string, cwd: string) {
    const decision = decide(
      { tool_name: 'Bash', tool_input: { command }, agent_type: agent },
      {
        root: '/repo',
        cwd,
        config,
        read: () => null,
        committed: () => false,
        isDir: () => true,
        branch: 'feat/x',
      },
    );
    if (decision.deny.length > 0) return 'deny';
    if (decision.ask.length > 0) return 'ask';
    return decision.allow === true ? 'allow' : 'context';
  }

  const VALSE_HEREDOC = `echo \${x:-"}"" <<'E'\n$(${LOS})\nE\n"}`;
  test('rolhek-leerpunten/AC-4: een substitutie achter een valse heredoc in ${…}: de hoofdsessie vraagt', () => {
    expect(verdictIn(VALSE_HEREDOC, '', '/repo')).toBe('ask');
  });

  test.each(['developer', 'tester', 'docs'])(
    'rolhek-leerpunten/AC-4: een substitutie achter een valse heredoc in ${…}: %s weigert',
    (agent) => {
      expect(verdictIn(VALSE_HEREDOC, agent, '/repo')).toBe('deny');
    },
  );

  const CD_CD = 'cd .. && cd .. && printf x > lefthook.yml';
  test.each(['', 'developer', 'tester'])(
    'rolhek-leerpunten/AC-4: cd .. && cd .. met # c in /repo/a/b geeft dezelfde uitslag als zonder # c (rol %j)',
    (agent) => {
      const zonder = verdictIn(CD_CD, agent, '/repo/a/b');
      // `isDir` is hier overal true: het rolhek volgt een `cd` alleen naar een map die bestaat. Het schrijfdoel is dan
      // /repo/lefthook.yml, een zelfladend pad; zonder werkmapvolg viel het doel op /repo/a/b en ging het door.
      expect(zonder).toBe(agent === '' ? 'ask' : 'deny');
      expect(verdictIn(`${CD_CD} # c`, agent, '/repo/a/b')).toBe(zonder);
    },
  );
});
