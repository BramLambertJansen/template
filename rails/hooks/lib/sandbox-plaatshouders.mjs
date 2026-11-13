// Plaatshouders die de sandbox van Claude Code in de werkmap zet (ADR 0084 punt 2, ADR 0091 punt 2): `pnpm pr:verify` telt ze
// niet als wijziging van de werkmap (scripts/kit/pr-verify.mjs, `verifyWorktree`).

/**
 * Een ongetrackt pad op deze lijst is een plaatshouder als het een leeg gewoon bestand zonder uitvoerbit of een tekenapparaat
 * 1,3 is. De lijst groeit alleen met eigenaarakkoord. `.env` en `.env.local` (leerpunt #642): alleen deze volledige paden
 * vanaf de wortel, geen basisnaam of patroon.
 */
export const SANDBOX_LEEG = Object.freeze([
  '.bash_profile',
  '.bashrc',
  '.profile',
  '.zshrc',
  '.zprofile',
  '.gitconfig',
  '.gitmodules',
  '.ripgreprc',
  '.mcp.json',
  '.idea',
  '.claude/commands',
  '.claude/launch.json',
  '.claude/loop.md',
  '.claude/output-styles',
  '.claude/routines',
  '.claude/scheduled_tasks.json',
  '.claude/workflows',
  '.env',
  '.env.local',
]);

// `makedev(1, 3)` in de Linux-codering (glibc): de codering is eenduidig, dus alleen deze waarde is major 1, minor 3.
const RDEV_NUL = 1 * 256 + 3;

/**
 * Een tekenapparaat met major 1 en minor 3 (`/dev/null`).
 * @param {{ rdev: number, isCharacterDevice: () => boolean }} stat
 */
export const isNulApparaat = (stat) => stat.isCharacterDevice() && stat.rdev === RDEV_NUL;
