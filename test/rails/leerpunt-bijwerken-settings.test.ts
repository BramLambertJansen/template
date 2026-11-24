import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

// Spec leerlus-bewijs AC-12, ADR 0101 punt 5. Naast de allow-regel voor `gh issue create` (test/rails/leerpunt-settings.test.ts)
// staan in .claude/settings.json precies drie regels, met <repo> letterlijk `template.repository` uit .claude/gates.json:
//
//   Bash(gh issue comment --repo <repo> *)   Bash(gh issue edit --repo <repo> *)   Bash(gh issue close --repo <repo> *)
//
// De vorm is dus `gh issue <actie> --repo <repo> <nr> …`; met `-R`, een andere repo of zonder repo dekt geen regel het commando.

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function child(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return Object.entries(value).find(([name]) => name === key)?.[1];
}

const settings: unknown = JSON.parse(readFileSync('.claude/settings.json', 'utf8'));
const gates: unknown = JSON.parse(readFileSync('.claude/gates.json', 'utf8'));
const allow = strings(child(child(settings, 'permissions'), 'allow'));
const REPO = String(child(child(gates, 'template'), 'repository'));
const ACTIES = ['comment', 'edit', 'close'] as const;
const regel = (actie: string) => `Bash(gh issue ${actie} --repo ${REPO} *)`;

/** Bash-permissieregel als regex: `*` is willekeurige tekst, een afsluitende `:*` is een prefix (oude vorm). */
function matcher(rule: string): RegExp | null {
  const body = /^Bash\((.*)\)$/s.exec(rule)?.[1];
  if (body === undefined) return null;
  const prefix = body.endsWith(':*');
  const pattern = (prefix ? body.slice(0, -2) : body)
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}${prefix ? '(?:\\s.*)?' : ''}$`, 's');
}

const coveredBy = (command: string): string[] => allow.filter((rule) => matcher(rule)?.test(command) === true);

describe('settings: allow-regels voor leerpunten bijwerken en sluiten', () => {
  test('leerlus-bewijs/AC-12: gates.json heeft een template.repository', () => {
    expect(REPO).toMatch(/^[\w.-]+\/[\w.-]+$/);
  });

  test.each(ACTIES)('leerlus-bewijs/AC-12: precies één allow-regel voor gh issue %s, in de exacte vorm', (actie) => {
    expect(allow.filter((rule) => rule === regel(actie))).toStrictEqual([regel(actie)]);
    expect(allow.filter((rule) => rule.includes(`gh issue ${actie}`))).toStrictEqual([regel(actie)]);
  });

  test('leerlus-bewijs/AC-12: de bestaande regel voor gh issue create blijft naast de drie nieuwe staan', () => {
    expect(allow).toContain(`Bash(gh issue create --repo ${REPO} --label leerpunt *)`);
    expect(allow.filter((rule) => /gh issue (create|comment|edit|close)/.test(rule))).toHaveLength(4);
  });

  test.each([
    { naam: 'comment', command: `gh issue comment --repo ${REPO} 5 --body-file f.md` },
    { naam: 'edit', command: `gh issue edit --repo ${REPO} 5 --title Titel` },
    { naam: 'close', command: `gh issue close --repo ${REPO} 5 --duplicate-of 3` },
  ])('leerlus-bewijs/AC-12: de juiste vorm van $naam valt onder precies die ene regel', ({ naam, command }) => {
    expect(coveredBy(command)).toStrictEqual([regel(naam)]);
  });

  test.each(
    ACTIES.flatMap((actie) => [
      { naam: `${actie}: met -R in plaats van --repo`, command: `gh issue ${actie} -R ${REPO} 5` },
      { naam: `${actie}: andere repo`, command: `gh issue ${actie} --repo iemand/anders 5` },
      { naam: `${actie}: zonder repo`, command: `gh issue ${actie} 5` },
      { naam: `${actie}: nummer vóór --repo`, command: `gh issue ${actie} 5 --repo ${REPO}` },
      { naam: `${actie}: --repo= met gelijkteken`, command: `gh issue ${actie} --repo=${REPO} 5` },
    ]),
  )('leerlus-bewijs/AC-12: $naam valt onder geen enkele allow-regel', ({ command }) => {
    expect(allow.length).toBeGreaterThan(0);
    expect(coveredBy(command)).toStrictEqual([]);
  });

  test.each(['reopen', 'delete', 'transfer', 'lock', 'unlock', 'pin', 'unpin', 'develop'])(
    'leerlus-bewijs/AC-12: gh issue %s valt onder geen enkele allow-regel, ook niet met de juiste repo',
    (actie) => {
      expect(coveredBy(`gh issue ${actie} --repo ${REPO} 5`)).toStrictEqual([]);
    },
  );

  test('leerlus-bewijs/AC-12: geen bredere regel (gh *, gh issue *) dekt een schrijvend commando', () => {
    expect(allow.filter((rule) => /^Bash\(gh( issue)?( \*|:\*)\)$/.test(rule))).toStrictEqual([]);
  });
});

// Spec leerlus-bewijs AC-19, ADR 0109 punt 3: `.claude/settings.json` verandert niet; de bestaande regel voor gh issue close
// dekt ook `--reason completed`, naast `--duplicate-of`. Regressievergrendeling, nu al groen.
describe('settings: sluiten als opgelost (AC-19)', () => {
  test.each([
    { naam: '--reason completed', command: `gh issue close --repo ${REPO} 5 --reason completed` },
    { naam: '--duplicate-of', command: `gh issue close --repo ${REPO} 5 --duplicate-of 3` },
  ])('leerlus-bewijs/AC-19: close $naam valt onder precies de ene close-regel', ({ command }) => {
    expect(coveredBy(command)).toStrictEqual([regel('close')]);
  });

  test('leerlus-bewijs/AC-19: close --reason completed met -R of zonder repo valt onder geen enkele allow-regel', () => {
    expect(coveredBy(`gh issue close -R ${REPO} 5 --reason completed`)).toStrictEqual([]);
    expect(coveredBy('gh issue close 5 --reason completed')).toStrictEqual([]);
  });

  test('leerlus-bewijs/AC-19: precies vier gh issue-regels (create, comment, edit, close)', () => {
    expect(allow.filter((rule) => rule.includes('gh issue '))).toHaveLength(4);
  });
});
