import { describe, expect, test } from 'vitest';
import { receptenSectie, receptRijen } from '../../scripts/kit/recepten.mjs';

// Spec agent-recepten, AC-7: de kaart docs/operations/recepten.md als feitensectie `recepten` (scripts/kit/recepten.mjs).
const KAART = [
  '# Recepten',
  '',
  '| Taak | Lokaal | Cloud |',
  '|---|---|---|',
  '| Runs | `gh api "repos/{owner}/{repo}/actions/runs" --jq \'.workflow_runs[] \\| {id}\'` | idem |',
  '| PR openen | `gh pr create --head <branch> --body-file <bestand>` | MCP `mcp__github__create_pull_request` |',
  '',
  'Tekst onder de tabel.',
].join('\n');

const RUNS = '`gh api "repos/{owner}/{repo}/actions/runs" --jq \'.workflow_runs[] | {id}\'`';

describe('agent-recepten/AC-7: receptRijen', () => {
  test('agent-recepten/AC-7: \\| binnen een codespan blijft één cel met een letterlijke | en idem is gelijk aan Lokaal', () => {
    expect(receptRijen(KAART)).toStrictEqual([
      { taak: 'Runs', lokaal: RUNS, cloud: RUNS },
      {
        taak: 'PR openen',
        lokaal: '`gh pr create --head <branch> --body-file <bestand>`',
        cloud: 'MCP `mcp__github__create_pull_request`',
      },
    ]);
  });

  test('agent-recepten/AC-7: zonder de kop | Taak | Lokaal | Cloud | geen rijen', () => {
    expect(receptRijen('| Taak | Commando |\n|---|---|\n| a | `git status` |\n')).toStrictEqual([]);
  });
});

describe('agent-recepten/AC-7: receptenSectie', () => {
  test('agent-recepten/AC-7: cloud geeft per rij de cel Cloud, lokaal de cel Lokaal', () => {
    const cloud = receptenSectie(KAART, { cloud: true, alle: false });
    expect(cloud.inhoud).toStrictEqual([
      { taak: 'Runs', commando: RUNS },
      { taak: 'PR openen', commando: 'MCP `mcp__github__create_pull_request`' },
    ]);
    expect(cloud.json).toStrictEqual(cloud.inhoud);
    expect(cloud.kop).toContain('runtime cloud');
    const lokaal = receptenSectie(KAART, { cloud: false, alle: false });
    expect(lokaal.inhoud).toStrictEqual([
      { taak: 'Runs', commando: RUNS },
      { taak: 'PR openen', commando: '`gh pr create --head <branch> --body-file <bestand>`' },
    ]);
    expect(lokaal.kop).toContain('runtime lokaal');
  });

  test('agent-recepten/AC-7: alle geeft beide kolommen', () => {
    expect(receptenSectie(KAART, { cloud: true, alle: true }).inhoud).toStrictEqual([
      { taak: 'Runs', lokaal: RUNS, cloud: RUNS },
      {
        taak: 'PR openen',
        lokaal: '`gh pr create --head <branch> --body-file <bestand>`',
        cloud: 'MCP `mcp__github__create_pull_request`',
      },
    ]);
  });

  test('agent-recepten/AC-7: zonder kaart of zonder tabel één regel', () => {
    expect(receptenSectie(null, { cloud: false, alle: false }).inhoud).toStrictEqual([
      'docs/operations/recepten.md ontbreekt',
    ]);
    expect(receptenSectie('# Leeg\n', { cloud: false, alle: false }).inhoud).toStrictEqual([
      'docs/operations/recepten.md: geen tabel met | Taak | Lokaal | Cloud |',
    ]);
  });
});
