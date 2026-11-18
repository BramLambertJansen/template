// CI-bewijs op een commit: de verplichte checks van GitHub Actions, groen op exact die SHA (`pnpm pr:verify` en het
// mergescript). Het bouwbewijs voor `gebouwd` is weg met `pnpm docs:status` (ADR 0095).

export const GITHUB_ACTIONS_APP_ID = 15368;
// De aparte CodeQL-resultaatcheck komt van GitHub Advanced Security, niet van de Actions-analysejob.
const CODE_SCANNING_APP_ID = 57789;

/** @typedef {{ id: number, name: string, headSha: string, status: string, conclusion: string | null, appId: number }} CheckRun */
/** @typedef {{ number: number, repository: string, branch: string, headSha: string, state: string, merged: boolean, mergeSha: string | null, baseBranch: string }} PullRequest */

/** @param {CheckRun[]} checks @param {{ names: string[], sha: string }} required */
export function requiredProofChecks(checks, required) {
  const scanning = required.names.some((name) => name.startsWith('codeql (')) ||
    checks.some((check) => check.name === 'CodeQL' && check.headSha === required.sha);
  return scanning && !required.names.includes('CodeQL') ? [...required.names, 'CodeQL'] : required.names;
}

/** @param {string} name */
export function expectedCheckAppId(name) {
  return name === 'CodeQL' ? CODE_SCANNING_APP_ID : GITHUB_ACTIONS_APP_ID;
}

/** @param {CheckRun[]} checks @param {{ names: string[], sha: string }} required */
export function checkedCommit(checks, required) {
  if (required.names.length === 0 || !/^[0-9a-f]{40}$/.test(required.sha)) return false;
  return requiredProofChecks(checks, required).every((name) => {
    const matching = checks.filter((check) => check.name === name && check.headSha === required.sha);
    if (matching.some((check) => check.appId !== expectedCheckAppId(name))) return false;
    const latest = matching.toSorted((left, right) => right.id - left.id)[0];
    return latest?.status === 'completed' && latest.conclusion === 'success';
  });
}
