/**
 * km: URI parser — federation variant.
 *
 * See hub/km/storage-architecture.md §5.2.
 *
 * Two shapes exist on the km wire:
 *
 *   (1) self / same-repo  — `km:<name>[#<fragment>]`
 *       Parsed by `parseLinkHref` in `@km/core/klink-ref`.
 *       Example: `km:foo/bar#^abc`
 *
 *   (2) cross-repo         — `km:/<alias>/<rest>[#<fragment>]`
 *       Parsed HERE. The leading `/` immediately after the scheme is the
 *       cross-repo sigil. `<alias>` resolves through a Workspace (see
 *       `workspace.ts`) to a mounted repo; `<rest>` is a repo-relative
 *       path.
 *       Example: `km:/vault/notes/foo.md#^abc`
 *
 * This file covers ONLY shape (2) + the delegate flag for shape (1). It does
 * not duplicate `parseLinkHref` — callers that only care about shape (1) must
 * continue to use `parseLinkHref`. Callers that need to distinguish the two
 * call `parseKmUri` first; on a `km-self` result they hand the original
 * string off to `parseLinkHref`.
 */

/**
 * The two parses `parseKmUri` can produce. `null` means "not a km: URI at all"
 * (external URL, self-ref `#frag`, plain text — the caller should route it
 * elsewhere).
 */
export type ParsedKmUri =
  | { kind: "km-uri"; alias: string; relPath: string; fragment: string | null }
  | { kind: "km-self"; relPath: string; fragment: string | null }

/**
 * Parse a `km:` URI. Returns null for non-km inputs or malformed km: URIs —
 * never throws. Shape detection is deterministic:
 *
 *   `km:/<alias>/<rest>` → kind="km-uri"    (cross-repo, alias resolves via Workspace)
 *   `km:/<alias>`        → kind="km-uri"    (alias only, empty relPath)
 *   `km:<name>...`       → kind="km-self"   (same-repo; hand off to parseLinkHref)
 *
 * Inputs that look like km: but have empty scheme-specific-parts (`km:`,
 * `km:/`) return null — there's nothing to resolve.
 *
 * Special chars in alias: the first `/` inside the cross-repo path terminates
 * the alias. Aliases are therefore `/`-free by construction. Other characters
 * (dashes, dots, unicode, percent-escapes) pass through — the Workspace
 * decides whether an alias is known.
 */
export function parseKmUri(uri: string): ParsedKmUri | null {
  if (typeof uri !== "string" || uri.length === 0) return null
  if (!uri.startsWith("km:")) return null

  const ssp = uri.slice(3) // strip "km:"
  if (ssp.length === 0) return null // bare "km:" → nothing to resolve

  // Split fragment at the first `#` — mirrors parseLinkHref semantics.
  let fragmentStart = -1
  for (let i = 0; i < ssp.length; i++) {
    if (ssp[i] === "#") {
      fragmentStart = i
      break
    }
  }
  const rawPath = fragmentStart === -1 ? ssp : ssp.slice(0, fragmentStart)
  const rawFragment = fragmentStart === -1 ? null : ssp.slice(fragmentStart + 1)
  const fragment = rawFragment === null ? null : safeDecode(rawFragment)

  if (rawPath.startsWith("/")) {
    // Cross-repo: `km:/<alias>[/<rest>]`
    const afterSlash = rawPath.slice(1)
    if (afterSlash.length === 0) return null // "km:/" alone — nothing to resolve

    const firstSlash = afterSlash.indexOf("/")
    if (firstSlash === -1) {
      return {
        kind: "km-uri",
        alias: safeDecode(afterSlash),
        relPath: "",
        fragment,
      }
    }
    const alias = safeDecode(afterSlash.slice(0, firstSlash))
    if (alias.length === 0) return null // "km://..."  — malformed

    const rest = afterSlash.slice(firstSlash + 1)
    // Collapse any leading slashes in the remainder, normalize trailing slash.
    const relPath = normalizeRelPath(rest)

    return { kind: "km-uri", alias, relPath, fragment }
  }

  // Same-repo / plain name: defer to parseLinkHref via the `km-self` marker.
  return { kind: "km-self", relPath: rawPath, fragment }
}

/**
 * Trim a leading `/`, drop the trailing `/` (unless the whole thing IS just
 * `/`), and decode percent-escapes segment-by-segment so `/` stays as a path
 * separator. Purely lexical — does NOT normalize `..` / `.` segments; that's
 * the resolver's job (with a mount root to constrain the traversal).
 */
function normalizeRelPath(raw: string): string {
  let path = raw
  while (path.startsWith("/")) path = path.slice(1)
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1)
  if (path.length === 0) return ""
  return path
    .split("/")
    .map((seg) => safeDecode(seg))
    .join("/")
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
