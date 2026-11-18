import { execFileSync } from 'node:child_process';

// Een git-hook (pre-push → gate:fast) geeft GIT_DIR, GIT_INDEX_FILE e.d. door. In een worktree zijn die absoluut: een test die in een
// tijdelijke map `git init` of `git add -A` draait, schrijft dan in de echte repo (core.bare = true, fixtures in de index).
// Daarom haalt elke testworker de repo-variabelen van git weg; git noemt ze zelf met `rev-parse --local-env-vars`.
// Zonder git (de runner, ADR 0044) kan geen test via git in de repo schrijven: dan is er niets weg te halen.
function repoVariables(): string[] {
  try {
    return execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
    throw error;
  }
}

for (const name of repoVariables()) Reflect.deleteProperty(process.env, name);

// Leerpunt #755: een fixture mag niet van de gitconfig van de machine afhangen (bv. commit.gpgsign=true met een signeerprogramma
// dat in de testomgeving niet werkt). Daarom geen globale en geen systeemconfig; een test die zelf een globale config nodig heeft,
// zet GIT_CONFIG_GLOBAL na deze setup. De vaste testidentiteit vervangt user.name/user.email uit de globale config; een test die
// zelf GIT_AUTHOR_*/GIT_COMMITTER_* in zijn env zet, houdt die (deze variabelen gaan vóór `-c user.name=…` en de repoconfig).
process.env['GIT_CONFIG_GLOBAL'] = '/dev/null';
process.env['GIT_CONFIG_NOSYSTEM'] = '1';
process.env['GIT_AUTHOR_NAME'] ??= 'Test';
process.env['GIT_AUTHOR_EMAIL'] ??= 'test@example.test';
process.env['GIT_COMMITTER_NAME'] ??= 'Test';
process.env['GIT_COMMITTER_EMAIL'] ??= 'test@example.test';

// Ook de samenvatting van de CI-job (meting-stuurt/AC-3): een test die `leespad` of `ratchet` start, zou anders de uitvoer van
// zijn fixture op de PR zetten. Een test die de samenvatting toetst, zet de variabele zelf.
Reflect.deleteProperty(process.env, 'GITHUB_STEP_SUMMARY');
