import { execFileSync } from 'node:child_process';

// Een git-hook (pre-push → gate:fast) geeft GIT_DIR, GIT_INDEX_FILE e.d. door. In een worktree zijn die absoluut: een test die in een
// tijdelijke map `git init` of `git add -A` draait, schrijft dan in de echte repo (core.bare = true, fixtures in de index).
// Daarom haalt elke testworker de repo-variabelen van git weg; git noemt ze zelf met `rev-parse --local-env-vars`.
const names = execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).split('\n').filter(Boolean);
for (const name of names) Reflect.deleteProperty(process.env, name);
