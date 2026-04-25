/**
 * URI parsing for autolinks.
 *
 * The autolinks pivot factors the implementation into URI-scheme dispatch:
 *
 *   - Stage 1 (linkifier): pattern → URI (this module)
 *   - Stage 2 (handler):   URI → preview + action (handlers/index.ts)
 *
 * `parseResolvesTo(s)` interprets a rule's `resolves_to` field as a URI.
 * Most rules in `.km/config.yaml` don't carry an explicit scheme today, so
 * this module infers one from the value's surface shape:
 *
 *   - Already has a scheme (`https://...`, `bd://...`, `file://...`,
 *     `mcp://...`, `shell://...`) → URL is parsed verbatim.
 *   - Starts with `/`         → `file:` scheme (absolute path).
 *   - Starts with `~`         → `~` expanded to `$HOME`, then `file:`.
 *   - Looks like a bd parent  → `bd:` scheme. Heuristic: `^km-...`
 *                               or `^[a-z][a-z0-9-]*\.[a-z0-9-]+$`
 *                               (a single-dot scoped id like `foo.bar`).
 *   - Otherwise               → `file:` (relative; resolved against `cwd`
 *                               when available, else against the value
 *                               verbatim).
 *
 * Returns a `URL` instance. The `pathname` is the canonical place to read
 * a `file:`-scheme path; `host` is the bd parent id for `bd:` URIs.
 *
 * The shape is deliberately minimal — handlers reach into `uri.protocol`
 * and `uri.pathname`/`uri.host` directly. We do NOT introduce a custom
 * `ResolvedURI` type because `URL` already covers what we need and stays
 * legible to anyone who reads the handler code.
 */

import { homedir } from "node:os"
import { resolve as resolvePath } from "node:path"
import createDebug from "debug"

const log = createDebug("silvercode:autolinks:uri")

/** Optional context for `parseResolvesTo`. */
export type ParseResolvesToOptions = {
  /** Working directory used to resolve relative paths into absolute file: URIs. */
  readonly cwd?: string
}

/**
 * Detects a value that already carries an explicit URI scheme. We're
 * generous with what counts as a scheme here — RFC 3986 says a scheme is
 * `ALPHA *( ALPHA / DIGIT / "+" / "-" / "." )` followed by `:`. We don't
 * want to mis-detect `bd-active` (a preview kind that contains a `-`) as
 * a scheme, and we don't want to mis-detect a bare bead id like
 * `km-foo.bar` (no `:`) as a URI. The presence of `:` is the discriminator.
 */
const SCHEME_RE = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

/**
 * Heuristic for "looks like a bd parent id". Two shapes accepted:
 *   - `km-<scope>` (canonical km bead form, optionally with a `.<slug>`)
 *   - `<scope>.<slug>` (a single dot, lowercase letters/digits/dashes only)
 *
 * Both shapes are common values for `bd-active` rules. Anything else falls
 * back to `file:`.
 */
const BD_LIKE_RE = /^(?:km-[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)?|[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*)$/

/**
 * Parse a `resolves_to` string into a `URL`.
 *
 * Throws only on internal errors (bad URL constructor input after we've
 * built a normalised string). User-supplied values that look funny (e.g.
 * an absolute path with characters that need percent-encoding) are
 * percent-encoded before being passed to the URL constructor so the call
 * doesn't throw — handlers receive the decoded form via `pathname`.
 */
export function parseResolvesTo(value: string, opts: ParseResolvesToOptions = {}): URL {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    // Construct a placeholder unknown: URI so callers don't have to
    // null-check. Doctor flags this as "no handler" anyway.
    return new URL("unknown:empty")
  }

  // 1. Explicit scheme — passthrough.
  if (SCHEME_RE.test(trimmed)) {
    try {
      return new URL(trimmed)
    } catch (err) {
      log("explicit scheme failed to parse: %s (%s) — falling back to unknown", trimmed, String(err))
      return new URL(`unknown:${encodeURIComponent(trimmed)}`)
    }
  }

  // 2. Tilde expansion → file:.
  if (trimmed.startsWith("~")) {
    const home = homedir()
    const expanded = trimmed === "~" ? home : trimmed.startsWith("~/") ? `${home}${trimmed.slice(1)}` : trimmed
    return fileUrlFromPath(expanded)
  }

  // 3. Absolute path → file:.
  if (trimmed.startsWith("/")) {
    return fileUrlFromPath(trimmed)
  }

  // 4. bd parent id heuristic.
  if (BD_LIKE_RE.test(trimmed)) {
    // Use `bd:<id>` (opaque path, no host). We deliberately use the
    // single-colon form here so URL.host stays empty and URL.pathname
    // is the bead id — keeps handler dispatch simple.
    return new URL(`bd:${trimmed}`)
  }

  // 5. Relative path → file: (resolved against cwd when available).
  const cwd = opts.cwd
  const abs = cwd ? resolvePath(cwd, trimmed) : trimmed
  return fileUrlFromPath(abs)
}

/**
 * Build a `file:` URL from an absolute path. Percent-encodes characters
 * the URL constructor would reject (spaces, etc.) but otherwise preserves
 * the path verbatim. Handlers read the path via `decodeURIComponent(uri.pathname)`.
 */
function fileUrlFromPath(path: string): URL {
  // URL constructor needs an absolute path for file:; relative paths get
  // a `file:./...` shape that's awkward to read. Force an absolute form
  // by prepending a slash if the input doesn't have one.
  const absPath = path.startsWith("/") ? path : `/${path}`
  // Encode characters the URL constructor would reject. We don't encode
  // `/` because that's the path separator. Spaces and other reserved
  // chars get %-encoded.
  const encoded = absPath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")
  return new URL(`file://${encoded}`)
}

/**
 * Decode the path from a `file:` URL back into a filesystem path.
 *
 * Handlers should call this rather than reading `uri.pathname` directly —
 * the pathname is percent-encoded after `parseResolvesTo`, and treating it
 * as a literal path silently breaks files with spaces or unicode.
 */
export function filePathFromURL(uri: URL): string {
  // URL parses `file:///x/y` with pathname `/x/y`. We decode each segment
  // independently so a `%2F` in a segment doesn't get treated as a separator.
  return uri.pathname
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .join("/")
}

/**
 * Decode the bd parent id from a `bd:` URL. `parseResolvesTo` builds
 * `bd:<id>` (no host); `URL` parses that with `pathname` = `<id>`.
 */
export function bdIdFromURL(uri: URL): string {
  // For `bd:foo.bar`, URL gives pathname = "foo.bar". For `bd://host/path`,
  // we'd want host. Try host first, then pathname (with leading slash trimmed).
  if (uri.host.length > 0) return uri.host
  const p = uri.pathname
  return p.startsWith("/") ? p.slice(1) : p
}
