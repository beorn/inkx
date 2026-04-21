/**
 * Lightweight Link Extractor
 *
 * Regex-based pass over a markdown file's raw content to find link edges
 * WITHOUT running the full mdast parser. Used for collapsed-file edge
 * preservation: files matched by `collapseParse.patterns` stay opaque stubs
 * (no descendant nodes), but we still want their outgoing links to show up
 * as backlinks on the targets they reference.
 *
 * See `docs/design/model/klink.md` for the canonical link model, and
 * `packages/km-storage/src/markdown/collapse-parse.ts` for the matcher that
 * decides whether a file is collapsed.
 *
 * Design:
 *   - Line-based scanning so a single unclosed `[[` can't cascade.
 *   - Skips fenced code blocks (```) and inline code spans (`...`) because
 *     chat transcripts routinely embed `[[something]]` inside code.
 *   - Wiki links: `[[Note]]`, `[[Note|display]]`, `[[Note#Section]]`,
 *     `[[Note^blockid]]`, `![[Note]]` (embed), `[[#Section]]` (self-ref).
 *   - MD links: `[text](target)`, including `target#anchor`. External URLs
 *     (http/https/mailto/etc.) pass through unchanged.
 *   - Mentions (`@Name`) and tags (`#tag`) are OPT-IN via the `mentions` /
 *     `tags` options. Default-off because chat transcripts are noisy.
 *   - Each link carries a canonical `href` produced by `normalizeLinkHref`,
 *     so the collapsed-file edges union cleanly with the parsed-node `links`
 *     table for backlink queries.
 *
 * Perf target: <50ms per 100KB file. Non-goal: mdast parity. If a file needs
 * precise link extraction (e.g., for rename rewrites) it must be promoted
 * out of collapse-parse first.
 */

import { normalizeLinkHref } from "@km/markdown"

// ============================================================================
// TYPES
// ============================================================================

export type ExtractedLinkType = "wiki" | "md" | "mention" | "tag"

/**
 * One link occurrence found in a collapsed file's raw content.
 *
 * `target`     — the raw target text (e.g. "Alpha", "Project/Alpha",
 *                "./alpha.md", "https://example.com", "@Alice", "#urgent").
 *                Empty string for pure self-refs ([[#Section]], [x](#anchor)).
 * `heading`    — fragment (section or `^blockid`), without the `#`.
 * `text`       — display text (alias for wiki, anchor text for md links).
 * `type`       — which notation produced this link.
 * `rel`        — 'embed' for `![[...]]`, 'link' otherwise.
 * `href`       — canonical km-link locator, produced by normalizeLinkHref.
 *                Matches the `links.href` column shape, enabling a clean
 *                UNION in backlink queries.
 * `offset`     — byte offset of the link notation in the source content.
 */
export interface ExtractedLink {
  target: string
  heading?: string
  text?: string
  type: ExtractedLinkType
  rel: "link" | "embed"
  href: string
  offset: number
}

/**
 * Which opt-in link types to extract. Wiki and md links are always extracted.
 */
export interface ExtractLinksOptions {
  /** Extract `@Name` mentions (opt-in; noisy in chat transcripts). */
  mentions?: boolean
  /** Extract `#tag` hashtags (opt-in; noisy in chat transcripts). */
  tags?: boolean
}

// ============================================================================
// REGEX PATTERNS
// ============================================================================

// `![[target|text]]` or `[[target|text]]`. The `!` prefix makes it an embed.
// Target forbids `|`, `]`, newlines. Alias (after `|`) forbids `]`, newlines.
// Target must be non-empty; alias is optional.
const WIKI_LINK_RE = /(!?)\[\[([^\]|\n]+)(?:\|([^\]\n]*))?\]\]/g

