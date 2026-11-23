import { describe, expect, test } from 'vitest';
import * as check from '../../scripts/kit/leerpunt-check.mjs';
import { LABEL_ZONDER_BEWIJS, leesGebeurtenis, stappen, teToetsen } from '../../scripts/kit/leerpunt-check.mjs';
import { exported } from '../rails/template-repo-kit';

// Spec leerlus-bewijs AC-13, ADR 0101 punt 2: sluiten als duplicaat telt als bewijs. De tester neemt deze uitbreiding van de
// bestaande API aan (de developer bouwt hem; zie het rapport):
//
//   leesGebeurtenis(...).reden            — `issue.state_reason` uit de payload (ook bij `issue_comment`), anders ''.
//   beoordeelSluiting(nummer, bron, haalDoel): Promise<'bewijs' | 'achterhaald' | 'duplicaat' | 'zonder-bewijs'>
//     bron   = { prs, comments, reden } (prs en comments als bij `sluitOordeel` uit leerpunt.mjs, reden = state_reason)
//     haalDoel(doelnummer) = Promise van de REST-body van `repos/<repo>/issues/<doelnummer>` (`labels: [{ name }]`, optioneel
//              `pull_request`), of `null` bij een fout 404. Geen netwerk in de test; de workflow geeft hier de echte fetch.
//     Bewijs en achterhaald gaan voor (zoals `sluitOordeel`); `stappen({ oordeel: 'duplicaat' })` haalt het label weg.
const beoordeelSluiting = (...args: unknown[]) => Promise.resolve(exported(check, 'beoordeelSluiting')(...args));

const NR = 9;
const LEERPUNT = { number: 7, labels: [{ name: 'leerpunt' }, { name: 'leerpunt-onvolledig' }] };
const OWNER = { body: 'duplicaat van #7', association: 'OWNER' };

/** Een doelopvraag zonder netwerk: nummer → REST-body of null (404); onbekend nummer is een 404. */
function doelen(tabel: Record<number, unknown>) {
  const aangevraagd: number[] = [];
  const haalDoel = (nummer: number): Promise<unknown> => {
    aangevraagd.push(nummer);
    return Promise.resolve(tabel[nummer] ?? null);
  };
  return { haalDoel, aangevraagd };
}

const oordeel = async (
  bron: { reden?: string; comments: unknown[]; prs?: unknown[] },
  tabel: Record<number, unknown>,
) => beoordeelSluiting(NR, { prs: [], reden: 'duplicate', ...bron }, doelen(tabel).haalDoel);

describe('leerlus-bewijs/AC-13 de sluitreden komt uit de payload', () => {
  test.each([
    { naam: 'issues', actie: 'closed', reden: 'duplicate' },
    { naam: 'issues', actie: 'closed', reden: 'completed' },
    { naam: 'issues', actie: 'closed', reden: 'not_planned' },
    { naam: 'issue_comment', actie: 'created', reden: 'duplicate' },
  ])('leerlus-bewijs/AC-13: $naam $actie met state_reason $reden uit de payload', ({ naam, actie, reden }) => {
    const event = {
      action: actie,
      issue: { number: NR, state: 'closed', state_reason: reden, body: '', labels: [{ name: 'leerpunt' }] },
    };
    expect(leesGebeurtenis(event, naam)).toMatchObject({ reden });
  });

  test('leerlus-bewijs/AC-13: zonder state_reason is de reden leeg', () => {
    const event = {
      action: 'closed',
      issue: { number: NR, state: 'closed', body: '', labels: [{ name: 'leerpunt' }] },
    };
    expect(leesGebeurtenis(event, 'issues')).toMatchObject({ reden: '' });
  });

  test('leerlus-bewijs/AC-13: een comment op een gesloten leerpunt en het sluiten zelf toetsen het sluitbewijs', () => {
    const issue = { number: NR, state: 'closed', labels: [{ name: 'leerpunt' }] };
    expect(teToetsen(leesGebeurtenis({ action: 'created', issue }, 'issue_comment'))).toMatchObject({ sluiten: true });
    expect(teToetsen(leesGebeurtenis({ action: 'closed', issue }, 'issues'))).toMatchObject({ sluiten: true });
  });
});

