import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';
import { ROOT, laadModule } from '../scripts/nieuwe-app-kit.ts';

// Docs-tests van spec nieuwe-app-script (AC-15 en AC-16, bouwstap 1), geschreven vóór de bouw: playbook, docs/app-naslag.md,
// .env.example en dev.mjs. Zonder omvangsgrens: de omvang van het playbook is een meting in `pnpm leespad` (ADR 0065 punt 2,
// test/rails/leesbudget-playbook.test.ts). "Een template-update binnenhalen" blijft in bouwstap 1 ongewijzigd (werking 10).
const mod = await laadModule();

function lees(pad: string): string {
  const bestand = path.join(ROOT, pad);
  expect(existsSync(bestand), `${pad} bestaat`).toBe(true);
  return readFileSync(bestand, 'utf8');
}

/** De sectie vanaf de kop tot de volgende kop van hetzelfde of een hoger niveau; leeg als de kop ontbreekt. */
function sectie(tekst: string, kop: string): string {
  const niveau = /^#+/.exec(kop)?.[0].length ?? 1;
  const begin = tekst.split('\n').findIndex((regel) => regel === kop || regel.startsWith(`${kop} `));
  if (begin < 0) return '';
  const regels = tekst.split('\n').slice(begin + 1);
  const eind = regels.findIndex((regel) => new RegExp(`^#{1,${String(niveau)}} `).test(regel));
  return [kop, ...(eind < 0 ? regels : regels.slice(0, eind))].join('\n');
}

const playbook = lees('docs/nieuwe-app.md');
const naslag = (): string => lees('docs/app-naslag.md');

