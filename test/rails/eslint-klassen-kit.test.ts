import { readFileSync } from 'node:fs';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, test } from 'vitest';

// Rail rails/klassen-kit (spec app-thema, deel B): de kit (src/core/web/ui en src/web/ui) mag geen arbitrary values, hex- of
// oklch-kleuren, `!`, `dark:` of vaste `style`-waarden in classstrings zetten. Eigen fixtures, geen namen uit de app-zone.
const eslint = new ESLint({ cwd: process.cwd(), overrideConfig: [tseslint.configs.disableTypeChecked] });

const KIT_PADEN = ['src/core/web/ui/x.tsx', 'src/web/ui/x.tsx'];
const KIT_REGEL = 'rails/klassen-kit';

async function meldingen(filePath: string, code: string, regel = KIT_REGEL): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return (result?.messages ?? []).filter((m) => m.ruleId === regel).map((m) => m.message);
}

type Drager = 'className' | 'cn' | 'cva-basis' | 'cva-variant' | 'cva-compound';

// Eén classstring in elk van de drie dragers (className, cn(…), CVA-recept) als code.
function metDrager(drager: Drager, klassen: string): string {
  switch (drager) {
    case 'className':
      return `export const x = <div className="${klassen}" />;`;
    case 'cn':
      return `export const x = cn('flex', '${klassen}');`;
    case 'cva-basis':
      return `export const x = cva('${klassen}', { variants: { v: { a: 'flex' } } });`;
    case 'cva-variant':
      return `export const x = cva('flex', { variants: { v: { a: '${klassen}' } } });`;
    case 'cva-compound':
      return `export const x = cva('flex', { compoundVariants: [{ v: 'a', class: '${klassen}' }] });`;
  }
}

const DRAGERS: Drager[] = ['className', 'cn', 'cva-basis', 'cva-variant', 'cva-compound'];
const VERBODEN = [
  'w-[13rem]',
  'grid-cols-[16rem_1fr]',
  'bg-[var(--x)]',
  'border-(--x)',
  'text-[#fff]',
  '!mt-0',
  'mt-0!',
  'dark:bg-card',
  'md:w-[13rem]',
  'hover:!mt-0',
];
const TOEGESTAAN = [
  '[&_svg]:size-4',
  'data-[active=true]:bg-accent',
  'aria-[invalid=true]:border-destructive',
  'rounded-button bg-primary flex gap-2',
];

const verbodenRijen = KIT_PADEN.flatMap((pad) =>
  DRAGERS.flatMap((drager) => VERBODEN.map((klasse) => ({ pad, drager, klasse }))),
);

describe('rails/klassen-kit: verboden vormen (AC-8)', () => {
  test.each(verbodenRijen)(
    'app-thema/AC-8: $klasse in $drager ($pad) geeft één melding',
    async ({ pad, drager, klasse }) => {
      expect(await meldingen(pad, metDrager(drager, klasse))).toHaveLength(1);
    },
  );

  test.each(KIT_PADEN)(
    'app-thema/AC-8: elk verboden token in één string krijgt een eigen melding (%s)',
    async (pad) => {
      const code = metDrager('className', 'flex w-[13rem] !mt-0 dark:bg-card text-[#fff] gap-2');

      expect(await meldingen(pad, code)).toHaveLength(4);
    },
  );

  test.each(KIT_PADEN)('app-thema/AC-8: meldingen in meerdere dragers tellen apart (%s)', async (pad) => {
    const code = `${metDrager('className', 'w-[13rem]')}\n${metDrager('cn', '!mt-0')}\n${metDrager('cva-basis', 'dark:bg-card')}`;

    expect(await meldingen(pad, code)).toHaveLength(3);
  });

  test.each(KIT_PADEN)('app-thema/AC-8: template literal en ternary in className worden gelezen (%s)', async (pad) => {
    const sjabloon = 'export const x = <div className={`flex w-[13rem]`} />;';
    const ternary = "export const x = <div className={ok ? 'flex' : 'w-[13rem]'} />;";
    const expressie = "export const x = <div className={cn(ok && 'w-[13rem]', 'flex')} />;";

    expect(await meldingen(pad, sjabloon)).toHaveLength(1);
    expect(await meldingen(pad, ternary)).toHaveLength(1);
    expect(await meldingen(pad, expressie)).toHaveLength(1);
  });

  test.each(KIT_PADEN)('app-thema/AC-8: melding noemt @theme en framework §7 (%s)', async (pad) => {
    const [melding] = await meldingen(pad, metDrager('className', 'w-[13rem]'));

    expect(melding).toContain('@theme');
    expect(melding).toContain('framework §7');
  });
});

