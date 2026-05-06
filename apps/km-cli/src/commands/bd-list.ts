/**
 * Beads List + Ready — `bd list [query...]`, `bd ready [query...]`
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: thin alias shims. Both
 * delegate in-process to `listTasks` from `tasks/list.ts` — the
 * canonical board-view surface that powers `km task` and `km task ready`.
 *
 * BD_ALIASES table (see bd.ts):
 *   list  → ["task"]            (bare task = list/board view)
 *   ready → ["task", "ready"]   (status: "todo" + unblocked preset)
 *
 * Wave 6 surface deviations from the legacy bd surface (documented; not
 * silently broken):
 *   - `-t, --type <type>`: not forwarded — `task` doesn't filter by issue
 *     type tag. Use `--query "#bug"` style filtering or wait for the
 *     planned `task --type` flag (Wave 7 ergonomics).
 *   - `--all` (board-roots-scope opt-out): not forwarded — `task` doesn't
 *     scope to bd config beads roots. The default scope is "every node
 *     looking like a task." Pass an explicit path positional to scope.
 *   - Output format: bd's `printIssue` (with blocked-by + dep-count) is
 *     replaced by the task formatter (`formatTaskWithPath`/`formatTaskLine`).
 *     The repo state is identical; the human-readable output differs.
 *     `--json` shape also follows the task surface (camelCase Bead) — for
 *     the legacy bd snake_case shape, use `bd query` (still bd-specific).
 *
 * The property test in `tests/bd-task-equivalence.property.test.ts`
 * pins repo-state equivalence between bd and task on a 100+ corpus —
 * it does NOT pin stdout shape, which is the explicit deviation.
 */

import { Command } from "@silvery/commander"
import { listTasks } from "./tasks/list.ts"
import type { BdRegistrar } from "./bd-register.ts"

export function registerBdReady(parent: BdRegistrar): void {
  const readyCmd = new Command("ready")
    .argument("[query...]", "Optional query terms (forwarded to task list)")
    .description("List ready issues (alias for `km task ready`; todo + unblocked)")
    .option("-a, --assignee <name>", "Filter by assignee")
    .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
    .option("-n, --limit <n>", "Limit number of results")
    .option(
      "--all-tasks",
      "Include inline-checkbox sub-tasks (acceptance criteria) — bd defaults to file-level beads only",
    )
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const queryParts: string[] = opts.query ?? []
      const queryStr = queryParts.length > 0 ? queryParts.join(" ") : undefined
      await listTasks(queryStr, {
        assignee: opts.assignee,
        priority: opts.priority,
        limit: opts.limit,
        json: opts.json,
        status: "todo",
        unblocked: true,
        // bd surface = bead-centric; one bead = one .md file (whether or
        // not the file also owns a child directory of nested beads).
        // The synthetic `"bead"` value matches both `mdfile` and `folder`.
        // Inline list-item checkboxes inside a bead body are acceptance
        // criteria, not separate beads. `--all-tasks` opts out for the
        // rare case where the user wants to see those checkboxes too.
        fstype: opts.allTasks ? null : "bead",
      })
    })
  parent.addCommand(readyCmd)
}

export function registerBdList(parent: BdRegistrar): void {
  const listCmd = new Command("list")
    .argument("[query...]", "Query terms (status:todo @assignee #tag) or path scope")
    .description("List issues (alias for `km task`; the bare board view)")
    .option("-s, --status <status>", "Filter by status (todo, wip, blocked, done, dropped, open=todo+wip+blocked)")
    .option("--assignee <name>", "Filter by assignee")
    .option("-p, --priority <value>", "Filter by priority (e.g. P1, P2, or 0-4)")
    .option("--blocked", "Show only blocked issues")
    .option("--unblocked", "Show only unblocked issues")
    .option("-a, --all", "Show all tasks (include done)")
    .option(
      "--all-tasks",
      "Include inline-checkbox sub-tasks (acceptance criteria) — bd defaults to file-level beads only",
    )
    .option("-n, --limit <n>", "Limit number of results")
    .option("--json", "Output as JSON")
    .actionMerged(async (opts) => {
      const queryParts: string[] = opts.query ?? []
      const queryStr = queryParts.length > 0 ? queryParts.join(" ") : undefined
      await listTasks(queryStr, {
        status: opts.status,
        priority: opts.priority,
        assignee: opts.assignee,
        all: opts.all,
        blocked: opts.blocked,
        unblocked: opts.unblocked,
        limit: opts.limit,
        json: opts.json,
        // bd surface = bead-centric; one bead = one .md file (whether or
        // not the file also owns a child directory of nested beads).
        // The synthetic `"bead"` value matches both `mdfile` and `folder`.
        // Inline list-item checkboxes inside a bead body are acceptance
        // criteria, not separate beads. `--all-tasks` opts out for the
        // rare case where the user wants to see those checkboxes too.
        fstype: opts.allTasks ? null : "bead",
      })
    })
  parent.addCommand(listCmd)
}
