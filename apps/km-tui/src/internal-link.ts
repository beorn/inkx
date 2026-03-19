/**
 * Internal Link Resolution — Parse km:// URLs and resolve to node IDs.
 *
 * Supports three URL schemes:
 * - km://node/{id}  — direct node ID reference
 * - km://wiki/{name} — wiki link (resolve by name, then by ID)
 * - km://block/{id}  — block reference (resolve by node ID)
 *
 * Pure functions with no React/store dependencies — easy to test.
 */

import type { KNode } from "@km/core"

// =============================================================================
// Types
// =============================================================================

export type KmLinkType = "node" | "wiki" | "block"

export interface ParsedKmLink {
  type: KmLinkType
  /** The decoded value from the URL path segment */
  value: string
}

/** Minimal repo interface for link resolution */
export interface LinkRepo {
  getNode(id: string): KNode | null
  resolveByName?(name: string): KNode | null
}

// =============================================================================
// URL Parsing
// =============================================================================

/** URL pattern: km://{type}/{value} */
const KM_URL_RE = /^km:\/\/(node|wiki|block)\/(.+)$/

/**
 * Parse a km:// URL into its type and value.
 * Returns null if the URL doesn't match the expected format.
 */
export function parseKmUrl(href: string): ParsedKmLink | null {
  const match = href.match(KM_URL_RE)
  if (!match?.[1] || !match[2]) return null
  return {
    type: match[1] as KmLinkType,
    value: decodeURIComponent(match[2]),
  }
}

// =============================================================================
// Node Resolution
// =============================================================================

/**
 * Resolve a parsed km:// link to a target node ID.
 *
 * Resolution strategy by type:
 * - node: direct ID lookup
 * - wiki: resolveByName → getNode (name might be an ID) → strip ^ prefix
 * - block: direct ID lookup
 *
 * Returns null if the target node cannot be found.
 */
export function resolveKmLink(link: ParsedKmLink, repo: LinkRepo): string | null {
  switch (link.type) {
    case "node":
      return repo.getNode(link.value) ? link.value : null

    case "wiki": {
      // Wiki links use the same resolution as InlineWikiLink / resolveWikiLink:
      // 1. Try resolveByName (file name match)
      // 2. Try getNode (target might be a node ID)
      // 3. Try stripping ^ prefix (blockref-style wiki link: [[^ID]])
      const byName = repo.resolveByName?.(link.value)
      if (byName) return byName.id

      const byId = repo.getNode(link.value)
      if (byId) return byId.id

      if (link.value.startsWith("^")) {
        const strippedId = link.value.slice(1)
        const byStripped = repo.getNode(strippedId)
        if (byStripped) return byStripped.id
      }

      return null
    }

    case "block":
      return repo.getNode(link.value) ? link.value : null
  }
}