describe('rails/klassen-kit: style (AC-8)', () => {
  const vast = [
    'export const x = <div style={{ width: 240 }} />;',
    "export const x = <div style={{ width: '240px' }} />;",
    'export const x = <div style={{ width: `240px` }} />;',
    'export const x = <div style={{ width: breedte, height: 240 }} />;',
  ];
  const berekend = [
    'export const x = <div style={{ width: `${String(pct)}%` }} />;',
    'export const x = <div style={{ width: breedte }} />;',
    'export const x = <div style={{ width: pct * 2, height: `${String(h)}px` }} />;',
  ];

  test.each(vast.flatMap((code) => KIT_PADEN.map((pad) => ({ pad, code }))))(
    'app-thema/AC-8: style met een vaste waarde wordt gemeld: $code ($pad)',
    async ({ pad, code }) => {
      expect(await meldingen(pad, code)).toHaveLength(1);
    },
  );

  test.each(berekend.flatMap((code) => KIT_PADEN.map((pad) => ({ pad, code }))))(
    'app-thema/AC-8: style met alleen berekende waarden mag, mits de rail zelf aan staat: $code ($pad)',
    async ({ pad, code }) => {
      // Positieve basis: dezelfde fixture met één vaste waarde erbij meldt precies die ene.
      const metVast = code.replace('style={{', 'style={{ top: 1,');

      expect(await meldingen(pad, metVast)).toHaveLength(1);
      expect(await meldingen(pad, code)).toStrictEqual([]);
    },
  );
});

describe('rails/klassen-kit: toegestane vormen (AC-8)', () => {
  const rijen = KIT_PADEN.flatMap((pad) =>
    DRAGERS.flatMap((drager) => TOEGESTAAN.map((klasse) => ({ pad, drager, klasse }))),
  );

  test.each(rijen)('app-thema/AC-8: $klasse in $drager ($pad) geeft geen melding', async ({ pad, drager, klasse }) => {
    // Positieve basis: met één verboden token erbij meldt de regel precies dat token, dus de regel draait voor dit pad.
    expect(await meldingen(pad, metDrager(drager, `${klasse} w-[13rem]`))).toHaveLength(1);
    expect(await meldingen(pad, metDrager(drager, klasse))).toStrictEqual([]);
  });
});

describe('rails/klassen-kit: bereik in de config (AC-8)', () => {
  test('app-thema/AC-8: testbestanden in de kit zijn uitgezonderd', async () => {
    const code = metDrager('className', 'w-[13rem]');

    expect(await meldingen('src/core/web/ui/x.tsx', code)).toHaveLength(1);
    expect(await meldingen('src/core/web/ui/x.test.tsx', code)).toStrictEqual([]);
    expect(await meldingen('src/web/ui/x.test.tsx', code)).toStrictEqual([]);
  });

  test('app-thema/AC-8: buiten de kit (features/, routes/) meldt rails/klassen-kit niet', async () => {
    const code = metDrager('className', 'w-[13rem]');

    expect(await meldingen('src/web/features/x.tsx', code)).toStrictEqual([]);
    expect(await meldingen('src/web/routes/x.tsx', code)).toStrictEqual([]);
  });
});

