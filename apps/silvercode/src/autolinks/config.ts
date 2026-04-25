/**
 * Autolinks configuration loader.
 *
 * Reads `<cwd>/.silvercode/links.toml` (per-vault) and returns a normalized
 * `AutolinkRule[]`. Workspace-level cascade is deferred to v2 — see
 * follow-up bead `km-silvercode.autolinks-cascade`.
 *
 * Schema (TOML):
 *
 *   [[autolinks]]
 *   pattern = "~repo"            # literal OR regex (start with "/" for regex)
 *   resolves_to = "/path/or/url" # what the pattern resolves to
 *   preview = "readme"           # one of the kinds below
 *
 * Pattern syntax:
 *   - Literal:  pattern = "~repo"            → exact substring match (escaped)
 *   - Regex:    pattern = "/\\+\\w+/"        → JS RegExp source between leading
 *                                              slash and trailing slash; if no
 *                                              trailing slash, the entire body
 *                                              after the leading slash is the
 *                                              source. The `g` flag is always
 *                                              applied internally.
 *
 * Preview kinds (v1):
 *   - "readme"          → fetch resolves_to (or its README.md if it's a dir)
 *   - "first-paragraph" → fetch resolves_to and show the first non-blank paragraph
 *   - "bd-active"       → shell out to `bd list --parent <resolves_to> --status open --limit 5`
 *
 * Malformed rules are dropped with a warning emitted via the silvercode
 * debug log (never throw — startup must not be blocked by user-config typos).
 */

import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import createDebug from "debug"

const log = createDebug("silvercode:autolinks:config")

export type AutolinkPreviewKind = "readme" | "first-paragraph" | "bd-active"

export type AutolinkRule = {
  /** Source pattern as the user authored it (for diagnostics + cache keys). */
  readonly source: string
  /** Compiled regexp used to scan text. Always carries the `g` flag. */
  readonly regex: RegExp
  /** What the pattern resolves to (path / URL / bead-parent id). */
  readonly resolvesTo: string
  /** Preview kind to render on hover. */
  readonly preview: AutolinkPreviewKind
}

/** Default config path relative to a working directory. */
export function defaultConfigPath(cwd: string): string {
  return join(cwd, ".silvercode", "links.toml")
}

/**
 * Load and validate `<cwd>/.silvercode/links.toml`. Missing file → empty list.
 * Malformed TOML → empty list (with a logged warning). Per-rule validation
 * errors drop the offending rule but keep the rest.
 */
export function loadAutolinksConfig(cwd: string): AutolinkRule[] {
  const path = defaultConfigPath(cwd)
  if (!existsSync(path)) return []

  let raw: string
  try {
    raw = readFileSync(path, "utf-8")
  } catch (err) {
    log(`failed to read %s: %s`, path, String(err))
    return []
  }

  return parseAutolinksToml(raw, path)
}

/**
 * Parse a TOML string into an `AutolinkRule[]`. Exposed separately so tests
 * can drive the parser without touching the filesystem.
 */
export function parseAutolinksToml(raw: string, sourceLabel = "<inline>"): AutolinkRule[] {
  let parsed: Record<string, unknown>
  try {
    parsed = Bun.TOML.parse(raw) as Record<string, unknown>
  } catch (err) {
    log(`%s: malformed TOML (%s); ignoring`, sourceLabel, String(err))
    return []
  }

  const entries = parsed["autolinks"]
  if (!Array.isArray(entries)) {
    if (entries !== undefined) {
      log(`%s: expected [[autolinks]] array, got %s`, sourceLabel, typeof entries)
    }
    return []
  }

  const rules: AutolinkRule[] = []
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]
    const rule = validateRule(entry, `${sourceLabel}[${i}]`)
    if (rule) rules.push(rule)
  }
  return rules
}

const VALID_PREVIEWS: ReadonlySet<AutolinkPreviewKind> = new Set<AutolinkPreviewKind>([
  "readme",
  "first-paragraph",
  "bd-active",
])

function validateRule(entry: unknown, where: string): AutolinkRule | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    log(`%s: not an object`, where)
    return null
  }
  const obj = entry as Record<string, unknown>

  const pattern = obj["pattern"]
  if (typeof pattern !== "string" || pattern.length === 0) {
    log(`%s: missing/invalid \`pattern\``, where)
    return null
  }
  const resolvesTo = obj["resolves_to"]
  if (typeof resolvesTo !== "string" || resolvesTo.length === 0) {
    log(`%s: missing/invalid \`resolves_to\``, where)
    return null
  }
  const preview = obj["preview"]
  if (typeof preview !== "string" || !VALID_PREVIEWS.has(preview as AutolinkPreviewKind)) {
    log(`%s: invalid \`preview\` (got %s; expected one of %s)`, where, String(preview), [...VALID_PREVIEWS].join(", "))
    return null
  }

  let regex: RegExp
  try {
    regex = compilePattern(pattern)
  } catch (err) {
    log(`%s: invalid regex pattern \`${pattern}\` (%s)`, where, String(err))
    return null
  }

  return {
    source: pattern,
    regex,
    resolvesTo,
    preview: preview as AutolinkPreviewKind,
  }
}

/**
 * Compile a user-authored pattern into a `RegExp`.
 *
 * - Patterns starting with `/` are treated as regex source. A trailing `/`
 *   is optional (and stripped if present) — the `g` flag is always added.
 * - Otherwise the pattern is treated as a literal: the user's text is escaped
 *   so meta characters in their string don't act as regex syntax.
 */
export function compilePattern(pattern: string): RegExp {
  if (pattern.startsWith("/")) {
    let body = pattern.slice(1)
    if (body.endsWith("/") && body.length > 0) body = body.slice(0, -1)
    if (body.length === 0) throw new Error("empty regex body")
    return new RegExp(body, "g")
  }
  return new RegExp(escapeRegex(pattern), "g")
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
