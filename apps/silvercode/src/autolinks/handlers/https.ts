/**
 * `https:` handler — pattern-based webcards for known hosts, generic
 * placeholder fallback for everything else.
 *
 * v1 doesn't fetch the URL (that needs offline-safe fetching, OG metadata
 * extraction, sandboxing) — instead we parse the URL shape itself for known
 * hosts (GitHub, GitHub Gists, JIRA, Linear) and surface structured info in
 * the popover. Unknown hosts fall through to a generic webcard placeholder.
 *
 * Plain URLs detected in messages flow through this handler via virtual rules
 * emitted by `match.ts`. There is no longer a builtin `kind: "url"` detection
 * in `detection.ts`; this handler is the sole rendering path for plain URLs.
 *
 * **Pattern-only — no HTTP fetching.** Per-host parsers inspect `uri.hostname`
 * and `uri.pathname` and produce a structured info record; if no pattern
 * matches we fall back to the generic webcard placeholder. Real fetching is
 * tracked separately (`km-silvercode.autolinks-uri-pivot` follow-ups).
 *
 * Beads: km-silvercode.url-detection-via-handlers,
 *        km-silvercode.url-host-handlers
 */

import type { Handler, HandlerOutcome, ResolveCtx } from "./index.ts"

export const httpsHandler: Handler = {
  scheme: "https",
  resolve(uri: URL, ctx: ResolveCtx): HandlerOutcome {
    return dispatchByHost(uri, ctx)
  },
}

/**
 * Sibling for `http:` URIs — same body shape as `https:` since the popover
 * rendering doesn't differ. Registered separately in `index.ts` only if a
 * caller passes an `http:` URI; v1 keeps the registry minimal so `http:` is
 * NOT pre-registered and falls through to the unhandled-scheme path. (When
 * we add it, we just register `httpHandler` next to `httpsHandler`.)
 */
export const httpHandler: Handler = {
  scheme: "http",
  resolve(uri: URL, ctx: ResolveCtx): HandlerOutcome {
    return dispatchByHost(uri, ctx)
  },
}

/**
 * Per-host dispatch. The first parser whose host predicate matches AND whose
 * URL-shape parser returns non-null wins. If a host parser matches the host
 * but not the path shape (e.g. `github.com/marketplace`), it returns null and
 * we fall back to the generic webcard.
 */
function dispatchByHost(uri: URL, ctx: ResolveCtx): HandlerOutcome {
  const t = (ctx.now ?? Date.now)()
  const host = uri.hostname.toLowerCase()

  if (host === "github.com") {
    const info = parseGithubUrl(uri)
    if (info !== null) return { result: { kind: "ok", body: formatGithubInfo(info), format: "text", resolvedAt: t } }
  } else if (host === "gist.github.com") {
    const info = parseGistUrl(uri)
    if (info !== null) return { result: { kind: "ok", body: formatGistInfo(info), format: "text", resolvedAt: t } }
  } else if (host === "linear.app") {
    const info = parseLinearUrl(uri)
    if (info !== null) return { result: { kind: "ok", body: formatLinearInfo(info), format: "text", resolvedAt: t } }
  } else if (looksLikeJiraHost(host)) {
    const info = parseJiraUrl(uri)
    if (info !== null) return { result: { kind: "ok", body: formatJiraInfo(info), format: "text", resolvedAt: t } }
  }

  return { result: { kind: "ok", body: genericWebcardBody(uri), format: "text", resolvedAt: t } }
}

// -----------------------------------------------------------------------------
// GitHub (github.com)
// -----------------------------------------------------------------------------

export type GithubInfo =
  | { readonly kind: "repo"; readonly owner: string; readonly repo: string }
  | { readonly kind: "pull"; readonly owner: string; readonly repo: string; readonly number: string }
  | { readonly kind: "issue"; readonly owner: string; readonly repo: string; readonly number: string }
  | {
      readonly kind: "file"
      readonly owner: string
      readonly repo: string
      readonly branch: string
      readonly path: string
    }

/**
 * Parse a `github.com` URL into a structured GithubInfo. Returns null when
 * the URL doesn't match a known shape — the caller falls back to the generic
 * webcard placeholder.
 *
 * Supported shapes:
 *   - `/<owner>/<repo>`                            → repo
 *   - `/<owner>/<repo>/pull/<n>`                   → pull
 *   - `/<owner>/<repo>/issues/<n>`                 → issue
 *   - `/<owner>/<repo>/blob/<branch>/<path...>`    → file
 */
