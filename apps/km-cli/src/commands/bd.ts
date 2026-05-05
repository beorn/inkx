/**
 * Beads Command (bd) — thin command-registration shell.
 *
 * Each subcommand's action handler lives in its own file (per-command
 * family split — `@km/cli/bd-split-per-command`). This file is the
 * registration index: it builds the parent `bdCommand`, then attaches
 * every subcommand by calling its `register*` / `attach*` factory.
 *
 * Wave 6 of `@km/cli/task-bd-collapse`: bd is the back-compat shim
 * surface. Long-term, individual action handlers will delegate to
 * `km task` / `km` once the equivalent generic verbs land (Wave 4).
 * Until then, they share the lifecycle/scoping primitives via
 * `bd-format.ts`, `bd-scope.ts`, `bd-shared-io.ts`, etc. — no logic is
 * duplicated between the bd shell and the action modules.
 *
 * Action handler files (this index attaches them all):
 *   bd-create.ts        — `bd create`        + bd-create-plan.ts (pure planner)
 *   bd-update.ts        — `bd update`
 *   bd-close-drop.ts    — `bd close`, `bd drop`
 *   bd-claim.ts         — `bd claim`
 *   bd-list.ts          — `bd list`, `bd ready`
 *   bd-show.ts          — `bd show`
 *   bd-info.ts          — `bd info`, `bd where`
 *   bd-stale.ts         — `bd stale`
 *   bd-blocked.ts       — `bd blocked`
 *   bd-orphans.ts       — `bd orphans`       + bd-orphans-plan.ts (pure planner)
 *   bd-children.ts      — `bd children`
 *   bd-query.ts         — `bd query`
 *   bd-rename.ts        — `bd rename` (alias `move`)
 *   bd-dep.ts           — `bd dep add|remove|list`
 *   bd-config.ts        — `bd config get|set|list`
 *   bd-migrate.ts       — `bd migrate`, `bd export`
 *   bd-memory.ts        — `bd remember`, `bd memories`, `bd prime`
 *   bd-comment.ts       — `bd comment add|list`
 *   bd-doctor.ts        — `bd doctor migrate-to-beads-root`
 *   bd-agent.ts         — `bd agent ls|show|queue|assign|unassign|claim`
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
  .description("Bead tracking (beads-compatible)")
  .addHelpSection(
    "Note:",
    "Markdown tasks ARE the issues. Each scope (`km-<scope>.<slug>`) is its own board\n(file `<scope>/<slug>.md`, heading sigil `@<prefix>/<scope>`, e.g. `@km/beads`).\nSee 'km bd config' for the prefix knob, 'km bd info' for stats.",
  )
  .allowUnknownOption(false)
  .hook("preAction", () => {
    // Deprecation nudge — bd is an alias for km task. Once-per-session,
    // off in tests/CI by default. See bd-deprecation.ts for the gating.
    printBdDeprecationOnce()
  })

// Display family
registerBdReady(bdCommand)
registerBdList(bdCommand)
registerBdShow(bdCommand)
registerBdChildren(bdCommand)
registerBdBlocked(bdCommand)

// Mutation family
registerBdCreate(bdCommand)
registerBdUpdate(bdCommand)
registerBdClose(bdCommand)
registerBdDrop(bdCommand)
registerBdClaim(bdCommand)
registerBdRename(bdCommand)

// Inspection family
registerBdInfo(bdCommand)
registerBdWhere(bdCommand)
registerBdStale(bdCommand)
registerBdOrphans(bdCommand)
registerBdQuery(bdCommand)

// Graph family
bdCommand.addCommand(depCommand)

// Sub-command groups (extracted earlier; pre-existing file boundaries)
bdCommand.addCommand(configCommand)
bdCommand.addCommand(migrateCommand)
bdCommand.addCommand(exportCommand)
bdCommand.addCommand(bdAgentCommand)
attachMemoryCommands(bdCommand)
attachCommentCommands(bdCommand)
attachDoctorCommands(bdCommand)
