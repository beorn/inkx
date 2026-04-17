/**
 * Omnibox-specific commands.
 *
 * The `default` command is the universal Enter-fallback for the unified
 * omnibox. When a user opens the omnibox without a specific verb chord
 * (`cmd-k`, `cmd-f`), defaultCommand starts at `"default"` — which dispatches
 * based on the target node type.
 *
 * For v1: node target → `CURSOR_TO` (goto). The omnibox confirm handler
 * strips the `node:` / `cmd:` namespace prefix from selectedArgumentId
 * before calling executeCommand, so by the time `default.execute` runs,
 * `ctx.targetId` holds the raw node ID.
 *
 * Future (post-v1): per-node-type customization — tags → filter, projects
 * → zoom, etc. Live fully inside `default.execute()` with zero UI work.
 *
 * The canonical open entry point for the unified omnibox is `command_palette`
 * (navigation.ts) — bound to Cmd+K, Ctrl+K, and `:`.
 *
 * ## Subject-action commands (km-tui.itempicker-unify)
 *
 * The three commands below (`omnibox.append_tag_to_subject`,
 * `omnibox.set_assignee_on_subject`, `omnibox.split_and_reparent`) are the
 * unified-omnibox replacements for the legacy `SET_LABEL`, `SET_ASSIGNEE`,
 * and `PANE_SPLIT_AND_PICK` flows that used to raise `ItemPicker`. They
 * operate on the frozen subject (anchor-pane cursor at open time) and take
 * their target text / id from `ctx.targetId`.
 *
 * The TUI's `runSelection` wires `ctx.targetId`:
 *   - For tag / assignee commands: the sigil-stripped buffer OR the picked
 *     candidate's title, whichever is present. That's the raw tag/assignee
 *     text (without leading `#`/`@`).
 *   - For `omnibox.split_and_reparent`: the picked node's id (same as
 *     `move`).
 */
import type { CommandDef, KmOp } from "../types.ts"

const defaultCommand = {
  id: "default",
  name: "Default action",
  shortLabel: "default",
  description: "Type-dispatched fallback: on a node → go to it",
  category: "Navigation",
  execute: (ctx) => {
    const target = ctx.targetId
    if (!target) return null
    // v1: always goto. Post-v1: switch(nodeType) { case "tag": … }
    return { type: "CURSOR_TO", locationKey: target }
  },
} satisfies CommandDef

/**
 * Append a `#tag` to the subject node's content.
 *
 * `ctx.targetId` holds the raw tag text (no leading `#`) — sourced by the
 * TUI's `runSelection` from the buffer or the picked candidate. The subject
 * is the omnibox's frozen `currentNodeId`.
 */
const appendTagToSubject = {
  id: "omnibox.append_tag_to_subject",
  name: "Add tag to current node",
  shortLabel: "add tag",
  description: "Append a #tag to the subject node's content",
  category: "Edit",
  execute: (ctx): KmOp | null => {
    const nodeId = ctx.currentNodeId
    const raw = ctx.targetId
    if (!nodeId || !raw) return null
    // Strip any leading `#` — APPEND_TAG carries the bare tag text; the
    // handler re-adds the sigil when writing.
    const tag = raw.startsWith("#") ? raw.slice(1) : raw
    if (!tag) return null
    return { type: "APPEND_TAG", nodeId, tag }
  },
} satisfies CommandDef

/**
 * Set `assigned_to` on the subject node.
 *
 * `ctx.targetId` holds the raw assignee text (no leading `@`) — sourced
 * by the TUI's `runSelection` from the buffer or the picked candidate.
 */
const setAssigneeOnSubject = {
  id: "omnibox.set_assignee_on_subject",
  name: "Set assignee on current node",
  shortLabel: "set assignee",
  description: "Write assigned_to on the subject node",
  category: "Edit",
  execute: (ctx): KmOp | null => {
    const nodeId = ctx.currentNodeId
    const raw = ctx.targetId
    if (!nodeId || !raw) return null
    const assignee = raw.startsWith("@") ? raw.slice(1) : raw
    if (!assignee) return null
    return { type: "SET_ASSIGNEE_VALUE", nodeId, assignee }
  },
} satisfies CommandDef

/**
 * Reparent the subject under a picked project. Paired with an explicit
 * pane split by the op handler (PANE_SPLIT_AND_PICK) — the split happens
 * first, the omnibox opens in the newly-split pane pre-seeded with `+`,
 * and Enter dispatches this command with `ctx.targetId` = picked node id.
 *
 * Reuses the existing `REPARENT_TO` location-key semantics: passing a raw
 * node id works because `resolveLocationKey` resolves IDs via `repo.getNode`.
 */
const splitAndReparent = {
  id: "omnibox.split_and_reparent",
  name: "Move to project (split pane)",
  shortLabel: "move (split)",
  description: "Reparent subject under the picked project",
  category: "Edit",
  execute: (ctx): KmOp | null => {
    const target = ctx.targetId
    if (!target) return null
    return { type: "REPARENT_TO", locationKey: target }
  },
} satisfies CommandDef

export const omniboxCommands: CommandDef[] = [
  defaultCommand,
  appendTagToSubject,
  setAssigneeOnSubject,
  splitAndReparent,
]
