/**
 * Markdown Data Layer
 *
 * This module provides the canonical representation of a parsed markdown file.
 * It sits between the raw parser (km-markdown) and storage/application layers.
 *
 * Architecture:
 *   km-markdown (parser) → ProcessedMarkdown (data layer) → km-storage, km-board, etc.
 *
 * The ProcessedMarkdown type is:
 * - Independent of storage (no DB, no events)
 * - Independent of rendering (no UI concerns)
 * - A pure data structure that any layer can transform
 *
 * Usage:
 *   const file = processMarkdownFile(content, path, ino, mtime)
 *   // Transform for different use cases:
 *   const events = toNodeEvents(file, "fs-scan")       // loading path
 *   const resolved = toResolvedLinks(file, resolver)   // syncing path
 */

import { createLogger } from "loggily"
import type { Change, KNode } from "@km/core"
import { parseMarkdownWithLinks, normalizeLinkHref, type ParseResult } from "@km/markdown"
import { hashContent } from "@km/fs-mount"
import type { KLink } from "../db/links.ts"
import type { LinkResolver } from "./link-resolver.ts"

const log = createLogger("km:storage:markdown-data")

// ============================================================================
// DATA LAYER - Pure data types, no side effects
// ============================================================================

/**
 * Canonical representation of a parsed markdown file.
 * This is the data layer - it holds the parsed structure without storage concerns.
 */
export interface ProcessedMarkdown {
  /** Original file path */
  path: string
  /** Filesystem inode (for rename detection) */
  ino?: number
  /** Filesystem mtime (for change detection) */
  mtime?: number
  /** Content hash (for content-based change detection) */
  hash: string
  /** Parsed nodes (file, sections, tasks, etc.) */
  nodes: KNode[]
  /** Extracted wikilinks with source node info */
  wikilinks: WikilinkRef[]
  /** Parse warnings (if any) */
  warnings: ParseResult["warnings"]
}

/**
 * A wikilink reference extracted from markdown.
 * This is a pure data type - no resolution, just the extracted info.
 *
 * `href` is the canonical parsed locator produced by normalizeLinkHref()
 * in @km/markdown. It is always present under the Phase 2+ parser contract
 * (see docs/design/model/klink.md). Storage consumers should prefer it over the
 * raw `link.target` for name-index lookups and link-row inserts.
 */
export interface WikilinkRef {
  /** Node ID where this link appears */
  nodeId: string
  /** The link target and optional parts */
  link: {
    target: string
    section?: string
    blockId?: string
    alias?: string
    embedded?: boolean
  }
  /** Canonical href — always set by @km/markdown ≥ Phase 2. */
  href: string
  /** Relationship type (from frontmatter) */
  relationship?: string
}

/**
 * Parse a markdown file into a ProcessedMarkdown structure.
 * This is the shared parsing step - all consumers start here.
 */
export function processMarkdownFile(content: string, path: string, ino?: number, mtime?: number): ProcessedMarkdown {
  const hash = hashContent(content)
  const result = parseMarkdownWithLinks(content, path, ino, mtime)

  log.debug?.(`processed ${path}: ${result.nodes.length} nodes, ${result.wikilinks.length} links`)

  return {
    path,
    hash,
    nodes: result.nodes,
    wikilinks: result.wikilinks,
    warnings: result.warnings,
  }
}

/**
 * Convert processed markdown to node_created changes.
 * Used by the loading path for batch change application.
 */
export function toNodeEvents(processed: ProcessedMarkdown, actor: string, timestamp?: number): Change[] {
  const ts = timestamp ?? Date.now()

  return processed.nodes.map((node) => ({
    id: node.id ?? `${processed.path}:${node.md_line ?? 0}`,
    type: "node_created" as const,
    actor,
    ts,
    data: { ...node, id: node.id ?? `${processed.path}:${node.md_line ?? 0}` },
  }))
}

/**
 * Extract pending links for batch resolution.
 * Used by the loading path to collect links before batch resolve.
 */
export function toPendingLinks(processed: ProcessedMarkdown): Array<{
  nodeId: string
  link: {
    target: string
    section?: string
    blockId?: string
    alias?: string
    embedded?: boolean
  }
  relationship?: string
}> {
  return processed.wikilinks
}

/**
 * A resolved link row for insertion + an optional embed-of target id.
 *
 * Under the v4 links schema the row itself is just (host_id, href, rel).
 * We keep a sibling `embedTargetId` so callers can update the host node's
 * `embed_of` column after the link row is inserted — `embed_of` is still
 * materialized on `nodes` (see docs/design/model/klink.md "Embed nodes"). The
 * embed-target id is resolved via LinkResolver at write time and is not
 * persisted in the links table.
 */
export interface ResolvedLink extends KLink {
  /** For rel='embed' rows: the resolved target node id, or null if the
   *  target couldn't be resolved at write time. Null for rel='link' rows. */
  embedTargetId: string | null
  /** Alias override, kept so the caller can update nodes.name when
   *  materializing an embed child. Not persisted in the links table. */
  alias: string | null
}

/**
 * Resolve a single wikilink reference into a KLink row plus the
 * auxiliary embed-target info needed for `nodes.embed_of` materialization.
 *
 * Href normalization already happened in the parser (@km/markdown), so the
 * row's href comes straight from `ref.href`. For sigil-prefixed names or
 * legacy callers that haven't been through Phase 2, we re-normalize here
 * as a safety net — normalizeLinkHref is idempotent.
 */
export function resolveWikilink(ref: WikilinkRef, resolver: LinkResolver): ResolvedLink {
  const { nodeId, link } = ref

  const embedded = link.embedded ?? false
  const href = ref.href ?? computeFallbackHref(link)

  let embedTargetId: string | null = null
  if (embedded) {
    // Prefer anchor resolution (stable across content edits).
    // Anchors (`^abc`) are folded into `.name` post-v6 — see storage §2.3.
    if (link.blockId) embedTargetId = resolver.resolveBlockId(link.blockId)

    if (!embedTargetId) {
      embedTargetId = resolver.resolveTarget(link.target)
      if (embedTargetId && link.section) {
        const sectionId = resolver.resolveSection(embedTargetId, link.section)
        if (sectionId) embedTargetId = sectionId
      }
    }
  }

  return {
    host_id: nodeId,
    href,
    rel: embedded ? "embed" : "link",
    embedTargetId,
    alias: link.alias ?? null,
  }
}

/**
 * Resolve wikilinks using a LinkResolver.
 * Used by the syncing path for immediate resolution.
 */
export function toResolvedLinks(processed: ProcessedMarkdown, resolver: LinkResolver): ResolvedLink[] {
  return processed.wikilinks.map((ref) => resolveWikilink(ref, resolver))
}

/**
 * Safety net for callers (or tests) that haven't been rerouted through
 * Phase 2's parser-computed href. Mirrors the wiki-form normalization in
 * km-markdown's ast2nodes.ts.
 */
function computeFallbackHref(link: WikilinkRef["link"]): string {
  let label = link.target
  if (link.blockId) label += `^${link.blockId}`
  else if (link.section) label += `#${link.section}`
  return normalizeLinkHref("wiki", label)
}

/**
 * Get the file node from processed markdown.
 * The file node is always the first node in the array.
 */
export function getFileNode(processed: ProcessedMarkdown): KNode | undefined {
  const fileNode = processed.nodes[0]
  return fileNode?.type === "h" &&
    fileNode.item &&
    (fileNode.fstype === "file" || fileNode.fstype === "mdfile" || fileNode.fstype === "txtfile")
    ? fileNode
    : undefined
}
