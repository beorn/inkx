/**
 * Tiny, deliberately-naive markdown tokenizer.
 *
 * M7 calls for `@silvery/markdown` (proper mdast → silvery bridge). This
 * module is the in-app seed — good enough to render bold/italic/inline-code,
 * headings, bullet lists, blockquotes, and fenced code blocks for streaming
 * assistant output. When @silvery/markdown ships, MarkdownView swaps to it
 * with no component-level changes.
 */

export type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "bullet"; depth: number; text: string }
  | { kind: "ordered"; depth: number; number: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; language: string; code: string }
  | { kind: "rule" }
  | { kind: "paragraph"; text: string }
  | { kind: "blank" }
  | { kind: "table"; headers: string[]; rows: string[][]; alignments: Array<"left" | "right" | "center" | null> }

export type MdInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }

const INLINE_RE = /(\*\*(?:[^*]+)\*\*)|(\*(?:[^*]+)\*)|(`[^`]+`)|(\[[^\]]+\]\([^)]+\))/g

export function parseInline(text: string): MdInline[] {
  const tokens: MdInline[] = []
  let cursor = 0
  for (const m of text.matchAll(INLINE_RE)) {
    const idx = m.index ?? 0
    if (idx > cursor) tokens.push({ kind: "text", text: text.slice(cursor, idx) })
    const match = m[0]
    if (match.startsWith("**")) {
      tokens.push({ kind: "bold", text: match.slice(2, -2) })
    } else if (match.startsWith("*")) {
      tokens.push({ kind: "italic", text: match.slice(1, -1) })
    } else if (match.startsWith("`")) {
      tokens.push({ kind: "code", text: match.slice(1, -1) })
    } else if (match.startsWith("[")) {
      const close = match.indexOf("](")
      const link = match.slice(1, close)
      const href = match.slice(close + 2, -1)
      tokens.push({ kind: "link", text: link, href })
    }
    cursor = idx + match.length
  }
  if (cursor < text.length) tokens.push({ kind: "text", text: text.slice(cursor) })
  if (tokens.length === 0) tokens.push({ kind: "text", text })
  return tokens
}

export function parseBlocks(source: string): MdBlock[] {
  const lines = source.split("\n")
  const blocks: MdBlock[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i] ?? ""
    const trimmed = line.trim()

    if (trimmed.length === 0) {
      blocks.push({ kind: "blank" })
      i++
      continue
    }

    if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
      blocks.push({ kind: "rule" })
      i++
      continue
    }

    // Fenced code block
    const fence = trimmed.match(/^(```+)(\s*([\w+-]+))?$/)
    if (fence) {
      const fenceStr = fence[1] ?? "```"
      const language = fence[3] ?? ""
      const codeLines: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith(fenceStr)) {
        codeLines.push(lines[i] ?? "")
        i++
      }
      // Skip closing fence if present
      if (i < lines.length) i++
      blocks.push({ kind: "code", language, code: codeLines.join("\n") })
      continue
    }

    // Headings
    const heading = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      const level = Math.min(6, heading[1]!.length) as 1 | 2 | 3 | 4 | 5 | 6
      blocks.push({ kind: "heading", level, text: heading[2] ?? "" })
      i++
      continue
    }

    // Blockquote
    if (trimmed.startsWith(">")) {
      blocks.push({ kind: "quote", text: trimmed.replace(/^>\s?/, "") })
      i++
      continue
    }

    // Bullet list
    const bullet = line.match(/^(\s*)([-*+])\s+(.*)$/)
    if (bullet) {
      const depth = Math.floor((bullet[1]?.length ?? 0) / 2)
      blocks.push({ kind: "bullet", depth, text: bullet[3] ?? "" })
      i++
      continue
    }

    // Ordered list
    const ordered = line.match(/^(\s*)(\d+)\.\s+(.*)$/)
    if (ordered) {
      const depth = Math.floor((ordered[1]?.length ?? 0) / 2)
      blocks.push({ kind: "ordered", depth, number: Number(ordered[2] ?? 0), text: ordered[3] ?? "" })
      i++
      continue
    }

    // Tables: require a header row + separator row of dashes
    const tableHeaderCells = line.includes("|") ? line.split("|").map((s) => s.trim()) : null
    const separatorLine = lines[i + 1] ?? ""
    const isTable =
      tableHeaderCells &&
      tableHeaderCells.length >= 2 &&
      /^\s*\|?[-:|\s]+\|?\s*$/.test(separatorLine)
    if (isTable) {
      const cells = tableHeaderCells.filter((c, idx, arr) => !(idx === 0 && c === "") && !(idx === arr.length - 1 && c === ""))
      const separators = separatorLine.split("|").map((s) => s.trim()).filter((s) => s.length > 0)
      const alignments = separators.map((s) => {
        if (s.startsWith(":") && s.endsWith(":")) return "center" as const
        if (s.endsWith(":")) return "right" as const
        if (s.startsWith(":")) return "left" as const
        return null
      })
      const rows: string[][] = []
      i += 2
      while (i < lines.length && (lines[i] ?? "").includes("|")) {
        const row = (lines[i] ?? "")
          .split("|")
          .map((s) => s.trim())
        rows.push(row.filter((c, idx, arr) => !(idx === 0 && c === "") && !(idx === arr.length - 1 && c === "")))
        i++
      }
      blocks.push({ kind: "table", headers: cells, rows, alignments })
      continue
    }

    // Paragraph (gather consecutive non-empty lines)
    const paragraphLines: string[] = [line]
    i++
    while (i < lines.length && (lines[i] ?? "").trim().length > 0 && !/^(#{1,6})\s/.test(lines[i] ?? "")) {
      paragraphLines.push(lines[i] ?? "")
      i++
    }
    blocks.push({ kind: "paragraph", text: paragraphLines.join(" ") })
  }

  return blocks
}
