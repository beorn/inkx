/**
 * Embed display resolution — pure functions for resolving embed nodes to
 * human-readable display text. Extracted from TreeNode.tsx for reuse
 * across search, CLI, detail pane, and tests.
 */

import { KNode } from "@km/core"
import { getNodeDisplayName as getNodeDisplayNameBase } from "@km/tree"

/** Minimal repo interface for embed resolution (subset of full Repo). */
export interface EmbedRepo {
  getNode(id: string): KNode | null | undefined
  getChildren(parentId: string | null): KNode[]
  resolveByName?(name: string): KNode | null
  resolveNode?(query: string): KNode | null
}

/** Bound version of getNodeDisplayNameBase that injects repo.getChildren */
function getNodeDisplayName(repo: EmbedRepo, node: KNode): string {
  return getNodeDisplayNameBase(node, (id) => repo.getChildren(id))
}

/** Regex to extract target name from ![[target]] or ![[target|alias]] markdown embed syntax. */
export const WIKI_EMBED_RE = /^!\[\[([^\]|]+)(?:\|[^\]]+)?\]\]$/

/** Result of resolving an embed node to its target. */
export interface EmbedResolution {
  isEmbedded: boolean
  resolvedNode: KNode | null
  displayNode: KNode
  isBrokenEmbed: boolean
}

/** Resolve embed_of to target node and display node. */
export function resolveEmbed(repo: EmbedRepo, node: KNode): EmbedResolution {
  const embedTarget = node.embed_of
  const isEmbedded = embedTarget != null
  const resolvedNode = isEmbedded && embedTarget ? (repo.getNode(embedTarget) ?? null) : null
  const displayNode = resolvedNode ?? node
  const isBrokenEmbed = isEmbedded && !resolvedNode
  return { isEmbedded, resolvedNode, displayNode, isBrokenEmbed }
}

/**
 * Clean an embed reference path for display.
 * Strips block-ID syntax (^blockid) and file#fragment separators to produce
 * a human-readable label. For bare block references (^12345), returns empty
 * string so the caller can fall through to getNodeDisplayName.
 */
export function cleanEmbedRef(ref: string): string {
  // Bare block reference: "^1203128650780856" → empty (use display name fallback)
  if (/^\^[\w-]+$/.test(ref)) return ""
  // File#^blockid: "shopping#^abc123" → "shopping"
  // File#section: "shopping#Groceries" → "shopping > Groceries"
  const hashIdx = ref.indexOf("#")
  if (hashIdx >= 0) {
    const file = ref.slice(0, hashIdx)
    const fragment = ref.slice(hashIdx + 1)
    // Block ref fragment (^abc) — just show the file name
    if (fragment.startsWith("^")) return file || ""
    // Section fragment — show file > section
    return file && fragment ? `${file} > ${fragment}` : file || fragment || ""
  }
  return ref
}

/** Clean content for display, preserving multi-line structure.
 * Metadata stripping (fields, block refs) is handled by the inline AST
 * system via InlineRenderContext.hideFields. */
