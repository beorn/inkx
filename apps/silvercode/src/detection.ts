/**
 * M9 — detect bead IDs, file paths, km node refs, code-fence locations
 * inline within assistant text and tool output.
 *
 * Detection runs once per rendered block (text). Each match becomes a
 * hoverable token; the popover renders content sourced from the corresponding
 * `resolver`. Resolvers are async — the popover shows a spinner until content
 * arrives.
 *
 * URL detection lives in `@km/autolinks/match` (`virtualUrlDetections`) and
 * flows through the handler registry; it is NOT a builtin here. See
 * `bd-km-silvercode.url-detection-via-handlers`.
 */

import type { Detection as AutolinksDetection } from "@km/autolinks"

export type DetectionKind = "bead" | "file" | "km-node" | "code-ref" | "autolink" | "data-image"

/**
 * silvercode's narrower `Detection` shape — the same structural type as
 * `@km/autolinks`'s generic `Detection`, with `kind` constrained to
 * silvercode's vocabulary. Because the package's `Detection<K>` is generic
 * over `kind`, silvercode's value-level Detections flow through
 * `mergeDetections` without an explicit cast.
 */
export type Detection = AutolinksDetection<DetectionKind>

/** Bead identifiers of the form `bd-<scope>.<slug>`, `bd:<id>`, `km-<scope>.<slug>`. */
const BEAD_RE = /\b(?:bd[-:]|km-)[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\b/g

/**
 * Absolute and tilde paths. Captures optional `:line[:col]` suffix.
 *
 * The `\/…` branch is gated by:
 *   1. Negative lookbehind — leading `/` must be at start-of-string or
 *      preceded by a non-word character. Without this, compound paths like
 *      `vendor/silvery` would match `/silvery` as a "file" mid-token.
 *   2. Required separator after the first segment — the path must contain
 *      a second `/` or a `.` so single-segment slash-commands like `/help`,
 *      `/quit`, `/inbox` don't render as paths. Real paths (`/Users/foo`,
 *      `/main.ts`) all have either another `/` or an extension `.`.
 */
const FILE_RE = /(~[A-Za-z0-9/_.-]+|(?<![A-Za-z0-9_])\/[A-Za-z0-9_-]+[/.][A-Za-z0-9/_.-]+)(?::(\d+)(?::(\d+))?)?/g

/** km node refs: #id or @mention. */
const KM_REF_RE = /(?:^|\s)(?:#|@)([A-Za-z][A-Za-z0-9_-]{2,})/g

/** file:line code refs inside backticks or prose. */
const CODE_REF_RE = /\b([\w/.-]+\.(?:ts|tsx|js|jsx|py|rs|go|md|json)):(\d+)(?::(\d+))?/g

/**
 * Relative paths in tool output (e.g. `apps/silvercode/src/parse.ts`,
 * `./foo`, `src/main.tsx`). Matches when:
 *   - Optional `./` or `../` prefix
 *   - At least one `/` separator (so single tokens like `package.json`
 *     or floating-point literals like `3.14` don't match)
 *   - Recognized source-file extension (keeps prose like `lib/foo.bar`
 *     from being treated as a file when `.bar` isn't a code extension)
 *   - Optional `:line[:col]` suffix
 *
 * Negative lookbehind keeps mid-token matches out — `bun-cache/foo.ts`
 * shouldn't ALSO match `cache/foo.ts` starting at `c`.
 */
// Extensions ordered longest-first so the alternation never stops short
// (e.g. `bar.json` → `bar.js`, `file.tsx` → `file.ts`). Trailing `\b`
// pins the end of the extension as a word boundary so we don't gobble
// adjacent word chars (`bar.jsonc` won't match anything when `jsonc`
// isn't in the list, instead of matching `.json` and leaving `c`).
const RELATIVE_PATH_RE =
  /(?<![A-Za-z0-9_/.])(?:\.{1,2}\/)?[A-Za-z0-9_-][\w./-]*\/[\w./-]+\.(?:tsx|jsx|mjs|cjs|mdx|json|toml|yaml|html|ts|js|py|rs|go|md|yml|sh|sql|txt|css)\b(?::(\d+)(?::(\d+))?)?/g

/**
 * Bare filenames (`package.json`, `screenshot.png`) in markdown/prose. This
 * intentionally requires a known extension so ordinary dotted prose and
 * decimal numbers do not turn into links.
 */
const BARE_FILE_RE =
  /(?<![A-Za-z0-9_/.])[\w.-]+\.(?:tsx|jsx|mjs|cjs|mdx|json|toml|yaml|html|png|jpe?g|gif|webp|svg|log|ts|js|py|rs|go|md|yml|sh|sql|txt|css)\b(?::(\d+)(?::(\d+))?)?/g

/**
 * Plain URL matcher. Used here only to *exclude* URL ranges from the file
 * detector — `/path/segment` inside `https://host/path/segment` would
 * otherwise trip FILE_RE. URL detections themselves are produced by
 * `@km/autolinks/match:virtualUrlDetections` and routed through the handler
 * registry.
 */
const URL_EXCLUDE_RE = /\bhttps?:\/\/[^\s)\]]+/g
const DATA_IMAGE_RE = /\bdata:(image\/[A-Za-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)/g
const VIEW_IMAGE_PATH_RE = /\bView\s+((?:~[A-Za-z0-9_-]+|~\/|\/)[^\n]*?\.(?:png|jpe?g|gif|webp))\b/gi

export function detectReferences(text: string): Detection[] {
  const out: Detection[] = []
  if (text.length === 0) return out

  // Compute URL ranges up front so file detections can skip them. We don't
  // emit a `url` kind here — that lives in the autolinks virtual path —
  // but we still need to mask URL spans so the file detector doesn't claim
  // `/path/to/something` inside `https://host/path/to/something`.
  const urlRanges: ReadonlyArray<readonly [number, number]> = (() => {
    const ranges: [number, number][] = []
    for (const m of text.matchAll(URL_EXCLUDE_RE)) {
      const idx = m.index ?? 0
      ranges.push([idx, idx + m[0].length])
    }
    return ranges
  })()
  const insideURL = (start: number, end: number): boolean => urlRanges.some(([s, e]) => start >= s && end <= e)

  for (const m of text.matchAll(DATA_IMAGE_RE)) {
    const idx = m.index ?? 0
    out.push({
      kind: "data-image",
      match: m[0],
      start: idx,
      end: idx + m[0].length,
      payload: { mimeType: m[1] ?? "image/png", data: m[2] ?? "" },
    })
  }

  for (const m of text.matchAll(BEAD_RE)) {
    const idx = m.index ?? 0
    out.push({
      kind: "bead",
      match: m[0],
      start: idx,
      end: idx + m[0].length,
      payload: { id: m[0].replace(/^bd:/, "") },
    })
  }
  for (const m of text.matchAll(CODE_REF_RE)) {
    const idx = m.index ?? 0
    out.push({
      kind: "code-ref",
      match: m[0],
      start: idx,
      end: idx + m[0].length,
      payload: { path: m[1] ?? "", line: m[2] ?? "", col: m[3] ?? "" },
    })
  }
  for (const m of text.matchAll(VIEW_IMAGE_PATH_RE)) {
    const fullIdx = m.index ?? 0
    const path = m[1] ?? ""
    const idx = fullIdx + m[0].indexOf(path)
    if (insideURL(idx, idx + path.length)) continue
    out.push({
      kind: "file",
      match: path,
      start: idx,
      end: idx + path.length,
      payload: { path, line: "", col: "" },
    })
  }
  for (const m of text.matchAll(FILE_RE)) {
    const idx = m.index ?? 0
    // Skip if this range is already covered by a code-ref / data image, or
    // sits inside a URL (so `/path` inside `https://host/path` doesn't
    // become a file).
    if (out.some((d) => d.start <= idx && d.end >= idx + m[0].length)) continue
    if (insideURL(idx, idx + m[0].length)) continue
    out.push({
      kind: "file",
      match: m[0],
      start: idx,
      end: idx + m[0].length,
      payload: {
        path: m[1] ?? "",
        line: m[2] ?? "",
        col: m[3] ?? "",
      },
    })
  }
  // Relative paths — emitted as `kind: "file"` with a relative `path`.
  // Resolution to absolute (for `file://` hrefs) happens in `LinkifiedText`
  // via the cwd context; detection.ts stays pure.
  for (const m of text.matchAll(RELATIVE_PATH_RE)) {
    const idx = m.index ?? 0
    if (out.some((d) => d.start <= idx && d.end >= idx + m[0].length)) continue
    if (insideURL(idx, idx + m[0].length)) continue
    // Remove the optional `:line[:col]` suffix from `match` so the visible
    // text on the page matches the raw token, while `payload.line/col`
    // captures the navigation target.
    const line = m[1] ?? ""
    const col = m[2] ?? ""
    const lineSuffixLen = (line ? 1 + line.length : 0) + (col ? 1 + col.length : 0)
    const pathOnly = m[0].slice(0, m[0].length - lineSuffixLen)
    out.push({
      kind: "file",
      match: m[0],
      start: idx,
      end: idx + m[0].length,
      payload: { path: pathOnly, line, col },
    })
  }
  for (const m of text.matchAll(BARE_FILE_RE)) {
    const idx = m.index ?? 0
    if (out.some((d) => d.start <= idx && d.end >= idx + m[0].length)) continue
    if (insideURL(idx, idx + m[0].length)) continue
    const line = m[1] ?? ""
    const col = m[2] ?? ""
    const lineSuffixLen = (line ? 1 + line.length : 0) + (col ? 1 + col.length : 0)
    const pathOnly = m[0].slice(0, m[0].length - lineSuffixLen)
    out.push({
      kind: "file",
      match: m[0],
      start: idx,
      end: idx + m[0].length,
      payload: { path: pathOnly, line, col },
    })
  }
  for (const m of text.matchAll(KM_REF_RE)) {
    // Group 1 captures the ID after #/@; start is the char that preceded it.
    const full = m[0]
    const idx = (m.index ?? 0) + full.indexOf("#") + 1
    if (idx < 0) continue
    out.push({
      kind: "km-node",
      match: m[1] ?? "",
      start: idx - 1,
      end: idx - 1 + full.trim().length,
      payload: { id: m[1] ?? "" },
    })
  }

  // Sort by start, de-overlap: prefer code-ref > bead > file > km-node.
  out.sort((a, b) => a.start - b.start)
  const kept: Detection[] = []
  let cursor = -1
  for (const d of out) {
    if (d.start < cursor) continue
    kept.push(d)
    cursor = d.end
  }
  return kept
}
