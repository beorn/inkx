/**
 * Text Pipeline Utilities
 *
 * Canonical Unicode-aware patterns for sigils (@mentions, #tags, +projects)
 * and extraction helpers. All consumers import from this module.
 *
 * Rich text rendering has moved to the inline AST system:
 * - Parsing: inline-parser.ts (parseInlineText)
 * - Rendering: InlineComponents.tsx (InlineText)
 * - Plain text: inline-parser.ts (parseToPlainText)
 */

// =============================================================================
// Canonical Patterns (Unicode-aware)
// =============================================================================

/** Combined sigil pattern: captures prefix and name separately (includes / and . for nested projects) */
export const SIGIL_PATTERN = /([@#\+])([\p{L}\p{N}_\/.-]+)/gu

// =============================================================================
// Extraction Helpers
// =============================================================================

/**
 * Extract all references from text in a single pass (Unicode-aware).
 * Returns deduplicated arrays of mentions, tags, projects, and wikilinks.
 */
export function extractRefs(content: string): {
  mentions: string[]
  tags: string[]
  projects: string[]
  wikilinks: string[]
} {
  const mentions = new Set<string>()
  const tags = new Set<string>()
  const projects = new Set<string>()
  const wikilinks = new Set<string>()

  // Extract sigils in one pass
  SIGIL_PATTERN.lastIndex = 0
  let match
  while ((match = SIGIL_PATTERN.exec(content)) !== null) {
    const prefix = match[1]
    const name = match[2]
    if (!name) continue
    if (prefix === "@") mentions.add(name)
    else if (prefix === "#") tags.add(name)
    else if (prefix === "+") projects.add(name)
  }

  // Extract wikilinks separately (different syntax)
  const wlRegex = /\[\[([^\]]+)\]\]/g
  while ((match = wlRegex.exec(content)) !== null) {
    if (match[1]) wikilinks.add(match[1])
  }

  return {
    mentions: [...mentions],
    tags: [...tags],
    projects: [...projects],
    wikilinks: [...wikilinks],
  }
}

// =============================================================================
// URL Prettification
// =============================================================================

/**
 * Global tracking parameters stripped from any URL.
 * Sources: ClearURLs, tidy-url, chrome-utm-stripper.
 */
const TRACKING_PARAMS = new Set([
  // Google Analytics / Ads
  "gclid",
  "gad_source",
  "dclid",
  // Facebook / Meta
  "fbclid",
  "__tn__",
  // Microsoft
  "msclkid",
  // HubSpot
  "_hsenc",
  "_hsmi",
  // Instagram
  "igshid",
  // Yandex
  "yclid",
  "_openstat",
  // Mailchimp
  "mc_cid",
  "mc_eid",
  // Marketo
  "mkt_tok",
  // LinkedIn
  "trk",
  // Drip
  "__s",
  // Klaviyo
  "_ke",
  // Olytics
  "oly_anon_id",
  "oly_enc_id",
  // Vero
  "vero_id",
  // Google sharing
  "usp",
  // Generic
  "ref_",
  "s_cid",
  "spm",
])

/** Prefixes that indicate tracking params (utm_source, sc_campaign, __cft__[0], etc.) */
const TRACKING_PREFIXES = ["utm_", "sc_", "__cft__"]

/** Site-specific tracking params — only stripped on matching hosts */
const SITE_TRACKING: Record<string, Set<string>> = {
  "x.com": new Set(["s", "t"]),
  "twitter.com": new Set(["s", "t"]),
  "youtube.com": new Set(["si", "feature", "pp"]),
  "youtu.be": new Set(["si", "feature", "pp"]),
  "open.spotify.com": new Set(["si"]),
}

function isTrackingParam(key: string, host: string): boolean {
  const k = key.toLowerCase()
  if (TRACKING_PARAMS.has(k)) return true
  if (TRACKING_PREFIXES.some((p) => k.startsWith(p))) return true
  return SITE_TRACKING[host]?.has(k) ?? false
}

/**
 * Prettify a URL for display in the TUI.
 *
 * 1. Strip protocol (https://, http://) and www. prefix
 * 2. Strip tracking parameters (utm_*, fbclid, etc.)
 * 3. Apply site-specific shortening (Google Docs, Amazon)
 * 4. Strip trailing slash on bare domains
 */
export function prettifyUrl(url: string): string {
  let parsed: URL
  try {
    parsed = new URL(url.startsWith("http") ? url : `https://${url}`)
  } catch {
    // Not a valid URL — basic string fallback
    let display = url.replace(/^https?:\/\//, "").replace(/^www\./, "")
    if (display.endsWith("/") && !display.slice(0, -1).includes("/")) {
      display = display.slice(0, -1)
    }
    return display
  }

  const host = parsed.hostname.replace(/^www\./, "")

  // Strip tracking params
  const keysToDelete: string[] = []
  for (const key of parsed.searchParams.keys()) {
    if (isTrackingParam(key, host)) keysToDelete.push(key)
  }
  for (const key of keysToDelete) parsed.searchParams.delete(key)

  // Try site-specific prettification
  const siteResult = prettifySite(host, parsed)
  if (siteResult !== null) return siteResult

  // Default: host + path + remaining query + fragment
  let display = host + parsed.pathname
  const qs = parsed.searchParams.toString()
  if (qs) display += `?${qs}`
  if (parsed.hash) display += parsed.hash

  // Strip trailing slash on bare domain
  if (parsed.pathname === "/" && display.endsWith("/")) {
    display = display.slice(0, -1)
  }

  return display
}

/** Site-specific prettification rules. Returns null if no rule matches. */
function prettifySite(host: string, url: URL): string | null {
  // Google Docs/Sheets/Slides/Forms: strip opaque document hash
  if (host === "docs.google.com") {
    const m = url.pathname.match(/^\/(document|spreadsheets|presentation|forms)\//)
    if (m) return `docs.google.com/${m[1]}/\u2026`
    return null
  }

  // Google Drive: strip opaque file/folder hash
  if (host === "drive.google.com") {
    const m = url.pathname.match(/^\/(file|drive\/folders)\//)
    if (m) return `drive.google.com/${m[1]}/\u2026`
    return null
  }

  // Amazon: extract clean ASIN link
  if (/(?:^|\.)amazon\.(com|co\.uk|de|fr|es|it|ca|co\.jp|com\.au|in|nl|sg|com\.br)$/.test(host)) {
    const m = url.pathname.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/)
    if (m) return `${host}/dp/${m[1]}`
    return null
  }

  return null
}
