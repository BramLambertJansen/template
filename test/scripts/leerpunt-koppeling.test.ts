// Leerpunt #717, PR #751: een regel in ## Leerpunt voor een issue dat de PR niet sluit mag de bewijsjob niet stil groen laten.
import { describe, expect, test } from 'vitest';
import { bewijsPlan } from '../../scripts/kit/leerpunt.mjs';

const sectie = (...regels: string[]) =>
  ['## Samenvatting', '', 'tekst', '', '## Leerpunt', '', ...regels, '', '## Test'].join('\n');
const LP = (nummer: number) => ({ nummer, labels: ['leerpunt'] });
const REGEL_693 = '- #693: trede Check; bewijs test/x.test.ts';
const REGEL_9 = '- #9: trede Check; bewijs test/a.test.ts';

describe('leerpunt-koppeling: een regel zonder sluitende koppeling', () => {
  test('leerpunt-koppeling: regel voor #693 terwijl gesloten leeg is geeft een fout met uitweg (PR #751)', () => {
    const uitslag = bewijsPlan({ gesloten: [], body: sectie(REGEL_693), diff: ['test/x.test.ts'] });
    expect(uitslag.fouten).toHaveLength(1);
    const fout = uitslag.fouten[0] ?? '';
    expect(fout).toContain('#693');
    expect(fout).toContain('sluit');
    expect(fout).toContain('Closes #693');
  });

  test('leerpunt-koppeling: twee regels, één gesloten en één niet: precies één koppelingsfout, voor de niet-gesloten', () => {
    const uitslag = bewijsPlan({
      gesloten: [LP(9)],
      body: sectie(REGEL_9, REGEL_693),
      diff: ['test/a.test.ts', 'test/x.test.ts'],
    });
    const koppeling = uitslag.fouten.filter((fout) => fout.includes('Closes #'));
    expect(koppeling).toHaveLength(1);
    expect(koppeling[0]).toContain('#693');
    expect(koppeling[0]).toContain('Closes #693');
    expect(uitslag.fouten.filter((fout) => fout.includes('#9'))).toEqual([]);
  });
});

describe('leerpunt-koppeling: controles die ongewijzigd blijven', () => {
  test('leerpunt-koppeling: PR zonder sectie Leerpunt en zonder gesloten leerpunt geeft geen fout', () => {
    expect(bewijsPlan({ gesloten: [], body: 'geen sectie', diff: [] }).fouten).toEqual([]);
  });

  test('leerpunt-koppeling: regel voor een gesloten leerpunt geeft een run en geen fout', () => {
    const uitslag = bewijsPlan({ gesloten: [LP(9)], body: sectie(REGEL_9), diff: ['test/a.test.ts'] });
    expect(uitslag.fouten).toEqual([]);
    expect(uitslag.runs).toEqual([{ pad: 'test/a.test.ts', soort: 'unit' }]);
  });

  test('leerpunt-koppeling: gesloten issue zonder label leerpunt met een regel geeft geen koppelingsfout', () => {
    const uitslag = bewijsPlan({
      gesloten: [{ nummer: 693, labels: ['bug'] }],
      body: sectie(REGEL_693),
      diff: ['test/x.test.ts'],
    });
    expect(uitslag.fouten.filter((fout) => fout.includes('Closes #'))).toEqual([]);
  });
});
