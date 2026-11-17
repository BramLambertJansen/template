import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

// Spec leesbudget, instructie-criterium leesbudget/AC-8 (ADR 0064 punt 2, 4, 6 en 7; ADR 0065). Teksttests toetsen
// structuur (koppen, R-id's, herkomst en de spiegel tussen rules en regelboek), nooit hele zinnen (ADR 0064 punt 6).
// GEWIJZIGD (refactorplan stap 3b, R-TEST-02): de tests die alleen woorden in R-regels, de skill opleveren of de
// agentinstructies pinden zijn weg.
const root = process.cwd();
const lees = (pad: string): string => readFileSync(path.join(root, pad), 'utf8');

/** Hoofdstuk `n` van het regelboek: van de kop `## <n>.` tot de volgende `## `-kop, zonder preambule. */
function hoofdstuk(n: string): string {
  const regels = lees('docs/framework.md').split('\n');
  const start = regels.findIndex((r) => r.startsWith(`## ${n}. `));
  if (start === -1) return '';
  const eind = regels.findIndex((r, i) => i > start && r.startsWith('## '));
  return regels.slice(start, eind === -1 ? undefined : eind).join('\n');
}

/** De definitieregel van een R-id in het hele regelboek (`- **R-…** …`), of '' als hij ontbreekt. */
function rRegel(id: string): string {
  return (
    lees('docs/framework.md')
      .split('\n')
      .find((r) => r.startsWith(`- **${id}** `)) ?? ''
  );
}

/** Alle R-DOC-definitieregels in §9. */
const docRegels = (): string[] =>
  hoofdstuk('9')
    .split('\n')
    .filter((r) => /^- \*\*R-DOC-\d+\*\* /.test(r));

/** De herkomst tussen haakjes aan het eind van een regel, of undefined. */
const herkomst = (regel: string): string | undefined => /\(([^()]+)\)\s*$/.exec(regel)?.[1];

describe('leesbudget/AC-8: framework §9 en de instructies volgen ADR 0064 en 0065', () => {
  test('leesbudget/AC-8 §9 heeft de kop "Documentatie en tokenbudget" en R-DOC-regels', () => {
    expect(hoofdstuk('9').split('\n')[0]).toBe('## 9. Documentatie en tokenbudget');
    expect(docRegels().length).toBeGreaterThan(0);
  });

  test('leesbudget/AC-8 elke R-DOC-regel in §9 eindigt met een herkomst tussen haakjes', () => {
    const zonder = docRegels().filter((r) => herkomst(r) === undefined);
    expect(zonder).toStrictEqual([]);
  });

  test('leesbudget/AC-8 R-WERK-07 staat in §8 en noemt geen grens van 10 KB meer', () => {
    const r = rRegel('R-WERK-07');
    expect(hoofdstuk('8')).toContain('- **R-WERK-07** ');
    expect(r).not.toMatch(/≤\s*10\s*KB/);
  });

  // R-DOC-03: `.claude/rules/*` bevat regels letterlijk. check-docs regel 10 toetst alleen dat het R-id bestaat.
  test('leesbudget/AC-8 elke R-regel in .claude/rules/* staat letterlijk als regel in het regelboek', () => {
    const boek = new Set(lees('docs/framework.md').split('\n'));
    const afwijkend = readdirSync(path.join(root, '.claude/rules'))
      .filter((f) => f.endsWith('.md'))
      .flatMap((f) =>
        lees(`.claude/rules/${f}`)
          .split('\n')
          .filter((r) => /^- \*\*R-[A-Z]+-\d+\*\* /.test(r) && !boek.has(r))
          .map((r) => `${f}: ${r.slice(0, 40)}`),
      );
    expect(afwijkend).toStrictEqual([]);
  });
});
