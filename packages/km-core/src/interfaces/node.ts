/**
 * KNode namespace — SlateJS-style static helpers for node type guards.
 *
 * The KNode interface lives in types.ts (too many fields to move).
 * We re-declare it here (declaration merging) so that a single
 * `export { KNode }` from the barrel gives consumers BOTH the interface
 * (type) and the namespace (value) — the SlateJS pattern.
 *
 * All helpers take a node-like object (not raw fields). Callers that previously
 * passed (type, item) must now pass the node directly.
 */

import type { ItemData, KNode as _KNodeInterface } from "../types.ts"

/**
 * KNode interface — re-declared for declaration merging with the const below.
 * The canonical definition with all fields is in types.ts; this declaration
 * enables `import { KNode } from "@km/core"` to provide both type + value
 * under verbatimModuleSyntax.
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare, @typescript-eslint/no-empty-object-type -- SlateJS declaration merging pattern
export interface KNode extends _KNodeInterface {}

/** Minimal node shape for type guards. */
type NodeLike = { type: string; item?: ItemData }

/** Extended node shape for embed detection. */
type EmbedLike = { embed_source?: string | null }

/** System/structural fields — never inherited on split/copy */
const SYSTEM_KEYS: ReadonlySet<string> = new Set([
  "id",
  "parent_id",
  "parent_idx", // structural
  "created_at",
  "updated_at",
  "version", // lifecycle
  "block_id", // identity
  "fs_path",
  "fs_ino",
  "fs_mtime", // filesystem (derived)
  "fstype", // derived from context via deriveFsType
  "content",
  "name",
  "title", // split by caller
  "data", // source-specific JSON blob (name, title, is_repo_root, etc.) — never inherit
])

// eslint-disable-next-line @typescript-eslint/no-redeclare -- SlateJS namespace pattern
export const KNode = {
  /** Outline item — heading item that creates outline hierarchy. */
  isOutline(node: NodeLike): boolean {
    return node.type === "h" && node.item != null
  },

  /** List item — non-heading item in body content. */
  isListItem(node: NodeLike): boolean {
    return node.type !== "h" && node.item != null
  },

  /** Any item — structural node with children (outline or list item). */
  isItem(node: NodeLike): boolean {
    return node.item != null
  },

  /** Block — leaf node (not an item). */
  isBlock(node: NodeLike): boolean {
    return node.item == null
  },

  /** Embed — node that displays content from another node via embed_source. */
  isEmbed(node: EmbedLike): boolean {
    return node.embed_source != null
  },

  /** Task — item with task data. */
  isTask(node: { item?: ItemData }): boolean {
    return node.item?.task != null
  },

  /** Check if node properties match a partial shape. */
  matches(node: NodeLike & Record<string, unknown>, props: Record<string, unknown>): boolean {
    for (const key in props) {
      if ((node as Record<string, unknown>)[key] !== props[key]) return false
    }
    return true
  },

  /**
   * Extract inheritable properties from a node (SlateJS-compatible pattern).
   * Strips system fields, returns everything else. New fields auto-inherit.
   * Task nodes get reset to unchecked (todo / [ ]).
   */
  extractProps(node: KNode): Partial<KNode> {
    const props: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(node)) {
      if (!SYSTEM_KEYS.has(key) && value != null) {
        props[key] = value
      }
    }
    // New tasks start unchecked — reset task inside item
    const item = props.item as ItemData | undefined
    if (item?.task) {
      props.item = { ...item, task: { marker: "[ ]", status: "todo" } }
    }
    return props as Partial<KNode>
  },
} as const
