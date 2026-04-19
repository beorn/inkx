/**
 * Selection — unified selection type for km-tui.
 *
 * A discriminated union that captures every selection state in km: a text
 * cursor/range, one or more selected nodes, a gap cursor between blocks, or
 * none at all. This is a projection over `@silvery/selection`'s underlying
 * `SelectionStore` — readers continue to call `sel.node.*`/`sel.text.*` while
 * writers migrate to `setSelection()`.
 *
 * Shape matches docs/design/tea.md §Triple Selection Model (fields match
 * ProseMirror's selection hierarchy adapted for km's ID-based tree).
 *
 * See bead km-all.unified-selection for migration status and
 * km-tui.sel-migration for the caller migration plan.
 */
import type { ID } from "@silvery/selection"

/** A single text position within a node. */
export interface TextPoint {
  readonly nodeId: string
  /** Character offset into the node's text (0 = start, -1 = end). */
  readonly offset: number
}

/** Cursor or range within a node's text content. */
export interface TextSelection {
  readonly type: "text"
  /** Where selection started. */
  readonly anchor: TextPoint
  /** Where selection extends to. If equal to anchor, this is a caret. */
  readonly focus: TextPoint
}

/** One or more whole nodes selected (cards, columns, blocks). */
export interface NodeSelection {
  readonly type: "node"
  /** Selected node IDs (first = cursor). Empty = no selection, use {type:"none"} instead. */
  readonly ids: readonly string[]
  /** Selection anchor for shift-extend. Defaults to first id when undefined. */
  readonly anchor?: string
}

/** Cursor between blocks where no text exists (e.g. at end of empty column). */
export interface GapSelection {
  readonly type: "gap"
  /** The node adjacent to the gap. */
  readonly nodeId: string
  /** Is the gap before or after `nodeId`. */
  readonly position: "before" | "after"
}

/** Canonical "no selection". Preferred over null/{type:"node",ids:[]}. */
export interface NoSelection {
  readonly type: "none"
}

/** The four selection states in km. */
export type Selection = TextSelection | NodeSelection | GapSelection | NoSelection

// ============================================================================
// Helpers — construct selections without remembering field names
// ============================================================================

/** Build a text caret at nodeId/offset. */
export function textCaret(nodeId: string, offset: number): TextSelection {
  const point: TextPoint = { nodeId, offset }
  return { type: "text", anchor: point, focus: point }
}

/** Build a text range from (nodeId, from) to (nodeId, to). */
export function textRange(nodeId: string, from: number, to: number): TextSelection {
  return {
    type: "text",
    anchor: { nodeId, offset: from },
    focus: { nodeId, offset: to },
  }
}

/** Build a single-node selection. */
export function nodeSelect(id: string): NodeSelection {
  return { type: "node", ids: [id], anchor: id }
}

/** Build a multi-node selection. */
export function nodesSelect(ids: readonly string[], anchor?: string): NodeSelection {
  return { type: "node", ids, anchor: anchor ?? ids[0] }
}

/** Build a gap selection. */
export function gapSelect(nodeId: string, position: "before" | "after"): GapSelection {
  return { type: "gap", nodeId, position }
}

/** The canonical empty selection. */
export const NO_SELECTION: NoSelection = { type: "none" }

// ============================================================================
// Type guards
// ============================================================================

export function isText(s: Selection): s is TextSelection {
  return s.type === "text"
}
export function isNode(s: Selection): s is NodeSelection {
  return s.type === "node"
}
export function isGap(s: Selection): s is GapSelection {
  return s.type === "gap"
}
export function isNone(s: Selection): s is NoSelection {
  return s.type === "none"
}

/** True when the selection is a text caret (anchor.offset === focus.offset). */
export function isCaret(s: Selection): s is TextSelection {
  return s.type === "text" && s.anchor.nodeId === s.focus.nodeId && s.anchor.offset === s.focus.offset
}

// ============================================================================
// Dispatch — convert Selection to @silvery/selection writer calls
// ============================================================================

/** Minimal surface needed to dispatch setSelection to @silvery/selection. */
export interface SelectionDispatch {
  /** The per-pane selection store (readers stay live). */
  readonly sel: {
    readonly node: {
      select(ids: readonly ID[], toggle?: boolean): void
    }
    readonly text: {
      edit(nodeId: ID, offset: number): void
      deselect(): void
    }
    deselect(): void
  }
}

/**
 * Single dispatcher for every selection change in km-tui. Replaces the old
 * three-channel coordination (`sel.text.edit` + `sel.node.select` + implicit
 * mode). Callers build a `Selection` value and hand it to this function; no
 * coordination is needed — the dispatcher updates all channels atomically.
 *
 * Phase 0 contract: `setSelection` is additive. Old writers (`sel.node.select`,
 * `sel.text.edit`) continue to compile and work. Migration happens one call
 * site at a time via km-tui.sel-migration.
 *
 * Two distinct "empty" dispatches:
 * - `NO_SELECTION` exits any sub-selection (text mode) but **preserves the
 *   node cursor** — historically this was `sel.text.deselect()`. Most call
 *   sites want this: "exit edit mode, don't jump the cursor."
 * - `{type: "node", ids: []}` **clears everything** (cursor + ids + sub) —
 *   historically this was `sel.node.select([])`. Empty-space clicks, logout,
 *   etc. want this stronger semantics.
 */
export function dispatchSelection(ctx: SelectionDispatch, sel: Selection): void {
  const { sel: store } = ctx
  switch (sel.type) {
    case "text": {
      // Enter text mode on anchor.nodeId. Range selections use anchor as the
      // visible cursor; focus-offset is stored as cursor (SlateJS convention).
      // @silvery/selection's text.edit ensures the node is selected first.
      store.text.edit(sel.anchor.nodeId as ID, sel.focus.offset)
      return
    }
    case "node": {
      if (sel.ids.length === 0) {
        // Stronger semantics: clear cursor + ids + sub. Used by empty-space
        // clicks and explicit "deselect all" commands.
        store.deselect()
        return
      }
      store.node.select(sel.ids as readonly ID[])
      return
    }
    case "gap": {
      // GapSelection has no @silvery/selection backing yet. For now we treat
      // it as a sub-selection exit — the gap position is a UI concern the
      // caller tracks separately. When @silvery/selection gains a gap
      // sub-kind, this dispatcher will grow a third branch.
      store.text.deselect()
      return
    }
    case "none": {
      // Exit sub-selection only. Preserves node cursor so exiting edit
      // mode doesn't lose the user's place. Use {type:"node", ids:[]}
      // for a full deselect.
      store.text.deselect()
      return
    }
  }
}
