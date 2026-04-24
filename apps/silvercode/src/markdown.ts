/**
 * Markdown bridge: mdast → MdBlock[] / MdInline[] (consumed by MarkdownView).
 *
 * The previous implementation was a regex tokenizer. It handled the easy cases
 * (heading, paragraph, bullet, fenced code) but fell over on nested emphasis
 * (`**_bold italic_**`), fenced code inside list items, and tables with inline
 * markup inside cells. We now go through `@km/markdown` (mdast-util-from-markdown
 * + GFM extensions), which gives us a real AST, and project that down to the
 * lightweight shapes the TUI renders.
 *
 * Streaming: assistant deltas can arrive as partial markdown (unclosed `**`,
 * half-written code fence, etc.). `parseMarkdown` is lenient — the underlying
 * micromark tokenizer recovers gracefully for most shapes — but we still wrap
 * the call in a try/catch and fall back to a single-paragraph block so a
 * pathological partial never breaks the render path.
 */

import type {
  Root,
  RootContent,
  BlockContent,
  DefinitionContent,
  PhrasingContent,
  ListItem as MdListItem,
  List as MdList,
} from "mdast"
import { parseMarkdown } from "@km/markdown"

export type MdBlock =
  | { kind: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; text: string }
  | { kind: "bullet"; depth: number; text: string }
  | { kind: "ordered"; depth: number; number: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; language: string; code: string }
  | { kind: "rule" }
  | { kind: "paragraph"; text: string }
  | { kind: "blank" }
  | {
      kind: "table"
      headers: string[]
      rows: string[][]
      alignments: Array<"left" | "right" | "center" | null>
    }

export type MdInline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "code"; text: string }
  | { kind: "link"; text: string; href: string }

// ---------------------------------------------------------------------------
// Inline projection — phrasing content → MdInline[]
// ---------------------------------------------------------------------------

/**
 * Flatten mdast phrasing content into a flat string. Retains the visible text
 * only — formatting is captured separately by the inline projector. Used both
 * for inline extraction (via parseInline) and for block-level text collapsing
 * (headings, list items, table cells, blockquote bodies).
 */
function phrasingToString(nodes: readonly PhrasingContent[] | undefined): string {
  if (!nodes) return ""
  let out = ""
  for (const n of nodes) {
    out += phrasingNodeToString(n)
  }
  return out
}

function phrasingNodeToString(node: PhrasingContent): string {
  switch (node.type) {
    case "text":
      return node.value
    case "inlineCode":
      return node.value
    case "strong":
    case "emphasis":
    case "delete":
    case "link":
    case "linkReference":
      return phrasingToString(node.children as PhrasingContent[])
    case "break":
      return " "
    case "image":
    case "imageReference":
      return (node as { alt?: string | null }).alt ?? ""
    default:
      // Unknown phrasing shapes (html, footnoteReference, extensions): best-effort.
      if ("value" in node && typeof (node as { value?: unknown }).value === "string") {
        return (node as { value: string }).value
      }
      if ("children" in node && Array.isArray((node as { children?: unknown }).children)) {
        return phrasingToString((node as { children: PhrasingContent[] }).children)
      }
      return ""
  }
}

/**
 * Project mdast phrasing content into a flat array of MdInline tokens.
 *
 * Nesting collapse rule: the existing MdInline shape is flat (no recursion),
 * so nested emphasis like `**_bold italic_**` becomes a single bold token. We
 * prefer preserving the outermost semantic (bold wins over inner italic) —
 * this matches the previous regex tokenizer's behaviour on the easy cases
 * and is strictly better on the edge cases it used to drop.
 */
export function phrasingToInline(nodes: readonly PhrasingContent[] | undefined): MdInline[] {
  if (!nodes || nodes.length === 0) return [{ kind: "text", text: "" }]
  const out: MdInline[] = []
  for (const n of nodes) {
    appendInline(out, n)
  }
  if (out.length === 0) out.push({ kind: "text", text: "" })
  return mergeAdjacentText(out)
}