describe('nieuwe-app-script/AC-15: het playbook noemt de deelcommando\'s in plaats van de commandoblokken', () => {
  test('nieuwe-app-script/AC-15 5.1 noemt koppel en het resultaatbestand, niet meer de merge-commando\'s', () => {
    const tekst = sectie(playbook, '### 5.1 Koppelen');
    expect(tekst, '5.1 bestaat').not.toBe('');
    expect(tekst).toContain('nieuwe-app.mjs koppel');
    expect(tekst).toContain('.template/nieuwe-app-koppel.json');
    expect(tekst).not.toContain('git merge --allow-unrelated-histories');
    expect(tekst).not.toContain('git remote add template');
  });

  test('nieuwe-app-script/AC-15 7.1 noemt poorten (--env) en het resultaatbestand, niet meer cp of ss', () => {
    const tekst = sectie(playbook, '### 7.1 Poorten en `.env.local`');
    expect(tekst, '7.1 bestaat').not.toBe('');
    expect(tekst).toContain('nieuwe-app.mjs poorten');
    expect(tekst).toContain('--env');
    expect(tekst).toContain('.template/nieuwe-app-poorten.json');
    expect(tekst).not.toContain('cp -n .env.example');
    expect(tekst).not.toContain('ss -ltnH');
  });

  test('nieuwe-app-script/AC-15 fase 8 noemt db-bewijs en het resultaatbestand, niet meer de psql-tabel', () => {
    const tekst = sectie(playbook, '## Fase 8 — Migraties en databasebewijs');
    expect(tekst, 'fase 8 bestaat').not.toBe('');
    expect(tekst).toContain('nieuwe-app.mjs db-bewijs');
    expect(tekst).toContain('.template/nieuwe-app-db-bewijs.json');
    expect(tekst).not.toContain('psql "$M"');
  });

  test('nieuwe-app-script/AC-15 de versheidsregel staat in het playbook: head gelijk aan git rev-parse HEAD en tijd na de overdracht', () => {
    const begin = playbook.search(/versheid/i);
    expect(begin, 'het playbook noemt de versheidsregel').toBeGreaterThanOrEqual(0);
    const venster = playbook.slice(begin, begin + 1200);
    for (const woord of ['`head`', 'git rev-parse HEAD', '`tijd`', 'SETUP-PROGRESS.md'])
      expect(venster, `de versheidsregel noemt ${woord}`).toContain(woord);
  });

  test('nieuwe-app-script/AC-15 de Node-regel staat in het playbook, ook in de uitzondering van "Jij installeert geen toolchain"', () => {
    expect(playbook).toContain('mise exec node@');
    expect(playbook).toContain('mise.toml');
    const regel = /^- \*\*Jij installeert geen toolchain[\s\S]*?(?=^- \*\*)/m.exec(playbook)?.[0] ?? '';
    expect(regel, 'de harde regel bestaat').not.toBe('');
    expect(regel).toContain('scripts/kit/nieuwe-app.mjs');
    expect(regel).toContain('scripts/kit/app-init.mjs');
  });

  test('nieuwe-app-script/AC-15 de Windows-aanroep via wsl.exe -d <distro> -- bash -lc "cd ~/… && …nieuwe-app.mjs…" staat erin', () => {
    expect(playbook).toMatch(/wsl\.exe -d <distro> -- bash -lc "cd ~\/[^"\n]*nieuwe-app\.mjs[^"\n]*"/);
  });

  test('nieuwe-app-script/AC-15 de harde regel over .env.local noemt poorten --env en niet meer cp of "noemt ze niet"', () => {
    const regel = /^- \*\*`\.env\.local`[\s\S]*?(?=^- \*\*)/m.exec(playbook)?.[0] ?? '';
    expect(regel, 'de harde regel over .env.local bestaat').not.toBe('');
    expect(regel).toContain('node scripts/kit/nieuwe-app.mjs poorten --env');
    expect(regel).not.toContain('`cp`');
    expect(playbook).not.toContain('noemt ze niet');
  });

  test('nieuwe-app-script/AC-15 begeleiding, overdrachten, voortgangsbestand, fouttabel en de template-update blijven staan', () => {
    for (const kop of [
      '## Begeleiding: ook voor wie niet technisch is',
      '## Voortgangsbestand — lees dit eerst, elke keer',
      '## Notities voor de overdracht',
      '## Een template-update binnenhalen',
      '## Fout → oorzaak',
    ])
      expect(playbook, kop).toContain(`\n${kop}\n`);
    expect(sectie(playbook, '## Een template-update binnenhalen').length, 'de sectie is niet leeggehaald').toBeGreaterThan(2000);
  });

  test('nieuwe-app-script/AC-15 de naslagkoppen staan in docs/app-naslag.md en in het playbook alleen als verwijsregel', () => {
    const doel = naslag();
    for (const kop of ['## Naslag: dagelijks werken', '## Eigen agentinstructies van de app', '## Een eigen beschermd pad']) {
      expect(sectie(doel, kop).length, `${kop} staat met inhoud in docs/app-naslag.md`).toBeGreaterThan(300);
      const inPlaybook = sectie(playbook, kop);
      expect(inPlaybook, `${kop} staat nog als kop in het playbook`).not.toBe('');
      expect(inPlaybook, `${kop} verwijst naar docs/app-naslag.md`).toContain('app-naslag.md');
      const inhoud = inPlaybook.split('\n').slice(1).filter((regel) => regel.trim() !== '');
      expect(inhoud, `${kop}: één verwijsregel`).toHaveLength(1);
    }
  });

  // Bouwstap 2 (repo-instellingen, 6.2-zin van AC-15 en werking 10).
  test('nieuwe-app-script/AC-15 6.2 noemt repo-instellingen, --controleer en het resultaatbestand, niet meer de commandoblokken', () => {
    const tekst = sectie(playbook, '### 6.2 Repo-instellingen');
    expect(tekst, '6.2 bestaat').not.toBe('');
    expect(tekst).toContain('nieuwe-app.mjs repo-instellingen');
    expect(tekst).toContain('--controleer');
    expect(tekst).toContain('.template/nieuwe-app-repo-instellingen.json');
    expect(tekst).not.toContain('gh repo edit "$R" --enable-merge-commit');
    expect(tekst).not.toContain('gh api -X PUT "repos/$R/actions/permissions');
  });

  test('nieuwe-app-script/AC-15 6.2 noemt --controleer als controle van ruleset en instellingen', () => {
    const tekst = sectie(playbook, '### 6.2 Repo-instellingen');
    expect(tekst).toMatch(/repo-instellingen --repo \S+[^\n]*--controleer/);
    const i = tekst.indexOf('--controleer');
    expect(tekst.slice(Math.max(0, i - 400), i + 400), 'de controle noemt de ruleset').toContain('ruleset');
    expect(tekst).toContain('scripts/github-ruleset.sh');
  });

  test('nieuwe-app-script/AC-15 de zin "Of de ruleset blijft staan, controleert niets" staat er niet meer', () => {
    expect(playbook).not.toContain('Of de ruleset blijft staan, controleert niets');
  });
});

