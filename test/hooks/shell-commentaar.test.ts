import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { parseCommands } from '../../rails/hooks/lib/shell.mjs';
import { COMMENTAAR_RIJEN, LOS } from './shell-commentaar-rijen.ts';

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
