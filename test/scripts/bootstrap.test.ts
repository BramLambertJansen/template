import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { z } from 'zod';
import { ROOT, ruimOp, tijdelijk } from './nieuwe-app-kit.ts';

// Tests voor het resultaatbestand van scripts/bootstrap.sh (spec nieuwe-app-script, AC-17), geschreven vóór de bouw. Nep-`mise`,
// -`pnpm` en doctor in een fixture-kopie (geen git-repo, dus `head` is null). `node` en `jq` staan als markerende stubs op PATH:
// bij een falende `mise install` is er geen Node, dus het bestand moet met printf in shell geschreven worden.
afterEach(ruimOp);

const STAPPEN = ['mise-trust', 'mise-install', 'pnpm-install', 'lefthook', 'doctor-machine'];
const Bootstrap = z.object({
  schema: z.literal(1),
  commando: z.string(),
  tijd: z.string(),
  head: z.string().nullable(),
  dryRun: z.boolean(),
  uitslag: z.enum(['ok', 'fout']),
  stappen: z.array(
    z.object({
      id: z.string(),
      status: z.enum(['ok', 'fout', 'overgeslagen']),
      melding: z.string(),
      herstel: z.string().nullable(),
    }),
  ),
});

function script(map: string, naam: string, body: string): void {
  mkdirSync(path.dirname(path.join(map, naam)), { recursive: true });
  writeFileSync(path.join(map, naam), `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(path.join(map, naam), 0o755);
}

interface Opties {
  /** De mise-opdracht die met 1 eindigt, bijvoorbeeld `install`; leeg: alles slaagt. */
  miseFaalt?: string;
  doctorFaalt?: boolean;
}

function fixture(opties: Opties): string {
  const root = tijdelijk('bootstrap-');
  mkdirSync(path.join(root, '.template'), { recursive: true });
  mkdirSync(path.join(root, 'scripts'), { recursive: true });
  cpSync(path.join(ROOT, 'scripts/bootstrap.sh'), path.join(root, 'scripts/bootstrap.sh'));
  script(
    root,
    'scripts/doctor.sh',
    `printf 'doctor %s\\n' "$*" >> "$STUB_LOG"\n${opties.doctorFaalt === true ? 'exit 1' : 'exit 0'}`,
  );
  script(
    root,
    'bin/mise',
    `printf 'mise %s\\n' "$*" >> "$STUB_LOG"
if [[ -n "\${MISE_FAALT:-}" && "$1" == "$MISE_FAALT" ]]; then exit 1; fi
if [[ "$1" == exec && -n "\${MISE_FAALT:-}" && " $* " == *" $MISE_FAALT "* ]]; then exit 1; fi
exit 0`,
  );
  script(root, 'bin/pnpm', 'printf "pnpm %s\\n" "$*" >> "$STUB_LOG"');
  for (const naam of ['node', 'jq']) script(root, `bin/${naam}`, `printf '${naam}\\n' >> "$STUB_LOG"; exit 99`);
  writeFileSync(path.join(root, 'log'), '');
  // Een oude machinecontrole die bij de start van bootstrap weg moet.
  writeFileSync(
    path.join(root, '.template/doctor-machine.json'),
    JSON.stringify({
      schema: 1,
      commando: 'doctor-machine',
      tijd: '2020-01-01T00:00:00.000Z',
      head: null,
      dryRun: false,
      uitslag: 'ok',
      stappen: [],
    }),
  );
  return root;
}

function draai(root: string, opties: Opties) {
  const r = spawnSync('bash', [path.join(root, 'scripts/bootstrap.sh')], {
    cwd: root,
    encoding: 'utf8',
    env: {
      HOME: root,
      PATH: `${root}/bin:/usr/bin:/bin`,
      STUB_LOG: path.join(root, 'log'),
      MISE_FAALT: opties.miseFaalt ?? '',
      GIT_CEILING_DIRECTORIES: path.dirname(root),
    },
  });
  return { ...r, log: readFileSync(path.join(root, 'log'), 'utf8') };
}

function leesBootstrap(root: string): z.infer<typeof Bootstrap> {
  const bestand = path.join(root, '.template/bootstrap.json');
  expect(existsSync(bestand), '.template/bootstrap.json bestaat').toBe(true);
  return Bootstrap.parse(JSON.parse(readFileSync(bestand, 'utf8')));
}

describe('nieuwe-app-script/AC-17: bootstrap schrijft zijn uitslag, ook bij een fout', () => {
  test('nieuwe-app-script/AC-17 een falende mise install: exit ≠ 0, doctor-machine.json weg, install fout en de rest overgeslagen', () => {
    const opties = { miseFaalt: 'install' };
    const root = fixture(opties);
    const r = draai(root, opties);
    expect(r.status, r.stdout + r.stderr).not.toBe(0);
    expect(readdirSync(path.join(root, '.template')), 'het oude bestand is weg').not.toContain('doctor-machine.json');
    const uit = leesBootstrap(root);
    expect(uit.commando).toBe('bootstrap');
    expect(uit.uitslag).toBe('fout');
    expect(uit.head, 'geen git-repo: head is null').toBeNull();
    expect(uit.stappen.map((s) => s.id)).toStrictEqual(STAPPEN);
    expect(uit.stappen.map((s) => s.status)).toStrictEqual([
      'ok',
      'fout',
      'overgeslagen',
      'overgeslagen',
      'overgeslagen',
    ]);
    expect(uit.stappen[1]?.herstel, 'de falende stap noemt een herstel').not.toBeNull();
    expect(r.log, 'pnpm, doctor en lefthook zijn niet gestart').not.toContain('doctor');
    expect(r.log).not.toContain('pnpm');
  });

  test('nieuwe-app-script/AC-17 bootstrap gebruikt geen Node of jq om het bestand te schrijven', () => {
    const opties = { miseFaalt: 'install' };
    const root = fixture(opties);
    const r = draai(root, opties);
    expect(r.log).not.toContain('node\n');
    expect(r.log).not.toContain('jq\n');
    expect(existsSync(path.join(root, '.template/bootstrap.json'))).toBe(true);
  });

  test('nieuwe-app-script/AC-17 een falende lefthook-stap zet alleen de doctor op overgeslagen', () => {
    const opties = { miseFaalt: 'lefthook' };
    const root = fixture(opties);
    const r = draai(root, opties);
    expect(r.status).not.toBe(0);
    const uit = leesBootstrap(root);
    expect(uit.stappen.map((s) => s.status)).toStrictEqual(['ok', 'ok', 'ok', 'fout', 'overgeslagen']);
    expect(uit.uitslag).toBe('fout');
  });

  test('nieuwe-app-script/AC-17 een falende doctor --machine zet doctor-machine op fout en de uitslag op fout', () => {
    const opties = { doctorFaalt: true };
    const root = fixture(opties);
    const r = draai(root, opties);
    expect(r.status).not.toBe(0);
    const uit = leesBootstrap(root);
    expect(uit.stappen.map((s) => s.status)).toStrictEqual(['ok', 'ok', 'ok', 'ok', 'fout']);
    expect(uit.uitslag).toBe('fout');
    expect(r.log).toContain('doctor --machine');
  });

  test('nieuwe-app-script/AC-17 een geslaagde bootstrap geeft exit 0 en alle vijf stappen ok', () => {
    const root = fixture({});
    const r = draai(root, {});
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const uit = leesBootstrap(root);
    expect(uit.uitslag).toBe('ok');
    expect(uit.stappen.map((s) => [s.id, s.status])).toStrictEqual(STAPPEN.map((id) => [id, 'ok']));
    expect(readdirSync(path.join(root, '.template')), 'doctor-machine.json is bij de start weggehaald').not.toContain(
      'doctor-machine.json',
    );
  });
});
