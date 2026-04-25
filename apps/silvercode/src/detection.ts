/**
 * M9 — detect bead IDs, file paths, URLs, km node refs, code-fence locations
 * inline within assistant text and tool output.
 *
 * Detection runs once per rendered block (text). Each match becomes a
 * hoverable token; the popover renders content sourced from the corresponding
 * `resolver`. Resolvers are async — the popover shows a spinner until content
 * arrives.
 */

export type DetectionKind = "bead" | "file" | "url" | "km-node" | "code-ref" | "autolink"

export type Detection = {
  kind: DetectionKind
  /** Matched string exactly as it appeared. */
  match: string
  /** Start/end offsets within the input text. */
  start: number
  end: number
  /** Kind-specific payload used by resolvers. */
  payload: Record<string, string>
}

/** Bead identifiers of the form `bd-<scope>.<slug>`, `bd:<id>`, `km-<scope>.<slug>`. */
const BEAD_RE = /\b(?:bd[-:]|km-)[A-Za-z][A-Za-z0-9-]*(?:\.[A-Za-z0-9-]+)*\b/g

/** Absolute and tilde paths. Captures optional `:line[:col]` suffix. */
const FILE_RE = /(~[A-Za-z0-9/_.-]+|\/[A-Za-z0-9/_.-]+)(?::(\d+)(?::(\d+))?)?/g

/** URLs. */
const URL_RE = /\bhttps?:\/\/[^\s)\]]+/g

/** km node refs: #id or @mention. */
const KM_REF_RE = /(?:^|\s)(?:#|@)([A-Za-z][A-Za-z0-9_-]{2,})/g

/** file:line code refs inside backticks or prose. */
const CODE_REF_RE = /\b([\w/.-]+\.(?:ts|tsx|js|jsx|py|rs|go|md|json)):(\d+)(?::(\d+))?/g

export function detectReferences(text: string): Detection[] {
  const out: Detection[] = []
  if (text.length === 0) return out

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
  for (const m of text.matchAll(URL_RE)) {
    const idx = m.index ?? 0
    out.push({
      kind: "url",
      match: m[0],
      start: idx,
      end: idx + m[0].length,
      payload: { url: m[0] },
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
  for (const m of text.matchAll(FILE_RE)) {
    const idx = m.index ?? 0
    // Skip if this range is already covered by a code-ref or URL.
    if (out.some((d) => d.start <= idx && d.end >= idx + m[0].length)) continue
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

  // Sort by start, de-overlap: prefer code-ref > url > bead > file > km-node.
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
