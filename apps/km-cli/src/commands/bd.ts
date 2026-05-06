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
 *     create:   ["task", "new"],
 *     update:   ["task", "set"],
 *     close:    ["task", "close"],
 *     drop:     ["task", "drop"],
 *     claim:    ["task", "claim"],
 *     dep:      ["task", "dep"],
 *     orphans:  ["task", "orphans"],
 *     blocked:  ["task", "blocked"],
 *
 *     // Generic verbs → top-level km
 *     stale:    ["stale"],            // km stale (any node)
 *     children: ["show", "-c"],       // km show <id> -c
 *     query:    ["list", "--raw"],    // km list --raw <dsl>
 *     rename:   ["move"],             // km move (polymorphic dispatch)
 *   }
 *
 * Post-Wave-6-final state (`@km/cli/bd-shim-collapse-final`): every
 * delegated verb is a pure thin shim. The lifts that landed in this
 * wave:
 *
 *   - `task new --id @<path>` materializes a file (was bd-create only).
 *   - `task new --description` / `--notes` accept body text (was bd-create only).
 *   - `task orphans` exists (lifted from bd-orphans).
 *   - `task dep add|rm --dry-run` exists (was bd-dep only).
 *   - `km move` polymorphically routes path-form targets to rename mode
 *     (was bd-rename only).
 *
 * Out-of-scope subcommands stay as their own implementations:
 *   bd config / bd migrate / bd export — bd-specific tooling
 *   bd memory / bd comment / bd agent — bd-specific surfaces
 *   bd info / bd where — `km doctor` / `km config bd.*` redirects pending
 *
 * `bd` remains a first-class user-facing surface alongside `km task` /
 * `km <verb>`. Both are valid; the alias layer keeps them behaviourally
 * identical (pinned by `tests/bd-task-equivalence.property.test.ts`).
 */

import { Command } from "@silvery/commander"

import { configCommand } from "./bd-config.ts"
import { migrateCommand, exportCommand } from "./bd-migrate.ts"
import { attachMemoryCommands } from "./bd-memory.ts"
import { attachCommentCommands } from "./bd-comment.ts"
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

export const bdCommand = new Command("bd")
  .description("Bead tracking — `km task` / `km <verb>` aliased through bd-style argv")
  .addHelpSection(
    "Note:",
    "`bd` and `km task` share semantics by construction: each bd subcommand delegates to its\n" +
      "task / km equivalent. Use whichever feels right; `bd config` owns the issue-prefix knob.",
  )
  .allowUnknownOption(false)

// Display family — alias shims that delegate to km task / km <verb>.
// children kept legacy: Bead.children walks path-form sibling-folder
// children (`@km/scope/foo.md` ↔ `@km/scope/foo/`); km show -c doesn't.
registerBdReady(bdCommand)
registerBdList(bdCommand)
registerBdShow(bdCommand)
registerBdChildren(bdCommand)
registerBdBlocked(bdCommand)

// Mutation family — all thin alias shims after Wave 6 final.
registerBdCreate(bdCommand)
registerBdUpdate(bdCommand)
registerBdClose(bdCommand)
registerBdDrop(bdCommand)
registerBdClaim(bdCommand)
registerBdRename(bdCommand)

// Inspection family — all thin alias shims; info/where own bd-specific
// diagnostic surfaces (km doctor / km config bd.* redirects pending).
registerBdInfo(bdCommand)
registerBdWhere(bdCommand)
registerBdStale(bdCommand)
registerBdOrphans(bdCommand)
registerBdQuery(bdCommand)

// Graph family — bd dep is a thin re-export of `task dep` after the
// --dry-run lift in this wave.
bdCommand.addCommand(depCommand)

// Sub-command groups (out of Wave 6 scope; pre-existing file boundaries)
bdCommand.addCommand(configCommand)
bdCommand.addCommand(migrateCommand)
bdCommand.addCommand(exportCommand)
bdCommand.addCommand(bdAgentCommand)
attachMemoryCommands(bdCommand)
attachCommentCommands(bdCommand)