function appendInline(out: MdInline[], node: PhrasingContent): void {
  switch (node.type) {
    case "text":
      out.push({ kind: "text", text: node.value })
      return
    case "inlineCode":
      out.push({ kind: "code", text: node.value })
      return
    case "strong":
      out.push({ kind: "bold", text: phrasingToString(node.children as PhrasingContent[]) })
      return
    case "emphasis":
      out.push({ kind: "italic", text: phrasingToString(node.children as PhrasingContent[]) })
      return
    case "delete":
      // No dedicated strikethrough token — render as plain text so we don't lose
      // the content.
      out.push({ kind: "text", text: phrasingToString(node.children as PhrasingContent[]) })
      return
    case "link":
      out.push({
        kind: "link",
        text: phrasingToString(node.children as PhrasingContent[]),
        href: node.url,
      })
      return
    case "break":
      out.push({ kind: "text", text: " " })
      return
    case "image":
      out.push({ kind: "text", text: node.alt ?? "" })
      return
    default: {
      const text = phrasingNodeToString(node)
      if (text.length > 0) out.push({ kind: "text", text })
    }
  }
}

function mergeAdjacentText(tokens: MdInline[]): MdInline[] {
  const out: MdInline[] = []
  for (const t of tokens) {
    const prev = out[out.length - 1]
    if (t.kind === "text" && prev && prev.kind === "text") {
      prev.text += t.text
    } else {
      out.push(t)
    }
  }
  return out
}

/**
 * Backwards-compatible inline parser: string → MdInline[].
 *
 * Pipes through the real markdown parser so nested emphasis, strikethrough,
 * and autolinks all work. Callers that already have phrasing content should
 * prefer phrasingToInline directly.
 */
export function parseInline(text: string): MdInline[] {
  const root = safeParse(text)
  // Pull the first paragraph's children (the common case for inline-only input).
  const first = root.children[0]
  if (first && first.type === "paragraph") {
    return phrasingToInline(first.children)
  }
  // Fallback: treat everything as raw text.
  return [{ kind: "text", text }]
}

// ---------------------------------------------------------------------------
// Block projection — mdast Root → MdBlock[]
// ---------------------------------------------------------------------------

export function parseBlocks(source: string): MdBlock[] {
  if (source.length === 0) return []
  const root = safeParse(source)
  const blocks: MdBlock[] = []
  projectContent(root.children, blocks, /* listDepth */ 0)
  return blocks
}

function safeParse(source: string): Root {
  try {
    return parseMarkdown(source)
  } catch {
    // Streaming partials can in theory still blow up some extensions. Fall
    // back to a single text paragraph so the UI keeps rendering.
    return {
      type: "root",
      children: [{ type: "paragraph", children: [{ type: "text", value: source }] }],
    }
  }
}

type TopLevelContent = RootContent | BlockContent | DefinitionContent

function projectContent(nodes: readonly TopLevelContent[], out: MdBlock[], listDepth: number): void {
  for (const node of nodes) {
    projectNode(node, out, listDepth)
  }
}

function projectNode(node: TopLevelContent, out: MdBlock[], listDepth: number): void {
  switch (node.type) {
    case "heading": {
      const level = Math.min(6, Math.max(1, node.depth)) as 1 | 2 | 3 | 4 | 5 | 6
      out.push({ kind: "heading", level, text: phrasingToString(node.children) })
      return
    }
    case "paragraph": {
      out.push({ kind: "paragraph", text: phrasingToString(node.children) })
      return
    }
    case "code": {
      out.push({ kind: "code", language: node.lang ?? "", code: node.value })
      return
    }
    case "thematicBreak": {
      out.push({ kind: "rule" })
      return
    }
    case "blockquote": {
      // Flatten blockquote body to a single line of text (matches prior shape).
      out.push({ kind: "quote", text: blockquoteToString(node.children) })
      return
    }
    case "list": {
      projectList(node, out, listDepth)
      return
    }
    case "table": {
      projectTable(node, out)
      return
    }
    case "html": {
      // Raw HTML: surface the literal so nothing disappears silently.
      out.push({ kind: "paragraph", text: node.value })
      return
    }
    default: {
      // Definitions, footnotes, extension nodes: serialize any textual payload
      // we can recover, otherwise skip. Never drop silently for nodes that
      // carry a `.value`.
      if ("value" in node && typeof (node as { value?: unknown }).value === "string") {
        const v = (node as { value: string }).value
        if (v.length > 0) out.push({ kind: "paragraph", text: v })
      }
    }
  }
}

