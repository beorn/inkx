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
import type { Event, KNode } from "@km/core"
import { parseMarkdownWithLinks, type ParseResult } from "@km/markdown"
import { hashContent } from "../fs/cas.ts"
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
 * Convert processed markdown to node_created events.
 * Used by the loading path for batch event application.
 */
export function toNodeEvents(processed: ProcessedMarkdown, actor: string, timestamp?: number): Event[] {
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
 * Resolved link ready for database insertion.
 */
export interface ResolvedLink {
  source_id: string
  target_name: string
  target_id: string | null
  section: string | null
  block_id: string | null
  alias: string | null
  embedded: boolean
  relationship: string | null
}

/**
 * Resolve a single wikilink reference using a LinkResolver.
 */
export function resolveWikilink(ref: WikilinkRef, resolver: LinkResolver): ResolvedLink {
  const { nodeId, link, relationship } = ref

  let targetId: string | null = null

  // Prefer block_id resolution (stable across content edits)
  if (link.blockId) {
    targetId = resolver.resolveBlockId(link.blockId)
  }

  if (!targetId) {
    targetId = resolver.resolveTarget(link.target)
    if (targetId && link.section) {
      const sectionId = resolver.resolveSection(targetId, link.section)
      if (sectionId) {
        targetId = sectionId
      }
    }
  }

  return {
    source_id: nodeId,
    target_name: link.target,
    target_id: targetId,
    section: link.section ?? null,
    block_id: link.blockId ?? null,
    alias: link.alias ?? null,
    embedded: link.embedded ?? false,
    relationship: relationship ?? null,
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
