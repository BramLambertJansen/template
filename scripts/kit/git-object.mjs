// Git-objecten lezen zonder checkout; los van status-git.mjs zodat diff-guard.mjs geen importcyclus krijgt.
import { gitText } from '../../rails/hooks/lib/authority-context.mjs';

/** @param {string} root @param {string} file @param {string} sha */
export function regularGitFile(root, file, sha) {
  const tree = gitText(root, ['ls-tree', sha, '--', file]);
  return tree !== null && /^100(?:644|755) blob [0-9a-f]{40}\t/.test(tree);
}
