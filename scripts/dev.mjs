// Lokale ontwikkelserver: Hono (API) en Vite (web) naast elkaar; stopt allebei als er één stopt.
// Volgt in roadmap stuk 1b: Docker-check, .env.local uit .env.example, compose up en migraties.
import { spawn } from 'node:child_process';

const children = [
  spawn(process.execPath, ['--env-file-if-exists=.env.local', '--watch', 'src/api/server.ts'], { stdio: 'inherit' }),
  spawn('pnpm', ['exec', 'vite'], { stdio: 'inherit' }),
];

let stopping = false;
function stop(code) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}

for (const child of children) child.on('exit', (code) => stop(code ?? 1));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
