/**
 * resolveAnchor — public link-resolution API for `[[file#section]]` targets.
 *
 * When the UI encounters a link with a fragment (heading or block ref),
 * it needs to answer: "where does this point?" — which node id, and where
 * inside the file if the file is collapsed.
 *
 * Strategy (in order):
 *
 *   1. Resolve `path` to a file/folder node via createLinkResolver.
 *      - Miss → { kind: "not-found" }
 *
 *   2. If the file is fully parsed (has children, not _collapsed), delegate
 *      to findChildByContent to find the heading node.
 *      - Hit → { kind: "parsed", nodeId, offset: undefined }
 *
 *   3. If the file is collapsed, lookup (file_id, anchor) in
 *      referenced_anchors.
 *      - Hit → { kind: "referenced-anchor", nodeId, offset }
 *      - Miss → fall through to whole-file.
 *
 *   4. Default: { kind: "whole-file", nodeId }
 *      - The UI can open the file and either scroll to top or trigger
 *        promote-and-search.
 *
 * See km-storage.collapsed-file-anchors and docs/design/model/klink.md.
 */

import type { Database } from "bun:sqlite"

import { createLinkResolver } from "../markdown/link-resolver.ts"
import { findChildByContent } from "../db/queries/wikilink-resolver.ts"
import { getReferencedAnchor } from "../db/referenced-anchors.ts"

// ============================================================================
// TYPES
// ============================================================================

export type AnchorResolutionKind =
  | "parsed" // heading exists as a child node in the fully-parsed file
  | "referenced-anchor" // collapsed file; anchor found in referenced_anchors
  | "whole-file" // target file exists; anchor not resolvable, open whole file
  | "not-found" // target file doesn't exist

export interface AnchorResolution {
  kind: AnchorResolutionKind
  /** Node id of the resolved target (the heading node for "parsed", the
   *  file node for "referenced-anchor" and "whole-file"). */
  nodeId?: string
  /** Byte offset inside the collapsed file for "referenced-anchor". */
  offset?: number
  /** For "referenced-anchor": 1-6 for headings, null for block refs. */
  headingLevel?: number | null
}

export interface ResolveAnchorInput {
  /** Path part of the link: e.g., "Project/Alpha" from `[[Project/Alpha#Plans]]`. */
  path: string
  /** Fragment part: e.g., "Plans" or "^abc123". */
  anchor: string
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Resolve an anchor reference to a target location. Deterministic single-
 * call resolution — no fallback loops, no retries.
 *
 * See module doc for the strategy table.
 */
export function resolveAnchor(db: Database, input: ResolveAnchorInput): AnchorResolution {
  const { path, anchor } = input
  if (!path || !anchor) {
    return { kind: "not-found" }
  }

  const resolver = createLinkResolver(db)
  const fileId = resolver.resolveTarget(path)
  if (!fileId) {
    return { kind: "not-found" }
  }

  // Check if the file is collapsed. We look at the `data` JSON rather than
  // computing from `parsed=0` because unparsed non-collapsed stubs still
  // resolve via the parsed strategy (their content gets parsed on demand
  // before any UI navigation).
  const meta = db.prepare("SELECT data, parsed FROM nodes WHERE id = ?").get(fileId) as
    | { data: string | null; parsed: number | null }
    | undefined

  const isCollapsed = meta?.data ? isCollapsedMarker(meta.data) : false

  if (!isCollapsed) {
    // Fully-parsed path: look up heading node by content.
    // findChildByContent handles block refs (by block_id) and headings.
    const child = findChildByContent(db, fileId, anchor)
    if (child) {
      return { kind: "parsed", nodeId: child.id }
    }
    // File exists, anchor not found → fall through to whole-file below.
    return { kind: "whole-file", nodeId: fileId }
  }

  // Collapsed path: consult referenced_anchors.
  const row = getReferencedAnchor(db, fileId, anchor)
  if (row) {
    return {
      kind: "referenced-anchor",
      nodeId: fileId,
      offset: row.source_offset,
      headingLevel: row.heading_level,
    }
  }

  // Collapsed file, anchor not in referenced_anchors. This can happen
  // legitimately: the anchor was never in our cached set (no inbound ref
  // at load time), OR the author typed a fragment that doesn't match
  // any heading. Whole-file is the safe fallback; the UI can offer a
  // "promote and search" action.
  return { kind: "whole-file", nodeId: fileId }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Cheap JSON string match for the `_collapsed` flag. The data JSON is tiny
 * (a few keys at most) and the substring approach avoids a JSON.parse in
 * the hot path.
 */
function isCollapsedMarker(dataJson: string): boolean {
  // Match `"_collapsed": true` with flexible whitespace.
  return /"_collapsed"\s*:\s*true/.test(dataJson)
}
