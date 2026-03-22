/**
 * URL Metadata Extraction — fetch and cache page metadata for link previews.
 *
 * Zero-dependency approach: fetch URL, read first 8KB of HTML, extract metadata
 * via regex. OG/meta tags are machine-generated and always in <head>, so regex
 * is reliable for these specific tags.
 *
 * Sources consulted: open-graph-scraper, metascraper, unfurl.js, ClearURLs.
 * Benchmarks show regex at ~2μs/call vs htmlparser2 at ~15μs/call, but the
 * real bottleneck is the network fetch (50-500ms), making parse time irrelevant.
 */

import { decodeHTML } from "entities"

// =============================================================================
// Types
// =============================================================================

export interface UrlMetadata {
  title?: string
  description?: string
  image?: string
  siteName?: string
}

// =============================================================================
// Cache
// =============================================================================

const MAX_CACHE_SIZE = 200

const cache = new Map<string, UrlMetadata>()
const pending = new Set<string>()
const failures = new Set<string>()

/** Get cached metadata for a URL, or null if not cached. */
export function getCachedMetadata(url: string): UrlMetadata | null {
  return cache.get(url) ?? null
}

/** Evict oldest entries when cache exceeds max size. */
function evictIfNeeded(): void {
  if (cache.size <= MAX_CACHE_SIZE) return
  // Map iteration order is insertion order — delete first half
  const toDelete = Math.floor(cache.size / 2)
  let i = 0
  for (const key of cache.keys()) {
    if (i++ >= toDelete) break
    cache.delete(key)
  }
}

// =============================================================================
// Fetch
// =============================================================================

const FETCH_TIMEOUT_MS = 5000
const MAX_READ_BYTES = 16384 // 16KB — enough for <head> on most sites
const USER_AGENT = "km/1.0 (link preview bot; +https://github.com/beorn/km)"

/**
 * Fetch metadata for a URL. Returns cached result if available, otherwise
 * fetches in the background. Returns null if fetch is pending or failed.
 *
 * Usage: call once to start fetch, call again to check cache.
 * The returned promise resolves when metadata is available (or fetch fails).
 */
export async function fetchUrlMetadata(url: string): Promise<UrlMetadata | null> {
  // Cache hit
  const cached = cache.get(url)
  if (cached) return cached

  // Already failed — don't retry
  if (failures.has(url)) return null

  // Already fetching — return null (caller can retry on next render)
  if (pending.has(url)) return null

  // Only fetch http/https URLs
  if (!url.startsWith("http://") && !url.startsWith("https://")) return null

  pending.add(url)
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (!response.ok || !response.body) {
      failures.add(url)
      return null
    }

    // Check content type — only parse HTML
    const contentType = response.headers.get("content-type") ?? ""
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      failures.add(url)
      return null
    }

    // Read only first 16KB — just need <head>
    const html = await readPartial(response, MAX_READ_BYTES)

    const meta = extractMetadata(html)
    // Only cache if we got something useful
    if (meta.title || meta.description) {
      evictIfNeeded()
      cache.set(url, meta)
      return meta
    }

    // Got nothing useful — mark as failed to avoid retrying
    failures.add(url)
    return null
  } catch {
    failures.add(url)
    return null
  } finally {
    pending.delete(url)
  }
}

/** Read up to maxBytes from a response, then cancel the stream. */
async function readPartial(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) return ""
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read()
      if (done || !value) break
      chunks.push(value)
      total += value.length
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  // Concatenate and decode
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged)
}

// =============================================================================
// Metadata Extraction (regex-based)
// =============================================================================

/** Extract metadata from HTML <head> using regex. */
export function extractMetadata(html: string): UrlMetadata {
  const meta: UrlMetadata = {}

  // <title>...</title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (titleMatch?.[1]) meta.title = decodeEntities(titleMatch[1].trim())

  // og:title overrides <title>
  const ogTitle = extractProperty(html, "og:title")
  if (ogTitle) meta.title = ogTitle

  // twitter:title as fallback
  if (!meta.title) meta.title = extractMetaName(html, "twitter:title") ?? undefined

  // Description: og:description > meta description > twitter:description
  meta.description =
    extractProperty(html, "og:description") ??
    extractMetaName(html, "description") ??
    extractMetaName(html, "twitter:description") ??
    undefined

  // og:image
  meta.image = extractProperty(html, "og:image") ?? undefined

  // og:site_name
  meta.siteName = extractProperty(html, "og:site_name") ?? undefined

  // Truncate long values
  if (meta.title && meta.title.length > 120) meta.title = meta.title.slice(0, 117) + "…"
  if (meta.description && meta.description.length > 200) meta.description = meta.description.slice(0, 197) + "…"

  return meta
}

function extractProperty(html: string, property: string): string | null {
  return extractMetaContent("property", property, html)
}

function extractMetaName(html: string, name: string): string | null {
  return extractMetaContent("name", name, html)
}

function extractMetaContent(attr: string, value: string, html: string): string | null {
  const escaped = escapeRegex(value)
  // attr="..." content="..."
  const re1 = new RegExp(`<meta[^>]+${attr}\\s*=\\s*["']${escaped}["'][^>]+content\\s*=\\s*["']([^"']*)["']`, "i")
  const m1 = html.match(re1)
  if (m1?.[1]) return decodeEntities(m1[1])

  // content="..." attr="..." (reversed)
  const re2 = new RegExp(`<meta[^>]+content\\s*=\\s*["']([^"']*)["'][^>]+${attr}\\s*=\\s*["']${escaped}["']`, "i")
  const m2 = html.match(re2)
  if (m2?.[1]) return decodeEntities(m2[1])

  return null
}

/**
 * Decode HTML entities using the `entities` package (full HTML5 entity support).
 * Runs twice to handle double-encoding (common in OG tags from GitHub,
 * Medium, etc. where content is escaped twice: &amp;amp; → &amp; → &).
 */
function decodeEntities(text: string): string {
  let result = decodeHTML(text)
  // Second pass for double-encoded entities
  if (result !== text && result.includes("&")) {
    result = decodeHTML(result)
  }
  return result
}

/** Escape special regex characters in a string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
