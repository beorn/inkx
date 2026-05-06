/**
 * Beads Command (bd) — migration on-ramp for users coming from the
 * standalone `bd` issue tracker.
 *
 * `km bd <verb>` is a first-class surface, NOT a deprecated shim. The
 * intent is the migration path:
 *
 *   1. `km import bd <vault>` — bring bd data into a km vault
 *   2. Use `km bd <verb>` in place of `bd <verb>` (same UX, no muscle-
 *      memory cost)
 *   3. Gradually adopt `km <verb>` / `km task <verb>` for new work
 *   4. `km bd` retires post-v2 once adoption is mature
 *
 * Where `km bd` and `km` share semantics, the engine lives in `@km/*`
 * packages and `km bd` is a translation layer above. The L5 invariant
 * is `tests/bd-task-equivalence.property.test.ts`, which pins
 * repo-state equivalence on the verbs that share semantics.
 *
 * Canonical alias mapping for shared-semantic verbs (per the parent
 * epic `@km/cli/task-bd-collapse`):
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
 * Most delegated verbs are thin alias shims (`bd-<verb>.ts` registers
 * the commander surface, then calls the canonical task/km action).
 * `bd-create`/`bd-update`/`bd-rename`/`bd-children` keep richer
 * bd-specific UX (path-form ids, --description/--notes, --include-prose,
 * sibling-folder walk) — that's the legitimate cost of being bd-compatible.
 *
 * bd-only subcommands (no km equivalent today):
 *   bd config — issue-prefix knob, bd-specific tooling
 *   bd memory / bd comment / bd agent — bd-specific surfaces
 *   bd info (with --paths flag) — config + statistics + paths
 *
 * Migration / export to .beads/issues.jsonl lives at `km import bd <vault>`
 * (with `--export` for the reverse direction); no longer mounted under `bd`.
 * `bd doctor` was retired (one-shot vault-layout migration; deleted in
 * `@km/cli/bd-doctor-retire`).
 */

import { Command } from "@silvery/commander"

import { configCommand } from "./bd-config.ts"
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
import { registerBdInfo } from "./bd-info.ts"
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
  .addHelpSection(
    "Import:",
    "Migrate bd issues into a km vault: `km import bd <vault>`\n" +
      "Export km issues back to .beads/issues.jsonl: `km import bd --export <vault>`",
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

// Inspection family — all thin alias shims; info owns the bd-specific
// diagnostic surface (km doctor / km config bd.* redirects pending).
// `bd info --paths` replaces the historical `bd where` (merged in
// @km/cli/bd-where-merge-into-info).
registerBdInfo(bdCommand)
registerBdStale(bdCommand)
registerBdOrphans(bdCommand)
registerBdQuery(bdCommand)

// Graph family — bd dep is a thin re-export of `task dep` after the
// --dry-run lift in this wave.
bdCommand.addCommand(depCommand)

// Sub-command groups (out of Wave 6 scope; pre-existing file boundaries)
bdCommand.addCommand(configCommand)
bdCommand.addCommand(bdAgentCommand)
attachMemoryCommands(bdCommand)
attachCommentCommands(bdCommand)
