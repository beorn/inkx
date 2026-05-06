/**
 * Re-export shim — pure planner moved to `tasks/orphans-plan.ts` as part
 * of Wave 6 of `@km/cli/task-bd-collapse`. The bd-orphans command is now
 * a thin alias shim over `task orphans`; the planner is shared.
 *
 * Kept here so existing test imports (`bd-orphans-plan.test.ts`) continue
 * to work without churn.
 */

export { findOrphans, parseGitLog, type CommitEntry, type IssueLike, type Orphan } from "./tasks/orphans-plan.ts"