// `[text](target)`. Text forbids `]`, `\n`. Target forbids `)`, space, `\n`.
// We intentionally disallow spaces in the target to avoid title-style
// `[text](/path "title")` — those are rare in outgoing-link graphs and hard
// to do without a real parser. Nested `[]` in text are permitted at a shallow
// depth using a tempered pattern.
const MD_LINK_RE = /\[([^\]\n]*?)\]\(([^)\s\n]+)\)/g

// Inline code span (backticks). We strip these before scanning so link-like
// text inside `code` doesn't match.
const INLINE_CODE_RE = /`[^`\n]*`/g

// Fenced code block fence line (``` optionally followed by language).
const FENCE_RE = /^```/

// Escaped `[`: author wrote `\[` — not a link introducer. We pre-strip these.
// Replace `\[` with a non-bracket character so downstream regex misses them.
// Using `\x00` as sentinel (can't appear in text files parsed as UTF-8).
const ESCAPED_BRACKET_RE = /\\\[/g

// Mention: word boundary + `@` + letter + [word chars].
// We avoid matching `alice@example.com` (no boundary before `@`) and `@911`
// (digit after `@`).
const MENTION_RE = /(^|[\s([{.,;:!?])@([a-zA-Z][\w-]*)/g

// Tag: word boundary + `#` + letter + [word chars].
// Same boundary rule. `foo#bar` is rejected (no boundary); `#42` is rejected
// (digit after `#`); `issue #urgent` matches.
const TAG_RE = /(^|[\s([{.,;:!?])#([a-zA-Z][\w-]*)/g

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Scan `content` for outgoing link occurrences.
 *
 * Line-based, skips code fences and inline code spans. Returns every
 * occurrence — a link that appears twice in the file produces two entries,
 * consistent with the parsed `links` table's occurrence-level granularity.
 */
export function extractLinks(content: string, options: ExtractLinksOptions = {}): ExtractedLink[] {
  if (!content) return []
  const results: ExtractedLink[] = []

  // Pre-strip escaped brackets so `\[[NotLink]]` doesn't introduce a wiki.
  // Preserves offsets because it's a same-length substitution.
  const pre = content.replace(ESCAPED_BRACKET_RE, (_m) => "\x00\x00")

  const lines = pre.split("\n")
  let offset = 0
  let inFence = false

  for (const line of lines) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence
      offset += line.length + 1 // +1 for the `\n`
      continue
    }
    if (!inFence) {
      // Mask inline code spans so their contents don't match link regexes.
      // Same-length replacement preserves offsets.
      const masked = line.replace(INLINE_CODE_RE, (m) => "\x01".repeat(m.length))

      scanWiki(masked, offset, results)
      scanMd(masked, offset, results)
      if (options.mentions) scanMentions(masked, offset, results)
      if (options.tags) scanTags(masked, offset, results)
    }
    offset += line.length + 1
  }

  // Stable sort by offset for deterministic output.
  results.sort((a, b) => a.offset - b.offset)
  return results
}

// ============================================================================
// SCANNERS
// ============================================================================

function scanWiki(line: string, lineStart: number, out: ExtractedLink[]): void {
  WIKI_LINK_RE.lastIndex = 0
  for (let m = WIKI_LINK_RE.exec(line); m !== null; m = WIKI_LINK_RE.exec(line)) {
    const [, bang, rawTarget, rawAlias] = m
    const target = rawTarget?.trim() ?? ""
    if (!target) continue

    // Split target/heading per the klink notation rules.
    // Priority: `#` at index > 0 wins; `^blockid` without `#` becomes fragment.
    const { path, heading } = splitWikiTarget(target)
    const rel = bang === "!" ? "embed" : "link"

    // normalizeLinkHref operates on the authored label, not pre-split parts.
    // For self-refs (label starts with `#`) it produces a `#fragment` href.
    let href: string
    try {
      href = normalizeLinkHref("wiki", target)
    } catch {
      continue // empty/invalid label
    }

    out.push({
      target: path,
      heading,
      text: (rawAlias ?? path).trim() || path,
      type: "wiki",
      rel,
      href,
      offset: lineStart + (m.index ?? 0),
    })
  }
}

function scanMd(line: string, lineStart: number, out: ExtractedLink[]): void {
  MD_LINK_RE.lastIndex = 0
  for (let m = MD_LINK_RE.exec(line); m !== null; m = MD_LINK_RE.exec(line)) {
    const [, rawText, rawTarget] = m
    const text = (rawText ?? "").trim()
    const target = (rawTarget ?? "").trim()
    if (!target) continue

    const { path, heading } = splitMdTarget(target)

    // normalizeLinkHref with form=mdlink is a pass-through for URL-shaped
    // targets and self-refs. For relative paths like `./alpha.md#sec`, the
    // target is not a wiki label — mdlink form preserves it unchanged.
    let href: string
    try {
      href = normalizeLinkHref("mdlink", target)
    } catch {
      continue
    }

    out.push({
      target: path,
      heading,
      text: text || path,
      type: "md",
      rel: "link",
      href,
      offset: lineStart + (m.index ?? 0),
    })
  }
}

function scanMentions(line: string, lineStart: number, out: ExtractedLink[]): void {
  MENTION_RE.lastIndex = 0
  for (let m = MENTION_RE.exec(line); m !== null; m = MENTION_RE.exec(line)) {
    const [, boundary, name] = m
    if (!name) continue
    const label = `@${name}`
    const start = (m.index ?? 0) + (boundary?.length ?? 0)
    out.push({
      target: label,
      type: "mention",
      rel: "link",
      href: normalizeLinkHref("bare", label),
      offset: lineStart + start,
    })
  }
}

function scanTags(line: string, lineStart: number, out: ExtractedLink[]): void {
  TAG_RE.lastIndex = 0
  for (let m = TAG_RE.exec(line); m !== null; m = TAG_RE.exec(line)) {
    const [, boundary, name] = m
    if (!name) continue
    const label = `#${name}`
    const start = (m.index ?? 0) + (boundary?.length ?? 0)
    out.push({
      target: label,
      type: "tag",
      rel: "link",
      href: normalizeLinkHref("bare", label),
      offset: lineStart + start,
    })
  }
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Split a wiki-link label into path + heading per klink rules:
 *   - leading `#` → pure self-ref (path="", heading="rest")
 *   - first `#` at index > 0 → path/heading split
 *   - no `#` but `^blockid` → path="before caret", heading="^blockid"
 *   - no split markers → path=label, heading=undefined
 */
function splitWikiTarget(label: string): { path: string; heading?: string } {
  if (label.startsWith("#")) {
    return { path: "", heading: label.slice(1) }
  }
  const hash = label.indexOf("#", 1)
  if (hash > 0) {
    return { path: label.slice(0, hash), heading: label.slice(hash + 1) }
  }
  const caret = label.indexOf("^")
  if (caret > 0) {
    return { path: label.slice(0, caret), heading: label.slice(caret) }
  }
  return { path: label }
}

/**
 * Split an md-link target into path + heading (the fragment after `#`).
 *   - leading `#` → self-ref (path="", heading="rest")
 *   - external URL (http://, mailto:, etc.) → no split, heading=undefined
 *   - otherwise → first `#` splits
 */
function splitMdTarget(target: string): { path: string; heading?: string } {
  if (target.startsWith("#")) {
    return { path: "", heading: target.slice(1) }
  }
  // External schemes: leave as-is; fragments inside URLs are rarely used as
  // km anchors, and treating them as km headings would produce wrong backlinks.
  if (/^(https?|mailto|ftp|sftp|ftps|file|data|tel|ssh):/i.test(target)) {
    return { path: target }
  }
  const hash = target.indexOf("#")
  if (hash > 0) {
    return { path: target.slice(0, hash), heading: target.slice(hash + 1) }
  }
  return { path: target }
}
