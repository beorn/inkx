/**
 * KLinkRef — parsed representation of a KLink.href.
 *
 * Shaped after WHATWG URL but closed to km's scheme and anchor rules.
 * Total: `parseLinkHref` throws on malformed input; every writer must
 * produce hrefs that round-trip through this parser.
 *
 * See docs/design/links.md for the URI grammar.
 */

export type KAnchor =
  | { kind: "section"; value: string } // "Section Name" → { kind:'section', value:'Section Name' }
  | { kind: "block"; value: string } //   "^abc"          → { kind:'block',   value:'abc' }

export type KLinkRef = {
  readonly scheme: string // 'km' | 'https' | 'mailto' | '' (self-ref)
  readonly isKm: boolean // scheme === 'km'
  readonly isSelfRef: boolean // scheme === '' && fragment != null
  readonly isExternal: boolean // !isKm && !isSelfRef
  readonly name: string // lowercased hierarchical name for km; '' for external/self-ref
  readonly displayName: string // author casing, decoded; '' for external/self-ref
  readonly segments: readonly string[] // name split on '/'  ['project', 'alpha']
  readonly fragment: string | null // raw fragment text, without leading '#'; decoded
  readonly anchor: KAnchor | null // typed parse of the fragment
  readonly external: URL | null // for non-km schemes, the WHATWG URL
}

/**
 * Parse a KLink.href into its structured form. Total — throws on malformed.
 *
 * Accepted shapes:
 *   km:<name>[#<fragment>]   — named reference
 *   #<fragment>              — self-reference
 *   https://…  mailto:…  …    — external (WHATWG URL)
 *
 * For `km:`, the first `#` at position > 0 in the scheme-specific-part is
 * the fragment delimiter. A `#` at position 0 (e.g. `km:#foo`) is treated
 * as part of the name — but the canonical encoding is `km:%23foo`, which
 * also parses back to name `#foo`. Both forms yield the same KLinkRef.
 */
export function parseLinkHref(href: string): KLinkRef {
  if (typeof href !== "string" || href.length === 0) {
    throw new TypeError(`parseLinkHref: href must be a non-empty string, got ${JSON.stringify(href)}`)
  }

  if (href.startsWith("#")) {
    return parseSelfRef(href)
  }

  if (href.startsWith("km:")) {
    return parseKmRef(href)
  }

  return parseExternal(href)
}

/**
 * Inverse of parseLinkHref. Deterministic — `parseLinkHref(stringifyLinkRef(ref))`
 * deep-equals `ref` for every well-formed ref.
 */
export function stringifyLinkRef(ref: KLinkRef): string {
  if (ref.isSelfRef) {
    return `#${encodeFragment(ref.fragment ?? "")}`
  }
  if (ref.isExternal) {
    if (ref.external === null) {
      throw new Error("stringifyLinkRef: external ref missing external URL")
    }
    return ref.external.href
  }
  if (ref.isKm) {
    const path = encodeName(ref.displayName)
    if (ref.fragment === null) return `km:${path}`
    return `km:${path}#${encodeFragment(ref.fragment)}`
  }
  throw new Error(`stringifyLinkRef: unrecognized ref shape scheme=${ref.scheme}`)
}

// =============================================================================
// Internals
// =============================================================================

function parseSelfRef(href: string): KLinkRef {
  const fragment = decodeComponent(href.slice(1))
  return {
    scheme: "",
    isKm: false,
    isSelfRef: true,
    isExternal: false,
    name: "",
    displayName: "",
    segments: [],
    fragment,
    anchor: parseAnchor(fragment),
    external: null,
  }
}

function parseKmRef(href: string): KLinkRef {
  const ssp = href.slice("km:".length)
  if (ssp.length === 0) {
    throw new SyntaxError(`parseLinkHref: km: with empty path: ${JSON.stringify(href)}`)
  }

  // Fragment delimiter is the first `#` at position > 0 in the SSP.
  // A `#` at position 0 is part of the name (canonical form percent-encodes it,
  // but we accept the raw form too).
  let fragmentStart = -1
  for (let i = 1; i < ssp.length; i++) {
    if (ssp[i] === "#") {
      fragmentStart = i
      break
    }
  }

  const rawPath = fragmentStart === -1 ? ssp : ssp.slice(0, fragmentStart)
  const rawFragment = fragmentStart === -1 ? null : ssp.slice(fragmentStart + 1)

  const displayName = decodeComponent(rawPath)
  const name = displayName.toLowerCase()
  const segments = Object.freeze(displayName.split("/").map((s) => s.toLowerCase()))
  const fragment = rawFragment === null ? null : decodeComponent(rawFragment)

  return {
    scheme: "km",
    isKm: true,
    isSelfRef: false,
    isExternal: false,
    name,
    displayName,
    segments,
    fragment,
    anchor: parseAnchor(fragment),
    external: null,
  }
}

function parseExternal(href: string): KLinkRef {
  let url: URL
  try {
    url = new URL(href)
  } catch {
    throw new SyntaxError(`parseLinkHref: malformed URL ${JSON.stringify(href)}`)
  }
  const scheme = url.protocol.replace(/:$/, "")
  return {
    scheme,
    isKm: false,
    isSelfRef: false,
    isExternal: true,
    name: "",
    displayName: "",
    segments: [],
    fragment: url.hash === "" ? null : decodeComponent(url.hash.slice(1)),
    anchor: null,
    external: url,
  }
}

function parseAnchor(fragment: string | null): KAnchor | null {
  if (fragment === null || fragment.length === 0) return null
  if (fragment.startsWith("^")) {
    return { kind: "block", value: fragment.slice(1) }
  }
  return { kind: "section", value: fragment }
}

// URL component encode/decode — percent-encode only the chars that conflict
// with our grammar: `#`, `?`, `%`. Other sub-delims (`@`, `+`) and pchar
// characters (letters, digits, `-`, `.`, `_`, `~`, `:`, `/`) pass through.
function encodeName(name: string): string {
  return name.replace(/[#?%]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)
}

function encodeFragment(fragment: string): string {
  // Fragments follow the same reserved-char rules; `?` is allowed in fragments
  // per RFC 3986 but km normalizes by encoding for deterministic round-trips.
  return fragment.replace(/[#?%]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`)
}

function decodeComponent(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    // Tolerate malformed percent-escapes by returning the raw input.
    return s
  }
}
