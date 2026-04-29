/**
 * Beads Query Helpers
 *
 * Re-exports the unified resolver under its historical bd name. Both
 * `bd <id>` and `tasks <pathOrId>` flow through `resolveTaskNode` —
 * see `apps/km-cli/src/utils/resolve-task.ts` for the resolution chain.
 */

export { resolveIssue as resolveIssueArg } from "../utils/resolve-task.ts"