describe('rails/klassen-kit: de kit zelf (AC-9)', () => {
  function onderdrukkingen(): Record<string, Record<string, { count: number }>> {
    try {
      const gelezen: unknown = JSON.parse(readFileSync('eslint-suppressions.json', 'utf8'));
      return typeof gelezen === 'object' && gelezen !== null ? Object.fromEntries(Object.entries(gelezen)) : {};
    } catch {
      return {};
    }
  }

  test('app-thema/AC-9: de regel is actief voor src/core/web/ui en src/web/ui', async () => {
    for (const pad of KIT_PADEN) {
      expect(await meldingen(pad, metDrager('className', 'w-[13rem]'))).toHaveLength(1);
    }
  });

  test('app-thema/AC-9: nul meldingen in de kit, of een onderdrukking voor rails/klassen-kit per bestand', async () => {
    const results = await eslint.lintFiles(['src/core/web/ui/**/*.{ts,tsx}', 'src/web/ui/**/*.{ts,tsx}']);
    const suppressions = onderdrukkingen();
    const onbedekt = results.flatMap((r) => {
      const aantal = r.messages.filter((m) => m.ruleId === KIT_REGEL).length;
      const relatief = r.filePath.slice(process.cwd().length + 1);
      const toegestaan = suppressions[relatief]?.[KIT_REGEL]?.count ?? 0;
      return aantal > toegestaan ? [`${relatief}: ${String(aantal)} meldingen, ${String(toegestaan)} onderdrukt`] : [];
    });

    expect(results.length).toBeGreaterThan(0);
    expect(onbedekt).toStrictEqual([]);
  }, 120_000);
});

describe('rails/klassen blijft ongewijzigd (AC-10)', () => {
  const FEATURE_PADEN = ['src/web/features/x.tsx', 'src/web/routes/x.tsx'];

  test.each(FEATURE_PADEN)('app-thema/AC-10: layout-klassen geven geen melding van rails/klassen (%s)', async (pad) => {
    const goed = 'export const x = <div className="flex gap-4 p-4 w-full" />;';
    const fout = 'export const x = <div className="text-sm" />;';

    // Positieve basis: een fout geval meldt wel, dus de regel draait voor dit pad.
    expect(await meldingen(pad, fout, 'rails/klassen')).toHaveLength(1);
    expect(await meldingen(pad, goed, 'rails/klassen')).toStrictEqual([]);
  });

  test.each(FEATURE_PADEN)('app-thema/AC-10: text-sm, style en een niet-string className melden (%s)', async (pad) => {
    expect(await meldingen(pad, 'export const x = <div className="text-sm" />;', 'rails/klassen')).toHaveLength(1);
    expect(await meldingen(pad, 'export const x = <div style={{}} />;', 'rails/klassen')).toHaveLength(1);
    expect(await meldingen(pad, 'export const x = <div className={cls} />;', 'rails/klassen')).toHaveLength(1);
  });

  test.each(FEATURE_PADEN)(
    'app-thema/AC-10: rails/klassen-kit gaat in features/ en routes/ niet af (%s)',
    async (pad) => {
      const code = 'export const x = <div className="w-[13rem] text-sm" style={{ width: 240 }} />;';

      expect(await meldingen(pad, code, 'rails/klassen')).not.toHaveLength(0);
      expect(await meldingen(pad, code)).toStrictEqual([]);
    },
  );

  test.each(KIT_PADEN)('app-thema/AC-10: rails/klassen gaat in de kit niet af (%s)', async (pad) => {
    const code = 'export const x = <div className="text-sm" style={{}} />;';

    expect(await meldingen('src/web/features/x.tsx', code, 'rails/klassen')).not.toHaveLength(0);
    expect(await meldingen(pad, code, 'rails/klassen')).toStrictEqual([]);
  });
});
