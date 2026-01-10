/**
 * @km/watch - Filesystem watching and sync
 *
 * Re-exports from src/watch for backwards compatibility
 */

// Watcher
export { createWatcher, scanDirectory } from "../../../src/watch/watcher.ts";

// Sync
export { syncMarkdownFile, syncToMarkdown } from "../../../src/watch/sync.ts";

// Reconcile
export {
  reconcileDirectory,
  applyReconcileOps,
  getParentNodeId,
} from "../../../src/watch/reconcile.ts";
export type { ReconcileOp } from "../../../src/watch/reconcile.ts";

// Ignore patterns
export { shouldIgnore, DEFAULT_IGNORE_PATTERNS } from "../../../src/watch/ignore.ts";

// Write queue
export { createWriteQueue } from "../../../src/watch/writequeue.ts";
export type { WriteQueue } from "../../../src/watch/writequeue.ts";
