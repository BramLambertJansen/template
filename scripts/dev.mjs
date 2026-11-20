// Lokale ontwikkelomgeving (framework §11): Docker-check, poortcontrole (API_PORT en WEB_PORT vrij), .env.local uit
// .env.example als hij ontbreekt, de stack (Postgres + Mailpit) via compose, migraties, daarna Hono (API) en Vite (web)
// naast elkaar; stopt allebei als er één stopt. De poortcontrole komt vóór de kopie: ontbreekt .env.local, dan moeten alle
// vijf standaardpoorten vrij zijn (ook Postgres en Mailpit: de stack van een andere app blijft draaien na haar pnpm dev).
// Is er één bezet, dan blijft .env.local weg, zodat `node scripts/kit/nieuwe-app.mjs poorten --env` een andere set kan
// kiezen in plaats van de bezette poorten over te nemen (spec nieuwe-app-script).
import { spawn, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { STANDAARD_POORTEN, isVrij, testBind } from './kit/nieuwe-app.mjs';

const ENV_FILE = '.env.local';

/**
 * Een poortsleutel uit het env-bestand (alleen een regel met cijfers telt, zoals `port()` in scripts/doctor.sh).
 * @param {string} tekst
 * @param {string} sleutel
 * @param {number} terugval
 */
function poort(tekst, sleutel, terugval) {
  const waarden = [...tekst.matchAll(new RegExp(`^${sleutel}=([0-9]+)\\s*$`, 'gm'))].map((m) => Number(m[1]));
  return waarden.at(-1) ?? terugval;
}

/** Stopt als API_PORT of WEB_PORT bezet is: vóór compose, zodat niet een halve stack start. */
async function eisVrijePoorten() {
  let tekst = '';
  try {
    tekst = readFileSync(existsSync(ENV_FILE) ? ENV_FILE : '.env.example', 'utf8');
  } catch {
    // niet leesbaar: de standaardpoorten
  }
  for (const [sleutel, terugval] of /** @type {const} */ ([
    ['API_PORT', 8787],
    ['WEB_PORT', 5173],
  ])) {
    const nummer = poort(tekst, sleutel, terugval);
    if (await isVrij(nummer, testBind())) continue;
    console.error(
      `✗ poort ${String(nummer)} (${sleutel}) is bezet\n  → stop de andere pnpm dev, of kies poorten met node scripts/kit/nieuwe-app.mjs poorten`,
    );
    process.exit(1);
  }
}

/**
 * Zonder .env.local zou de kopie van .env.example de standaardpoorten van Postgres en Mailpit vastleggen. Is er één bezet
 * (de stack van een andere app), stop dan vóór de kopie: `poorten --env` neemt een bestaande .env.local over en verschuift
 * dan niets meer.
 */
async function eisVrijeStackPoorten() {
  for (const [sleutel, nummer] of /** @type {const} */ ([
    ['PG_PORT', STANDAARD_POORTEN.pg],
    ['MAIL_UI_PORT', STANDAARD_POORTEN.mailUi],
    ['SMTP_PORT', STANDAARD_POORTEN.smtp],
  ])) {
    if (await isVrij(nummer, testBind())) continue;
    console.error(
      `✗ poort ${String(nummer)} (${sleutel}) is bezet en .env.local ontbreekt\n  → kies een vrije set met node scripts/kit/nieuwe-app.mjs poorten --env`,
    );
    process.exit(1);
  }
}

/**
 * @param {string} command
 * @param {string[]} args
 * @param {string} hint
 */
function step(command, args, hint) {
  const { status } = spawnSync(command, args, { stdio: 'inherit' });
  if (status !== 0) {
    console.error(`\n✗ ${[command, ...args].join(' ')} faalde.\n  → ${hint}`);
    process.exit(1);
  }
}

if (spawnSync('docker', ['info'], { stdio: 'ignore' }).status !== 0) {
  console.error(
    '✗ Docker draait niet (of je zit niet in de groep docker).\n  → sudo systemctl start docker; daarna scripts/doctor.sh',
  );
  process.exit(1);
}

await eisVrijePoorten();

if (!existsSync(ENV_FILE)) {
  await eisVrijeStackPoorten();
  copyFileSync('.env.example', ENV_FILE);
  console.info(`${ENV_FILE} gemaakt uit .env.example (lokale demo-waarden).`);
}

step(
  'docker',
  ['compose', '--env-file', ENV_FILE, 'up', '-d', '--build', '--wait'],
  'docker compose --env-file .env.local logs postgres; zie docs/nieuwe-app.md, probleemtabel',
);
step('scripts/db-migrate.sh', [ENV_FILE, 'up'], 'lees de dbmate-fout hierboven; wijzig nooit een gecommitte migratie');
step(
  process.execPath,
  [`--env-file=${ENV_FILE}`, 'scripts/seed.mjs'],
  'lees de seed-fout hierboven (scripts/seed.mjs)',
);

const children = [
  spawn(process.execPath, [`--env-file-if-exists=${ENV_FILE}`, '--watch', 'src/api/server.ts'], { stdio: 'inherit' }),
  spawn('pnpm', ['exec', 'vite'], { stdio: 'inherit' }),
];

let stopping = false;
/** @param {number} code */
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