describe('nieuwe-app-script/AC-16: .env.example en de poorten van het script', () => {
  const voorbeeld = lees('.env.example');
  const waarde = (sleutel: string): string | undefined => new RegExp(`^${sleutel}=(.*)$`, 'm').exec(voorbeeld)?.[1];

  test('nieuwe-app-script/AC-16 .env.example heeft API_PORT=8787 en WEB_PORT=5173', () => {
    expect(waarde('API_PORT')).toBe('8787');
    expect(waarde('WEB_PORT')).toBe('5173');
  });

  test('nieuwe-app-script/AC-16 de kopregel noemt poorten --env als bron van .env.local en niet meer "pnpm dev schrijft .env.local"', () => {
    const kop = voorbeeld
      .split('\n')
      .slice(0, 6)
      .filter((regel) => regel.startsWith('#'))
      .join('\n');
    expect(kop).toContain('node scripts/kit/nieuwe-app.mjs poorten --env');
    expect(kop).not.toContain('pnpm dev schrijft');
  });

  test('nieuwe-app-script/AC-16 de kopregel en scripts/dev.mjs zijn consistent: pnpm dev staat in de kopregel precies als dev.mjs .env.local nog kopieert', () => {
    const kop = voorbeeld
      .split('\n')
      .filter((regel) => regel.startsWith('#'))
      .slice(0, 3)
      .join('\n');
    const dev = readFileSync(path.join(ROOT, 'scripts/dev.mjs'), 'utf8');
    const kopieertNog = dev.includes('copyFileSync');
    expect(kop.includes('pnpm dev'), 'de kopregel noemt pnpm dev als dev.mjs nog kopieert, anders niet').toBe(kopieertNog);
  });

  test('nieuwe-app-script/AC-16 de vijf standaardpoorten en de sleutels van werking 6 in het script zijn gelijk aan .env.example', () => {
    expect(mod.bestaat, 'scripts/kit/nieuwe-app.mjs bestaat').toBe(true);
    const p = mod.STANDAARD_POORTEN;
    expect([p.pg, p.mailUi, p.smtp, p.api, p.web]).toStrictEqual([54322, 54324, 54325, 8787, 5173]);
    expect([waarde('PG_PORT'), waarde('MAIL_UI_PORT'), waarde('SMTP_PORT'), waarde('API_PORT'), waarde('WEB_PORT')]).toStrictEqual(
      [p.pg, p.mailUi, p.smtp, p.api, p.web].map(String),
    );
    for (const sleutel of mod.ENV_SLEUTELS) expect(waarde(sleutel), `${sleutel} staat in .env.example`).toBeDefined();
    expect(mod.ENV_SLEUTELS).toStrictEqual([
      'PG_PORT',
      'MAIL_UI_PORT',
      'SMTP_PORT',
      'API_PORT',
      'WEB_PORT',
      'DATABASE_URL',
      'AUTH_DATABASE_URL',
      'MIGRATOR_DATABASE_URL',
      'SMTP_URL',
      'APP_ORIGIN',
      'AUTH_BASE_URL',
    ]);
    for (const sleutel of ['DATABASE_URL', 'AUTH_DATABASE_URL', 'MIGRATOR_DATABASE_URL'])
      expect(waarde(sleutel), sleutel).toContain(`:${String(p.pg)}/`);
    expect(waarde('SMTP_URL')).toContain(`:${String(p.smtp)}`);
    expect(waarde('APP_ORIGIN')).toBe(`http://localhost:${String(p.web)}`);
    expect(waarde('AUTH_BASE_URL')).toBe(`http://localhost:${String(p.web)}`);
  });
});