export function cleanContentForDisplay(content: string | undefined): string {
  if (!content) return ""
  return (
    content
      // Strip Asana-style "#@mention" tag syntax — the "#" is an orphan prefix
      // that doesn't form a valid sigil with the following "@". Strip it before
      // further processing so it doesn't leave trailing "#" characters.
      .replace(/#@/g, "@")
      // Strip inline markdown embed wikilinks ![[target]] and ![[target|alias]] —
      // replace with alias or target name so raw ![[  never leaks to display.
      // The inline parser (InlineText) also handles this, but stripping here
      // provides defense-in-depth for any code path that uses the returned
      // string without going through InlineText (e.g., search, top bar, CLI).
      .replace(/!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias ?? target)
  )
}

/** Try to resolve an embed reference (block_id or filename) to a human-readable title.
 * Only returns a result if the resolved node has real content (not itself an embed). */
export function tryResolveEmbedRef(repo: EmbedRepo, ref: string): string | null {
  if (!repo.resolveByName && !repo.resolveNode) return null

  const resolveAndFormat = (query: string): string | null => {
    // Use fast name index first, fall back to getNode (by ID), then resolveNode
    const target = repo.resolveByName?.(query) ?? repo.getNode(query) ?? null
    if (!target) return null
    const content = cleanContentForDisplay(target.content)
    // Guard: don't return content that's itself a wiki-embed reference
    if (!content || WIKI_EMBED_RE.test(content)) return null
    return content
  }

  // Bare block ref "^blockid" → extract blockid and look up
  const blockMatch = ref.match(/^\^([\w-]+)$/)
  if (blockMatch?.[1] != null) return resolveAndFormat(blockMatch[1])

  // file#^blockid → extract blockid part
  const hashIdx = ref.indexOf("#")
  if (hashIdx >= 0) {
    const fragment = ref.slice(hashIdx + 1)
    if (fragment.startsWith("^")) return resolveAndFormat(fragment.slice(1))
  }

  // Plain filename — try resolving
  return resolveAndFormat(ref)
}

/** Resolve what text to display for a node, handling embeds and section types. */
export function getDisplayContent(
  repo: EmbedRepo,
  node: KNode,
  displayNode: KNode,
  resolvedNode: KNode | null,
  isEmbedded: boolean,
): string {
  // Embed display resolution (see docs/design/km-ast/model.md):
  //   1. node.content non-empty & not wiki-embed syntax → alias override (show instead of target title)
  //   2. resolvedNode exists → show target's content/display name
  //   3. Neither → broken link (rendered red via isBrokenEmbed flag in TreeNode)
  if (isEmbedded) {
    // Alias override: non-empty content on the embed node overrides the target's title.
    // This is the ![[^GID|My overridden title]] semantic — content IS the alias.
    // Alias survives even if the target link is broken.
    const alias = node.content ? cleanContentForDisplay(node.content) : ""
    if (alias && node.content && !WIKI_EMBED_RE.test(node.content)) return alias
    if (resolvedNode) {
      // Resolved embed — show target's display name/content
      if (KNode.isOutline(resolvedNode) && resolvedNode.fstype === "folder") {
        return getNodeDisplayName(repo, resolvedNode) + "/"
      }
      if (KNode.isOutline(resolvedNode) && resolvedNode.fstype === "mdsection") {
        return getNodeDisplayName(repo, resolvedNode)
      }
      return cleanContentForDisplay(resolvedNode.content) || getNodeDisplayName(repo, resolvedNode)
    }
    // Broken embed: embed_of is set but target node doesn't exist.
    // Try to resolve via embed_of (may contain file#^blockId format).
    const src = node.embed_of ?? ""
    const resolved = tryResolveEmbedRef(repo, src)
    if (resolved) return resolved
    // Clean block-ID references (^blockid) so they don't show raw IDs
    const cleaned = cleanEmbedRef(src)
    if (cleaned) return cleaned
    // Bare block ref (^id) or empty — show broken link fallback with short ID
    return `(broken: ^${src.slice(-8) || node.id.slice(-8)})`
  }
  if (KNode.isOutline(displayNode) && displayNode.fstype === "mdsection") {
    const name = getNodeDisplayName(repo, displayNode)
    // Untitled sections (empty Asana sections) get empty string from getNodeDisplayName.
    // Replace with a human-readable label so the section is visually identifiable.
    if (!name) return "(untitled section)"
    return name
  }
  // Bare block references (e.g., "^1153379636232754" — Asana recurring task instances).
  // These are regular li nodes whose content is just a numeric block ref.
  // Show a human-readable label instead of the raw ID.
  const stripped = cleanContentForDisplay(displayNode.content)
  if (/^\^[\d]+$/.test(stripped.trim())) {
    // If the node has a embed_of, resolve to target's display name
    const nodeEmbedTarget = node.embed_of
    if (nodeEmbedTarget) {
      const target = repo.getNode(nodeEmbedTarget)
      if (target) return getNodeDisplayName(repo, target)
    }
    // If Asana parent name is available in data, show that
    const parentName = displayNode.data?.asana_parent_name
    if (typeof parentName === "string" && parentName) return parentName
    // Fallback: truncated reference
    const refId = stripped.trim().slice(1) // remove ^
    return `(ref:${refId.slice(0, 6)}...)`
  }
  return stripped || getNodeDisplayName(repo, displayNode)
}
