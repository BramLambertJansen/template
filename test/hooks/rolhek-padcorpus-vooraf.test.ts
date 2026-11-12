import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { decide, loadConfig } from '../../rails/hooks/lib/rolhek.mjs';
import { PADCORPUS, type Rij, type Uitkomst } from './rolhek-padcorpus.ts';

// Spec rolhek-vooraf-krimp AC-1 (ADR 0071): elke padbeslissing van het rolhek over een Bash-commando staat in één corpus
// (`rolhek-padcorpus.ts`). Vooraf: de toets (`decide`, PreToolUse) geeft nog steeds de vastgelegde uitkomst. De toets achteraf
// (AC-2, AC-5) is met de effecttoets vervallen (ADR 0091); de velden `achteraf`, `reden` en `alsVeranderd` van het corpus
// tellen hier niet mee.
const config = loadConfig(readFileSync(path.resolve(import.meta.dirname, '../../.claude/gates.json'), 'utf8'));
const ROOT = '/repo';

function voorafCtx(rij: Rij) {
  const bestanden = rij.bestanden;
  const lijsten = rij.lijsten;
  return {
    root: ROOT,
    cwd: ROOT,
    config,
    read: (rel: string) => bestanden[rel] ?? null,
    committed: (rel: string) => rij.gecommit?.includes(rel) ?? false,
    isDir: (rel: string) => rij.mappen?.includes(rel) ?? false,
    ...(lijsten === undefined ? {} : { files: (rel: string) => [...(lijsten[rel] ?? [])] }),
    branch: rij.branch ?? 'feat/x',
    ...(rij.onderhoud === true ? { onderhoud: true } : {}),
  };
}

function vooraf(rij: Rij): Uitkomst {
  const payload = {
    tool_name: 'Bash',
    tool_input: { command: rij.commando },
    ...(rij.rol === '' ? {} : { agent_type: rij.rol }),
  };
  const d = decide(payload, voorafCtx(rij));
  if (d.deny.length > 0) return 'deny';
  if (d.ask.length > 0) return 'ask';
  return d.context.length > 0 ? 'melding' : 'door';
}

const naam = (rij: Rij) => `${rij.rol || 'hoofdsessie'}: ${rij.commando.slice(0, 100)} (${rij.bron})`;

describe('rolhek-vooraf-krimp/AC-1: het corpus geeft vooraf de vastgelegde uitkomst', () => {
  test.each(PADCORPUS.map((rij) => [naam(rij), rij] as const))('%s', (_naam, rij) => {
    expect(vooraf(rij)).toBe(rij.uitkomst);
  });
});
