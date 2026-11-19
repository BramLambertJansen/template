import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';

// Bewijsbestand voor leerpunt #847 (spec rolhek-aanvalscorpus, OV-1): het ene structurele gat dat het corpus op `main` vindt, op
// zichzelf en zonder het corpusbestand (de job `leerpunt-bewijs` kopieert alleen dit bestand naar de basis). Een groep `{ b; }`
// rond een commando laat het rolhek het commando niet meer zien: `git push --force` is verboden voor elke rol (WS-04), maar
// `{ git push --force; }` gaat door. De rest van het corpus (vormen × basissen × rollen) staat in `rolhek-aanvalscorpus.test.ts`.
const config = loadConfig(readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));

const ROLLEN = ['', 'architect', 'developer', 'tester', 'docs', 'reviewer', 'general-purpose'];

function geweigerd(command: string, rol: string): boolean {
  const beslissing = decide(
    { tool_name: 'Bash', tool_input: { command }, ...(rol === '' ? {} : { agent_type: rol }) },
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
  return beslissing.deny.length > 0 || beslissing.ask.length > 0;
}

describe('rolhek-aanvalscorpus/AC-2 vorm { b; }: een groep rond een git-verbod laat de weigering niet los', () => {
  test.each(ROLLEN)(
    'rolhek-aanvalscorpus/AC-2 rol %j: `{ git push --force; }` is geweigerd, net als `git push --force`',
    (rol) => {
      expect({
        direct: geweigerd('git push --force', rol),
        groep: geweigerd('{ git push --force; }', rol),
      }).toStrictEqual({ direct: true, groep: true });
    },
  );
});
