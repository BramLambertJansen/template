// Git-feiten voor `pnpm pr:verify`; de statushelpers van `pnpm docs:status` zijn weg (ADR 0095).
import { gitText } from '../../rails/hooks/lib/authority-context.mjs';

/** HEAD, branch en origin/main zijn nog wat ze bij de start waren. @param {string} root @param {{ head: string, branch: string, base: string }} expected */
export function unchangedHead(root, expected) {
  return (
    gitText(root, ['rev-parse', 'HEAD'])?.trim() === expected.head &&
    gitText(root, ['branch', '--show-current'])?.trim() === expected.branch &&
    gitText(root, ['rev-parse', 'origin/main'])?.trim() === expected.base
  );
}