describe('leerlus-bewijs/AC-13 duplicaat telt als bewijs', () => {
  test.each([
    ['owner, doel is een leerpunt', { comments: [OWNER] }, { 7: LEERPUNT }],
    ['member', { comments: [{ body: 'duplicaat van #7', association: 'MEMBER' }] }, { 7: LEERPUNT }],
    ['collaborator', { comments: [{ body: 'duplicaat van #7', association: 'COLLABORATOR' }] }, { 7: LEERPUNT }],
    [
      'tekst na de verwijzing',
      { comments: [{ body: 'duplicaat van #7: zelfde reproductie', association: 'OWNER' }] },
      { 7: LEERPUNT },
    ],
    [
      'doel is gesloten (telt, open of dicht)',
      { comments: [OWNER] },
      { 7: { ...LEERPUNT, state: 'closed', state_reason: 'completed' } },
    ],
    ['doel met alleen het label leerpunt', { comments: [OWNER] }, { 7: { number: 7, labels: [{ name: 'leerpunt' }] } }],
    [
      'comment vóór het sluiten geplaatst: alle comments tellen, ook de eerste',
      { comments: [OWNER, { body: 'klaar, sluit maar', association: 'OWNER' }] },
      { 7: LEERPUNT },
    ],
    [
      'een ongeldige comment ervoor, een geldige erna',
      {
        comments: [
          { body: 'duplicaat van #7', association: 'NONE' },
          { body: 'duplicaat van #8', association: 'OWNER' },
          OWNER,
        ],
      },
      { 7: LEERPUNT, 8: { number: 8, labels: [{ name: 'bug' }] } },
    ],
  ])('leerlus-bewijs/AC-13: %s', async (_naam, bron, tabel) => {
    expect(await oordeel(bron, tabel)).toBe('duplicaat');
  });

  test('leerlus-bewijs/AC-13: het doel wordt opgevraagd met het nummer uit de comment', async () => {
    const { haalDoel, aangevraagd } = doelen({ 7: LEERPUNT });
    await beoordeelSluiting(NR, { prs: [], reden: 'duplicate', comments: [OWNER] }, haalDoel);
    expect(aangevraagd).toContain(7);
  });

  test('leerlus-bewijs/AC-13: een gemergde PR met regel of een achterhaald-comment gaat voor een duplicaat', async () => {
    const pr = { merged: true, body: `## Leerpunt\n\n- #${String(NR)}: trede Check; bewijs test/a.test.ts` };
    expect(await oordeel({ prs: [pr], comments: [] }, {})).toBe('bewijs');
    const achterhaald = { body: 'achterhaald: opgelost door #520', association: 'OWNER' };
    expect(await oordeel({ comments: [achterhaald] }, {})).toBe('achterhaald');
  });
});

describe('leerlus-bewijs/AC-13 telt niet: label zoals AC-6, de job crasht niet', () => {
  test.each([
    ['andere sluitreden: completed', { reden: 'completed', comments: [OWNER] }, { 7: LEERPUNT }],
    ['andere sluitreden: not_planned', { reden: 'not_planned', comments: [OWNER] }, { 7: LEERPUNT }],
    ['geen sluitreden', { reden: '', comments: [OWNER] }, { 7: LEERPUNT }],
    [
      'comment van een andere auteur (CONTRIBUTOR)',
      { comments: [{ body: 'duplicaat van #7', association: 'CONTRIBUTOR' }] },
      { 7: LEERPUNT },
    ],
    [
      'comment van een auteur zonder band (NONE)',
      { comments: [{ body: 'duplicaat van #7', association: 'NONE' }] },
      { 7: LEERPUNT },
    ],
    [
      'verwijzing naar zichzelf',
      { comments: [{ body: `duplicaat van #${String(NR)}`, association: 'OWNER' }] },
      { [NR]: LEERPUNT },
    ],
    [
      'doel zonder label leerpunt',
      { comments: [OWNER] },
      { 7: { number: 7, labels: [{ name: 'bug' }, { name: 'leerpunt-onvolledig' }] } },
    ],
    ['doel zonder labels', { comments: [OWNER] }, { 7: { number: 7, labels: [] } }],
    [
      'doel is een PR (veld pull_request)',
      { comments: [OWNER] },
      { 7: { ...LEERPUNT, pull_request: { url: 'https://api.github.com/repos/o/r/pulls/7' } } },
    ],
    ['doel bestaat niet (404)', { comments: [OWNER] }, {}],
    [
      'comment begint niet met duplicaat van',
      { comments: [{ body: 'zie ook: duplicaat van #7', association: 'OWNER' }] },
      { 7: LEERPUNT },
    ],
    [
      'duplicaat van zonder #nummer',
      { comments: [{ body: 'duplicaat van 7', association: 'OWNER' }] },
      { 7: LEERPUNT },
    ],
    ['geen comments', { comments: [] }, { 7: LEERPUNT }],
  ])('leerlus-bewijs/AC-13: %s', async (_naam, bron, tabel) => {
    expect(await oordeel(bron, tabel)).toBe('zonder-bewijs');
  });

  test('leerlus-bewijs/AC-13: doel 404 geeft geen fout maar zonder-bewijs', async () => {
    await expect(oordeel({ comments: [OWNER] }, {})).resolves.toBe('zonder-bewijs');
  });
});

describe('leerlus-bewijs/AC-13 label aan of uit', () => {
  test('leerlus-bewijs/AC-13: oordeel duplicaat haalt het label weg, ook op issue_comment na het sluiten', () => {
    expect(stappen({ fouten: null, oordeel: 'duplicaat', heropend: false })).toMatchObject([
      { label: LABEL_ZONDER_BEWIJS, aan: false, comment: null },
    ]);
    const naSluiten = leesGebeurtenis(
      {
        action: 'created',
        issue: {
          number: NR,
          state: 'closed',
          state_reason: 'duplicate',
          labels: [{ name: 'leerpunt' }, { name: LABEL_ZONDER_BEWIJS }],
        },
      },
      'issue_comment',
    );
    expect(teToetsen(naSluiten)).toMatchObject({ sluiten: true });
  });

  test('leerlus-bewijs/AC-13: zonder bewijs blijft het label aan, zoals in AC-6', () => {
    expect(stappen({ fouten: null, oordeel: 'zonder-bewijs', heropend: false })).toMatchObject([
      { label: LABEL_ZONDER_BEWIJS, aan: true },
    ]);
  });
});
