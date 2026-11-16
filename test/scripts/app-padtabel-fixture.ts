import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nieuwePaden } from '../rails/padtabel-kit';

// Gedeelde fixtures voor de script-tests van spec app-padtabel (geen test zelf): een map met `.claude/gates.json` en een
// app-bestand, een kopie van de kit om `scripts/kit/*.mjs` in die map te draaien, en een gates.json-tekst in de opmaak van de
// echte (een rij per regel, zodat een git-merge rij voor rij werkt).
export const ROOT = path.join(import.meta.dirname, '../..');

export const GIT_ENV = {
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@example.com',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@example.com',
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

export interface Uitslag {
  status: number | null;
  stdout: string;
  stderr: string;
}

/** Draait een commando synchroon in `cwd`; de aanroeper beoordeelt de uitslag. */
export function draai(cwd: string, [commando = '', ...args]: string[], env: Record<string, string> = {}): Uitslag {
  const result = spawnSync(commando, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV, CLAUDECODE: '', ...env },
    timeout: 60_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** Git in `cwd`; gooit bij een fout en geeft stdout (zonder eindregel). */
export function git(cwd: string, ...args: string[]): string {
  const uit = draai(cwd, ['git', ...args]);
  if (uit.status !== 0) throw new Error(`git ${args.join(' ')}: ${uit.stderr}`);
  return uit.stdout.trim();
}

export function nieuweMap(prefix: string, dirs: string[]): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

export function schrijf(dir: string, files: Record<string, string>) {
  for (const [rel, inhoud] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), inhoud);
  }
}

/** Kopieert `scripts/kit` en `rails/hooks/lib` naar `dir`, zodat `node scripts/kit/<script>.mjs` er met zijn eigen imports draait. */
export function kopieerKit(dir: string) {
  for (const map of ['scripts/kit', 'rails/hooks/lib']) {
    mkdirSync(path.join(dir, map), { recursive: true });
    cpSync(path.join(ROOT, map), path.join(dir, map), { recursive: true });
  }
}

export const ONDERHOUD_REGEL = '  "onderhoud": { "repository": "BramLambertJansen/template" },\n';

/**
 * Een gates.json in de nieuwe vorm, een rij per regel; `extraRij` komt na de eerste rij (midden in `paden`), `onderhoud` en
 * `goedkeurders` staan eronder, ver van de rijen.
 */
export function gatesTekst(extraRij?: string): string {
  const rijen = Object.entries(nieuwePaden()).map(
    ([glob, rij]) => `    ${JSON.stringify(glob)}: ${JSON.stringify(rij)}`,
  );
  const alle = extraRij === undefined ? rijen : [...rijen.slice(0, 1), `    ${extraRij}`, ...rijen.slice(1)];
  return [
    '{',
    '  "$comment": "template",',
    '  "paden": {',
    alle.join(',\n'),
    '  },',
    ONDERHOUD_REGEL.trimEnd(),
    '  "merge": "niet-kritiek",',
    '  "testpaden": ["**/*.test.*", "test/**"],',
    '  "jsonGates": { "package.json": ["scripts"] },',
    '  "gegenereerd": [],',
    '  "migraties": ["db/migrations/**"],',
    '  "mcpLezen": [],',
    '  "goedkeurders": ["bramlambertjansen"],',
    '  "schrijfrecht": {',
    '    "architect": ["docs/specs/**", "docs/adr/**"],',
    '    "tester": ["**/*.test.*", "test/**"],',
    '    "reviewer": [],',
    '    "docs": ["docs/reviews/**", "CHANGELOG.md"],',
    '    "developer": ["**"]',
    '  }',
    '}',
    '',
  ].join('\n');
}
