import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, onTestFinished, test } from 'vitest';
import { inKooi } from '../../scripts/kit/kooi.mjs';

const document = readFileSync(new URL('../../START-NIEUWE-APP.md', import.meta.url), 'utf8');
const firstDocument = 'START-NIEUWE-APP.md';
const secondDocument = 'nieuwe-app.md';

function runBootstrap(failure = '') {
  const step = document.split(/^6\. \*\*Instructies klaarzetten en agent starten\.\*\*/m)[1]?.split(/^7\. /m)[0];
  const block = step?.match(/^ {3}```bash\n([\s\S]+?)^ {3}```/m)?.[1];
  if (block === undefined) throw new Error('Het Bash-blok van stap 6 ontbreekt');

  const home = realpathSync(mkdtempSync(join(tmpdir(), 'start-nieuwe-app-')));
  onTestFinished(() => {
    rmSync(home, { recursive: true, force: true });
  });
  const bin = join(home, 'bin');
  const setup = join(home, 'setup');
  const trace = join(home, 'trace');
  mkdirSync(bin);
  writeFileSync(trace, '');

  // Een eerdere poging kan de map en beide bestanden hebben achtergelaten.
  if (failure !== '') {
    mkdirSync(setup);
    for (const name of [firstDocument, secondDocument]) writeFileSync(join(setup, name), 'Oude versie\n');
  }

  const stubs = {
    mkdir: `printf 'mkdir\n' >> "$TRACE"
[[ "$FAILURE" != mkdir && "\${@: -1}" == "$HOME/setup" ]] || exit 1
/bin/mkdir -p -- "$HOME/setup"`,
    curl: `while (( $# )); do
  case "$1" in
    https://*) name="\${1##*/}" ;;
    -o) output="$2"; shift ;;
  esac
  shift
done
printf 'curl %s\n' "$name" >> "$TRACE"
[[ "$name" != "$FAILURE" && "$output" == "$HOME/setup/$name" ]] || exit 22
printf '%s\n' "$name" > "$output"`,
    claude: `printf 'claude %s\n' "$PWD" >> "$TRACE"
[[ "$PWD" == "$HOME/setup" ]] || exit 1
for name in ${firstDocument} ${secondDocument}; do
  IFS= read -r content < "$name" || exit 1
  printf '%s\n' "$content" >> "$TRACE"
done`,
  };
  for (const [name, script] of Object.entries(stubs)) {
    writeFileSync(join(bin, name), `#!/bin/bash\n${script}\n`, { mode: 0o700 });
  }

  const result = inKooi(`PATH="$HOME/bin"\n${block}`, {
    werkmap: home,
    env: { TRACE: trace, FAILURE: failure },
    timeout: 3_000,
  });
  return { result, setup, calls: readFileSync(trace, 'utf8').trim().split('\n') };
}

test('stap 6 start Claude vanuit de setupmap nadat beide instructies zijn opgehaald', () => {
  const { result, setup, calls } = runBootstrap();
  expect(result.status, result.stderr).toBe(0);
  expect(calls).toEqual([
    'mkdir',
    `curl ${firstDocument}`,
    `curl ${secondDocument}`,
    `claude ${setup}`,
    firstDocument,
    secondDocument,
  ]);
});

test.each([
  { failure: 'mkdir', expected: ['mkdir'] },
  { failure: firstDocument, expected: ['mkdir', `curl ${firstDocument}`] },
  { failure: secondDocument, expected: ['mkdir', `curl ${firstDocument}`, `curl ${secondDocument}`] },
])('stap 6 stopt als $failure mislukt, ook als de setupmap al bestaat', ({ failure, expected }) => {
  const { calls } = runBootstrap(failure);
  expect(calls).toEqual(expected);
});
