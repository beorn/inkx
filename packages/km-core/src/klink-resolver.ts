/**
 * KLinkResolver — resolve a parsed KLinkRef to a target, via a name index.
 *
 * Resolution is runtime state (a node might exist today but not yesterday),
 * so it lives here as a factory that closes over the name index and a host
 * node id. Callers consume the tagged union `KResolution`; they never query
 * the name index directly.
 *
 * See docs/design/model/klink.md for the render/interaction contract.
 */

import type { KAnchor, KLinkRef } from "./klink-ref.ts"

/**
 * Lookup of lowercased hierarchical name → node ids. A single name may map
 * to multiple ids (ambiguity). Built once at startup, maintained O(1) on
 * node create/rename/delete.
 */
export type NameIndex = ReadonlyMap<string, readonly string[]>

export type KResolution =
  | { kind: "external"; url: URL }
  | { kind: "self"; host: string; anchor: KAnchor | null }
  | { kind: "resolved"; target: string; anchor: KAnchor | null }
  | { kind: "ambiguous"; targets: readonly string[]; anchor: KAnchor | null }
  | { kind: "broken"; name: string }

export type KLinkResolver = {
  resolve(ref: KLinkRef): KResolution
}

/**
 * Build a resolver bound to a name index and a host node.
 *
 * - `nameIndex` keys must be lowercased hierarchical names.
 * - `hostId` is the id of the node that owns the link being resolved. Used
 *   to answer self-refs. Pass `null` if the call site has no host (e.g.,
 *   index-time bulk checks) — self-refs then return `broken`.
 */
export function createLinkResolver(nameIndex: NameIndex, hostId: string | null): KLinkResolver {
  return {
    resolve(ref) {
      if (ref.isExternal) {
        if (ref.external === null) {
          throw new Error("createLinkResolver.resolve: external ref missing URL")
        }
        return { kind: "external", url: ref.external }
      }

      if (ref.isSelfRef) {
        if (hostId === null) {
          return { kind: "broken", name: ref.fragment ?? "" }
        }
        return { kind: "self", host: hostId, anchor: ref.anchor }
      }

      if (ref.isKm) {
        // Empty name + km scheme is malformed; parseLinkHref rejects it,
        // but guard defensively.
        if (ref.name.length === 0) {
          return { kind: "broken", name: "" }
        }
        const targets = nameIndex.get(ref.name) ?? []
        if (targets.length === 0) {
          return { kind: "broken", name: ref.displayName }
        }
        const first = targets[0]
        if (targets.length === 1 && first !== undefined) {
          return { kind: "resolved", target: first, anchor: ref.anchor }
        }
        return { kind: "ambiguous", targets, anchor: ref.anchor }
      }

      // Unreached — parseLinkHref classifies every href into one of the above.
      throw new Error(`createLinkResolver.resolve: unknown ref shape scheme=${ref.scheme}`)
    },
  }
}
