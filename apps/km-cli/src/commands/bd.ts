/**
 * Beads Command (bd) — Wave 6 thin alias layer.
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: bd is a back-compat shim that
 * delegates in-process to `km task` / `km <verb>`. The action handlers
 * in each `bd-<verb>.ts` register the commander surface (so `bd close
 * --help` still works and the print-once deprecation notice fires),
 * then call the canonical task / km action handler directly. No
 * duplicated lifecycle / mutation logic.
 *
 * Canonical alias mapping (per the bead's design):
 *
 *   const BD_ALIASES: Record<string, string[]> = {
 *     // Task-domain verbs → km task subcommand
 *     ready:    ["task", "ready"],
 *     list:     ["task"],
 *     show:     ["task", "show"],
 *     create:   ["task", "new"],     // (kept legacy — see deviations)
 *     update:   ["task", "set"],     // (kept legacy — see deviations)
 *     close:    ["task", "close"],
 *     drop:     ["task", "drop"],
 *     claim:    ["task", "claim"],
 *     dep:      ["task", "dep"],
 *     orphans:  ["task", "orphans"], // (kept legacy — see deviations)
 *     blocked:  ["task", "blocked"],
 *
 *     // Generic verbs → top-level km
 *     stale:    ["stale"],            // km stale (any node)
 *     children: ["show", "-c"],       // km show <id> -c
 *     query:    ["list", "--raw"],    // km list --raw <dsl>
 *     rename:   ["move"],             // km move (kept legacy — see deviations)
 *   }
 *
 * Wave 4/5/6-gap deviations from the alias-table ideal (documented;
 * not silently broken). Each gap is a verb where the canonical
 * task/km surface doesn't yet have full feature parity, so the bd
 * shim retains its own implementation:
 *
 *   - bd create   — file materialization + bd-form parent resolution.
 *                   `task new` doesn't materialize files. Resolved when
 *                   `task new --path/--id` ships file materialization.
 *   - bd update   — `--description`/`--notes` mutate child paragraphs;
 *                   `--parent` does sibling-tree relocation; `--priority`
 *                   rewrites the H1 hashtag. None of those land in
 *                   `task set` today (it's a pure field-mutation surface).
 *   - bd rename   — full path-form id-rewrite via `moveNodeWithRefs(id,
 *                   {newCanonicalId})`, plus `--include-prose` and
 *                   `--dry-run`. `km move` is reparent-only today; full
 *                   id-rewrite is the `@km/storage/move-with-rewrite-refs`
 *                   work-in-flight.
 *   - bd orphans  — `task orphans` doesn't exist. The git-log scanner
 *                   lives in `bd-orphans-plan.ts` and ships only here.
 *                   Promotable to `task orphans` in a future wave.
 *   - bd children — `Bead.children` walks BOTH the structural parent_id
 *                   children AND the path-form sibling-folder children
 *                   (`@km/scope/foo.md` ↔ `@km/scope/foo/`). `km show
 *                   <id> -c` is structural-parent_id only — it misses
 *                   sibling-file children. Until `km show -c` learns
 *                   the path-form hierarchy, bd-children stays legacy.
 *   - bd dep      — `--dry-run` flag preserved (task dep ships --dry-run
 *                   in Wave 7). The non-dry-run write paths produce
 *                   identical repo state to `task dep` (pinned by the
 *                   L5 property test).
 *   - bd info     — diagnostic + statistics output. `km doctor` doesn't
 *                   yet produce equivalent stats; the redirect target
 *                   doesn't exist, so legacy bd-info stays.
 *   - bd where    — bd-config inspection. `km config bd.*` doesn't
 *                   exist; legacy stays.
 *   - bd migrate  — bd→km vault migration. `km import bd` doesn't
 *                   exist; legacy stays.
 *
 * Once-per-session deprecation notice fires on first bd invocation —
 * see `bd-deprecation.ts`.
 */

import { Command } from "@silvery/commander"

import { configCommand } from "./bd-config.ts"
import { migrateCommand, exportCommand } from "./bd-migrate.ts"
import { attachMemoryCommands } from "./bd-memory.ts"
import { attachCommentCommands } from "./bd-comment.ts"
import { attachDoctorCommands } from "./bd-doctor.ts"
import { bdAgentCommand } from "./bd-agent.ts"
import { depCommand } from "./bd-dep.ts"

import { registerBdCreate } from "./bd-create.ts"
import { registerBdUpdate } from "./bd-update.ts"
import { registerBdClose, registerBdDrop } from "./bd-close-drop.ts"
import { registerBdClaim } from "./bd-claim.ts"
import { registerBdList, registerBdReady } from "./bd-list.ts"
import { registerBdShow } from "./bd-show.ts"
import { registerBdInfo, registerBdWhere } from "./bd-info.ts"
import { registerBdStale } from "./bd-stale.ts"
import { registerBdBlocked } from "./bd-blocked.ts"
import { registerBdOrphans } from "./bd-orphans.ts"
import { registerBdChildren } from "./bd-children.ts"
import { registerBdQuery } from "./bd-query.ts"
import { registerBdRename } from "./bd-rename.ts"

import { printBdDeprecationOnce } from "./bd-deprecation.ts"

export const bdCommand = new Command("bd")
  .description("Bead tracking — back-compat alias for `km task` / `km <verb>` (Wave 6)")
  .addHelpSection(
    "Note:",
    "`bd` is an alias for `km task`. Each subcommand delegates to its task / km equivalent.\n" +
      "See `km bd config` for the prefix knob; the canonical surface is `km task` / `km <verb>`.",
  )
  .allowUnknownOption(false)
  .hook("preAction", () => {
    // Deprecation nudge — bd is an alias for km task. Once-per-session,
    // off in tests/CI by default. See bd-deprecation.ts for the gating.
    printBdDeprecationOnce()
  })

// Display family — alias shims (delegate to km task / km <verb>);
// children kept legacy (Wave 6 gap: km show -c doesn't walk path-form sibs)
registerBdReady(bdCommand)
registerBdList(bdCommand)
registerBdShow(bdCommand)
registerBdChildren(bdCommand)
registerBdBlocked(bdCommand)

// Mutation family — close/drop/claim are alias shims; create/update/rename
// keep legacy code (Wave 4/6 gaps documented above).
registerBdCreate(bdCommand)
registerBdUpdate(bdCommand)
registerBdClose(bdCommand)
registerBdDrop(bdCommand)
registerBdClaim(bdCommand)
registerBdRename(bdCommand)

// Inspection family — stale/query are alias shims; info/where/orphans
// keep legacy code (Wave 6 gaps).
registerBdInfo(bdCommand)
registerBdWhere(bdCommand)
registerBdStale(bdCommand)
registerBdOrphans(bdCommand)
registerBdQuery(bdCommand)

// Graph family — kept legacy (Wave 6 gap: task dep lacks --dry-run)
bdCommand.addCommand(depCommand)

// Sub-command groups (out of Wave 6 scope; pre-existing file boundaries)
bdCommand.addCommand(configCommand)
bdCommand.addCommand(migrateCommand)
bdCommand.addCommand(exportCommand)
bdCommand.addCommand(bdAgentCommand)
attachMemoryCommands(bdCommand)
attachCommentCommands(bdCommand)
attachDoctorCommands(bdCommand)