export function parseGithubUrl(uri: URL): GithubInfo | null {
  const segments = splitPath(uri.pathname)
  if (segments.length < 2) return null
  const owner = segments[0]!
  const repo = segments[1]!
  if (segments.length === 2) {
    return { kind: "repo", owner, repo }
  }

  const verb = segments[2]
  if (verb === "pull" && segments.length >= 4 && /^\d+$/.test(segments[3]!)) {
    return { kind: "pull", owner, repo, number: segments[3]! }
  }
  if (verb === "issues" && segments.length >= 4 && /^\d+$/.test(segments[3]!)) {
    return { kind: "issue", owner, repo, number: segments[3]! }
  }
  if (verb === "blob" && segments.length >= 5) {
    const branch = segments[3]!
    const path = segments.slice(4).join("/")
    return { kind: "file", owner, repo, branch, path }
  }
  return null
}

export function formatGithubInfo(info: GithubInfo): string {
  switch (info.kind) {
    case "repo":
      return `GitHub repo: ${info.owner}/${info.repo}`
    case "pull":
      return `GitHub PR #${info.number}\nin ${info.owner}/${info.repo}`
    case "issue":
      return `GitHub issue #${info.number}\nin ${info.owner}/${info.repo}`
    case "file":
      return `GitHub file: ${info.path}\n@${info.branch} in ${info.owner}/${info.repo}`
  }
}

// -----------------------------------------------------------------------------
// GitHub Gists (gist.github.com)
// -----------------------------------------------------------------------------

export type GistInfo = { readonly kind: "gist"; readonly user: string; readonly id: string }

export function parseGistUrl(uri: URL): GistInfo | null {
  const segments = splitPath(uri.pathname)
  if (segments.length !== 2) return null
  return { kind: "gist", user: segments[0]!, id: segments[1]! }
}

export function formatGistInfo(info: GistInfo): string {
  return `GitHub Gist by ${info.user}`
}

// -----------------------------------------------------------------------------
// JIRA (atlassian.net or self-hosted matching /jira/i)
// -----------------------------------------------------------------------------

export type JiraInfo = { readonly kind: "jira"; readonly host: string; readonly key: string; readonly number: string }

/**
 * JIRA can self-host on any domain. We match by hostname heuristic:
 * - Atlassian Cloud: `<tenant>.atlassian.net`
 * - Self-hosted: hostname contains the substring `jira` (case-insensitive)
 */
export function looksLikeJiraHost(host: string): boolean {
  if (host.endsWith(".atlassian.net") || host === "atlassian.net") return true
  return /jira/i.test(host)
}

export function parseJiraUrl(uri: URL): JiraInfo | null {
  const segments = splitPath(uri.pathname)
  if (segments.length !== 2) return null
  if (segments[0] !== "browse") return null
  const m = segments[1]!.match(/^([A-Z][A-Z0-9_]*)-(\d+)$/)
  if (m === null) return null
  return { kind: "jira", host: uri.hostname, key: m[1]!, number: m[2]! }
}

export function formatJiraInfo(info: JiraInfo): string {
  return `JIRA ${info.key}-${info.number}\n(${info.host})`
}

// -----------------------------------------------------------------------------
// Linear (linear.app)
// -----------------------------------------------------------------------------

export type LinearInfo = {
  readonly kind: "linear"
  readonly workspace: string
  readonly id: string
  readonly slug: string | null
}

/**
 * Linear issue URLs have the shape:
 *   - `/<workspace>/issue/<id>/<slug>`    (with slug)
 *   - `/<workspace>/issue/<id>`           (no slug)
 *
 * The `<id>` looks like `WORK-123` (workspace prefix + dash + number).
 */
export function parseLinearUrl(uri: URL): LinearInfo | null {
  const segments = splitPath(uri.pathname)
  if (segments.length < 3) return null
  if (segments[1] !== "issue") return null
  if (!/^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(segments[2]!)) return null
  const workspace = segments[0]!
  const id = segments[2]!
  const slug = segments.length >= 4 ? segments[3]! : null
  return { kind: "linear", workspace, id, slug }
}

export function formatLinearInfo(info: LinearInfo): string {
  const lines = [`Linear ${info.id}`]
  if (info.slug !== null) lines.push(slugToTitle(info.slug))
  lines.push(`in ${info.workspace}`)
  return lines.join("\n")
}

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ")
}

// -----------------------------------------------------------------------------
// Generic webcard fallback
// -----------------------------------------------------------------------------

function genericWebcardBody(uri: URL): string {
  const lines: string[] = []
  lines.push(uri.toString())
  if (uri.host.length > 0) {
    lines.push("")
    lines.push(`host: ${uri.host}`)
  }
  if (uri.pathname.length > 1) {
    lines.push(`path: ${uri.pathname}`)
  }
  lines.push("")
  lines.push("(webcard fetch not yet implemented — open in a browser to view)")
  return lines.join("\n")
}

/**
 * Split a URL pathname into non-empty, decoded segments.
 * `/foo/bar/`  → `["foo", "bar"]`
 * `/`           → `[]`
 */
function splitPath(pathname: string): string[] {
  return pathname
    .split("/")
    .filter((s) => s.length > 0)
    .map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    })
}
