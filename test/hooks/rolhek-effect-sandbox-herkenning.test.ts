import { mkdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import * as snapshot from '../../rails/hooks/lib/effect-snapshot.mjs';
import { nepStat, nieuweDir, roep, type Soort } from './effect-sandbox-kit';

// docs/specs/rolhek-effect.md AC-11 (a), ADR 0084 punt 1: de herkenning van vorm A (het tekenapparaat 1,3 van een koppeling
// van /dev/null) als zuivere functie. Voorgeschreven vorm (de spec noemt geen namen; dit is de handtekening die deze tests
// vragen): `afgeschermdePaden({ mountinfo, root, paden, lstat, getrackt, realpath? })` in `effect-snapshot.mjs`, met
// `mountinfo` de tekst van /proc/self/mountinfo (of null), `root` de werkmap, `paden` de kandidaten (relatief),
// `lstat(volledigPad)` zoals `lstatSync`, `getrackt(rel)` of het pad in HEAD of de index staat, en `realpath` (standaard
// `realpathSync`). Het resultaat is een Set (of lijst) met de relatieve paden die bevestigd afgeschermd zijn; de functie gooit
// nooit (elke fout is "niet erkend").
const ROOT = '/work/repo';

type Invoer = {
  mountinfo: string | null;
  root: string;
  paden: string[];
  lstat: (vol: string) => unknown;
  getrackt: (rel: string) => boolean;
  realpath: ((pad: string) => string) | undefined;
};

type Regel = { punt: string; root?: string; opties?: string; velden?: string; fs?: string; superOpties?: string };

/** Een regel van /proc/self/mountinfo: id parent maj:min root mountpoint opties [optionele velden] - fstype bron superopties. */
function regel(r: Regel): string {
  const velden = r.velden === undefined ? 'master:2 ' : r.velden;
  const fs = r.fs ?? 'devtmpfs';
  return `36 35 0:6 ${r.root ?? '/null'} ${r.punt} ${r.opties ?? 'ro,nosuid,noexec,relatime'} ${velden}- ${fs} ${fs} ${r.superOpties ?? 'rw,size=8192k,nr_inodes=2048,mode=755'}`;
}

const RUIS = [
  '25 1 0:22 / / rw,relatime - overlay overlay rw,lowerdir=/a,upperdir=/b,workdir=/c',
  '26 25 0:23 / /proc rw,nosuid,nodev,noexec,relatime - proc proc rw',
].join('\n');

const tekst = (...regels: Regel[]): string => `${RUIS}\n${regels.map(regel).join('\n')}\n`;
const apparaat = (soort: Soort) => () => nepStat(soort);

function herken(mountinfo: string | null, ruimte: Partial<Invoer> = {}): string[] {
  const invoer: Invoer = {
    mountinfo,
    root: ROOT,
    paden: ['.env'],
    lstat: apparaat('apparaat-1-3'),
    getrackt: () => false,
    realpath: (pad) => pad,
    ...ruimte,
  };
  const uit = roep(snapshot, 'afgeschermdePaden', invoer);
  if (uit instanceof Set) return [...uit].map(String).toSorted();
  if (Array.isArray(uit)) return uit.map(String).toSorted();
  throw new Error('afgeschermdePaden moet een Set of lijst met paden geven');
}

describe('rolhek-effect/AC-11 (a): vorm A wordt erkend bij precies de voorwaarden', () => {
  test('ro in veld 6, root /null, devtmpfs en tekenapparaat 1,3 op een ongetrackt pad: erkend', () => {
    expect(herken(tekst({ punt: `${ROOT}/.env` }))).toStrictEqual(['.env']);
  });

  test('ook een schrijfpad uit #567 (.bashrc) en een pad op diepte (config/.env.local); elk met een eigen regel', () => {
    const paden = ['.env', '.bashrc', 'config/.env.local'];
    const info = tekst(...paden.map((rel) => ({ punt: `${ROOT}/${rel}` })));
    expect(herken(info, { paden })).toStrictEqual(['.bashrc', '.env', 'config/.env.local']);
  });

  test('zonder optionele velden (geen `master:2`) tussen de opties en het streepje', () => {
    expect(herken(tekst({ punt: `${ROOT}/.env`, velden: '' }))).toStrictEqual(['.env']);
  });

  test('de optie `ro` telt in veld 6 tussen andere opties, niet als deel van een andere optie', () => {
    expect(herken(tekst({ punt: `${ROOT}/.env`, opties: 'nosuid,ro,relatime' }))).toStrictEqual(['.env']);
  });

  test('\\040 in het pad wordt ontsleuteld: werkmap met een spatie wordt wel erkend', () => {
    const info = tekst({ punt: '/work/my\\040repo/.env' });
    expect(herken(info, { root: '/work/my repo' })).toStrictEqual(['.env']);
  });

  test('meerdere regels voor één koppelpunt: de laatste telt (eerst rw, dan ro/null: erkend)', () => {
    const info = tekst({ punt: `${ROOT}/.env`, opties: 'rw,relatime', root: '/anders' }, { punt: `${ROOT}/.env` });
    expect(herken(info)).toStrictEqual(['.env']);
  });

  test('de werkmap wordt eerst onder realpath gelegd: een symlink naar de werkmap geeft het koppelpunt onder het echte pad', () => {
    const info = tekst({ punt: `${ROOT}/.env` });
    const realpath = (pad: string): string => (pad === '/link/repo' ? ROOT : pad);
    expect(herken(info, { root: '/link/repo', realpath })).toStrictEqual(['.env']);
  });

  test('zonder meegegeven realpath wordt `realpathSync` gebruikt (echte tijdelijke map)', () => {
    const root = realpathSync(nieuweDir('herkenning'));
    mkdirSync(path.join(root, 'config'), { recursive: true });
    const info = tekst({ punt: `${root}/.env` });
    expect(herken(info, { root, realpath: undefined })).toStrictEqual(['.env']);
  });

  test('alleen de gevraagde paden worden teruggegeven, ook als mountinfo er meer kent', () => {
    const info = tekst({ punt: `${ROOT}/.env` }, { punt: `${ROOT}/.bashrc` });
    expect(herken(info, { paden: ['.env'] })).toStrictEqual(['.env']);
  });
});

describe('rolhek-effect/AC-11 (a): elk dichtvalgeval geeft geen erkenning (de staat van AC-1, dus een overtreding)', () => {
  const rw: Regel = { punt: `${ROOT}/.env`, opties: 'rw,nosuid,noexec,relatime' };
  const gevallen: [string, string | null, Partial<Invoer>][] = [
    ['rw in veld 6, ook als de opties van het bestandssysteem ro zijn', tekst({ ...rw, superOpties: 'ro' }), {}],
    ['root /zero in plaats van /null', tekst({ punt: `${ROOT}/.env`, root: '/zero' }), {}],
    ['root /null/x (alleen een voorvoegsel)', tekst({ punt: `${ROOT}/.env`, root: '/null/x' }), {}],
    ['een ander bestandssysteem (tmpfs)', tekst({ punt: `${ROOT}/.env`, fs: 'tmpfs' }), {}],
    [
      'een latere regel voor hetzelfde koppelpunt zonder ro (de laatste telt)',
      tekst({ punt: `${ROOT}/.env` }, { ...rw }),
      {},
    ],
    [
      'een latere regel voor hetzelfde koppelpunt met een andere root',
      tekst({ punt: `${ROOT}/.env` }, { punt: `${ROOT}/.env`, root: '/elders' }),
      {},
    ],
    ['alleen de bovenliggende map is gekoppeld (koppelpunt = werkmap)', tekst({ punt: ROOT }), {}],
    [
      'alleen de bovenliggende map is gekoppeld voor een pad op diepte',
      tekst({ punt: `${ROOT}/config` }),
      { paden: ['config/.env.local'] },
    ],
    [
      'een koppelpunt dat alleen zonder realpath gelijk is',
      tekst({ punt: '/link/repo/.env' }),
      { root: '/link/repo', realpath: (pad: string) => (pad === '/link/repo' ? ROOT : pad) },
    ],
    [
      'geen dubbele ontsleuteling: een werkmap met een echte backslash is niet de werkmap met een spatie',
      tekst({ punt: '/work/a\\040b/.env' }),
      { root: '/work/a\\040b' },
    ],
    [
      'lstat geeft een tekenapparaat 1,5 (minor 5)',
      tekst({ punt: `${ROOT}/.env` }),
      { lstat: apparaat('apparaat-1-5') },
    ],
    [
      'lstat geeft een tekenapparaat 5,3 (major 5)',
      tekst({ punt: `${ROOT}/.env` }),
      { lstat: apparaat('apparaat-5-3') },
    ],
    [
      'lstat geeft een gewoon bestand (vorm B is geen vorm A)',
      tekst({ punt: `${ROOT}/.env` }),
      { lstat: apparaat('gewoon') },
    ],
    ['lstat geeft een map', tekst({ punt: `${ROOT}/.env` }), { lstat: apparaat('map') }],
    ['het pad staat in HEAD of de index (getrackt)', tekst({ punt: `${ROOT}/.env` }), { getrackt: () => true }],
    ['mountinfo is null (onleesbaar)', null, {}],
    ['mountinfo is leeg', '', {}],
    ['mountinfo is onzin', 'dit is geen mountinfo\nen dit ook niet\n', {}],
    [
      'lstat gooit',
      tekst({ punt: `${ROOT}/.env` }),
      {
        lstat: () => {
          throw new Error('EACCES');
        },
      },
    ],
    [
      'getrackt gooit',
      tekst({ punt: `${ROOT}/.env` }),
      {
        getrackt: () => {
          throw new Error('git faalde');
        },
      },
    ],
    [
      'realpath gooit',
      tekst({ punt: `${ROOT}/.env` }),
      {
        realpath: () => {
          throw new Error('ENOENT');
        },
      },
    ],
  ];

  test.each(gevallen)('%s', (_naam, mountinfo, ruimte) => {
    expect(herken(mountinfo, ruimte)).toStrictEqual([]);
  });
});