function blockquoteToString(children: readonly TopLevelContent[]): string {
  const parts: string[] = []
  for (const child of children) {
    if (child.type === "paragraph") {
      parts.push(phrasingToString(child.children))
    } else if (child.type === "heading") {
      parts.push(phrasingToString(child.children))
    } else if ("children" in child && Array.isArray((child as { children?: unknown }).children)) {
      // Nested content inside a blockquote — flatten one more level.
      const inner: MdBlock[] = []
      projectContent((child as { children: TopLevelContent[] }).children, inner, 0)
      for (const b of inner) {
        if ("text" in b) parts.push(b.text)
      }
    }
  }
  return parts.join(" ")
}

function projectList(list: MdList, out: MdBlock[], listDepth: number): void {
  const ordered = list.ordered === true
  let counter = list.start ?? 1
  for (const item of list.children) {
    if (item.type !== "listItem") continue
    projectListItem(item, out, listDepth, ordered, counter)
    if (ordered) counter++
  }
}

function projectListItem(
  item: MdListItem,
  out: MdBlock[],
  listDepth: number,
  ordered: boolean,
  number: number,
): void {
  // First child is typically the item's text — project it as the list entry.
  // Subsequent children (nested list, code fence, paragraph continuation)
  // become their own blocks at the appropriate depth.
  let first = true
  for (const child of item.children) {
    if (first && child.type === "paragraph") {
      const text = phrasingToString(child.children)
      if (ordered) {
        out.push({ kind: "ordered", depth: listDepth, number, text })
      } else {
        out.push({ kind: "bullet", depth: listDepth, text })
      }
      first = false
      continue
    }
    if (first) {
      // Non-paragraph first child (e.g. a nested list). Emit an empty marker
      // so the ordering/bullet is still visible.
      if (ordered) {
        out.push({ kind: "ordered", depth: listDepth, number, text: "" })
      } else {
        out.push({ kind: "bullet", depth: listDepth, text: "" })
      }
      first = false
    }
    if (child.type === "list") {
      projectList(child, out, listDepth + 1)
    } else {
      projectNode(child as TopLevelContent, out, listDepth + 1)
    }
  }
  if (first) {
    // Empty item — still surface the marker.
    if (ordered) {
      out.push({ kind: "ordered", depth: listDepth, number, text: "" })
    } else {
      out.push({ kind: "bullet", depth: listDepth, text: "" })
    }
  }
}

// mdast GFM table shape (mdast-util-gfm-table extends Root with this).
interface MdTable {
  type: "table"
  align?: Array<"left" | "right" | "center" | null> | null
  children: MdTableRow[]
}
interface MdTableRow {
  type: "tableRow"
  children: MdTableCell[]
}
interface MdTableCell {
  type: "tableCell"
  children: PhrasingContent[]
}

function projectTable(node: unknown, out: MdBlock[]): void {
  const table = node as MdTable
  const rows = table.children ?? []
  if (rows.length === 0) {
    out.push({ kind: "table", headers: [], rows: [], alignments: [] })
    return
  }
  const headerRow = rows[0]
  const bodyRows = rows.slice(1)
  const headers = (headerRow?.children ?? []).map((cell) => phrasingToString(cell.children))
  const body = bodyRows.map((r) => r.children.map((cell) => phrasingToString(cell.children)))
  const alignments: Array<"left" | "right" | "center" | null> = headers.map((_, col) => {
    const a = table.align?.[col] ?? null
    return a === "left" || a === "right" || a === "center" ? a : null
  })
  out.push({ kind: "table", headers, rows: body, alignments })
}
