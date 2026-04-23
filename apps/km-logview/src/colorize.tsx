import React from "react"
import { Text } from "silvery"

/**
 * Inline syntax highlighter for log body text.
 *
 * Colors (using semantic tokens + palette):
 *   <tag …>          tag name      $color5 (magenta)
 *   attr=             attribute     $color6 (cyan)
 *   "value"           attr value    $color3 (yellow)
 *   "key":            JSON key      $color6 (cyan)
 *   numbers/bool/null JSON literal  $color3 (yellow)
 *   otherwise         plain text    inherit
 *
 * The function returns an array of React.ReactNode so callers can drop the
 * result into a <Text wrap="...">{colorize(s)}</Text>. Nested <Text> inherits
 * the outer wrap and can still be styled (silvery supports this).
 */

type Token =
  | { kind: "text"; text: string }
  | { kind: "tag-open"; name: string; attrs: Attr[]; selfClose: boolean }
  | { kind: "tag-close"; name: string }
  | { kind: "json-key"; key: string }
  | { kind: "json-lit"; text: string } // numbers, true, false, null

interface Attr {
  name: string
  value?: string
}

const TAG_OPEN_RE = /<([a-zA-Z][a-zA-Z0-9_:-]*)([^>]*)>/g
const TAG_CLOSE_RE = /<\/([a-zA-Z][a-zA-Z0-9_:-]*)>/g
const JSON_KEY_RE = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/g
const JSON_LIT_RE = /\b(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g

/** Parse `attr="value" other='x' flag` into structured pieces. */
function parseAttrs(raw: string): Attr[] {
  const attrs: Attr[] = []
  const re = /\s+([a-zA-Z_:][a-zA-Z0-9_:.-]*)(?:=("[^"]*"|'[^']*'|[^\s>]+))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const name = m[1]!
    let value = m[2]
    if (value && (value.startsWith('"') || value.startsWith("'"))) {
      value = value.slice(1, -1)
    }
    attrs.push({ name, value })
  }
  return attrs
}

/** Tokenize the string into a flat list. Scans in multiple passes so nested
 * structures (JSON inside a tag attribute, tag inside JSON string value) are
 * *not* recursively parsed — we only highlight the outer shape. Good enough
 * for log-viewer skimming. */
export function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  while (pos < input.length) {
    // Try close tag first — shorter, less ambiguous.
    TAG_CLOSE_RE.lastIndex = pos
    const cm = TAG_CLOSE_RE.exec(input)
    TAG_OPEN_RE.lastIndex = pos
    const om = TAG_OPEN_RE.exec(input)

    // Pick the nearer of the two.
    const nextTag =
      cm && (!om || cm.index <= om.index) ? cm : om
    const nextTagIndex = nextTag ? nextTag.index : -1

    if (nextTag && nextTagIndex === pos) {
      // Tag starts right here.
      if (nextTag === cm) {
        tokens.push({ kind: "tag-close", name: cm![1]! })
        pos += cm![0].length
      } else {
        const attrsRaw = om![2] ?? ""
        const selfClose = attrsRaw.trimEnd().endsWith("/")
        tokens.push({
          kind: "tag-open",
          name: om![1]!,
          attrs: parseAttrs(attrsRaw),
          selfClose,
        })
        pos += om![0].length
      }
      continue
    }

    // Plain text up to next tag (or end).
    const end = nextTagIndex === -1 ? input.length : nextTagIndex
    const chunk = input.slice(pos, end)
    // Within the chunk, also detect JSON keys + literals so we can highlight them.
    tokens.push(...tokenizePlain(chunk))
    pos = end
  }

  return tokens
}

function tokenizePlain(s: string): Token[] {
  // Interleave JSON-key + JSON-literal matches with text gaps.
  interface Hit {
    start: number
    end: number
    token: Token
  }
  const hits: Hit[] = []
  let m: RegExpExecArray | null

  JSON_KEY_RE.lastIndex = 0
  while ((m = JSON_KEY_RE.exec(s)) !== null) {
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      token: { kind: "json-key", key: m[1]! },
    })
  }
  JSON_LIT_RE.lastIndex = 0
  while ((m = JSON_LIT_RE.exec(s)) !== null) {
    // Skip if overlapping a json-key hit.
    const overlap = hits.some((h) => m!.index >= h.start && m!.index < h.end)
    if (overlap) continue
    hits.push({
      start: m.index,
      end: m.index + m[0].length,
      token: { kind: "json-lit", text: m[0] },
    })
  }
  hits.sort((a, b) => a.start - b.start)

  const out: Token[] = []
  let cursor = 0
  for (const h of hits) {
    if (h.start > cursor) {
      out.push({ kind: "text", text: s.slice(cursor, h.start) })
    }
    out.push(h.token)
    cursor = h.end
  }
  if (cursor < s.length) {
    out.push({ kind: "text", text: s.slice(cursor) })
  }
  return out
}

const C_TAG = "$color5" // magenta
const C_ATTR = "$color6" // cyan
const C_VAL = "$color3" // yellow
const C_BRK = "$fg-muted"
const C_KEY = "$color6" // cyan
const C_LIT = "$color3" // yellow

/** Render colorized tokens. Caller wraps in <Text wrap=...>. */
export function colorize(input: string): React.ReactNode[] {
  const tokens = tokenize(input)
  const nodes: React.ReactNode[] = []
  tokens.forEach((tok, i) => {
    const key = `t${i}`
    if (tok.kind === "text") {
      nodes.push(<Text key={key}>{tok.text}</Text>)
    } else if (tok.kind === "tag-open") {
      nodes.push(
        <Text key={key}>
          <Text color={C_BRK}>{"<"}</Text>
          <Text color={C_TAG}>{tok.name}</Text>
          {tok.attrs.map((a, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: attr position stable within its parent tag
            <Text key={`a${j}`}>
              <Text>{" "}</Text>
              <Text color={C_ATTR}>{a.name}</Text>
              {a.value !== undefined && (
                <>
                  <Text color={C_BRK}>{"=\""}</Text>
                  <Text color={C_VAL}>{a.value}</Text>
                  <Text color={C_BRK}>{"\""}</Text>
                </>
              )}
            </Text>
          ))}
          <Text color={C_BRK}>{tok.selfClose ? " />" : ">"}</Text>
        </Text>,
      )
    } else if (tok.kind === "tag-close") {
      nodes.push(
        <Text key={key}>
          <Text color={C_BRK}>{"</"}</Text>
          <Text color={C_TAG}>{tok.name}</Text>
          <Text color={C_BRK}>{">"}</Text>
        </Text>,
      )
    } else if (tok.kind === "json-key") {
      nodes.push(
        <Text key={key}>
          <Text color={C_BRK}>{"\""}</Text>
          <Text color={C_KEY}>{tok.key}</Text>
          <Text color={C_BRK}>{"\":"}</Text>
        </Text>,
      )
    } else if (tok.kind === "json-lit") {
      nodes.push(
        <Text key={key} color={C_LIT}>
          {tok.text}
        </Text>,
      )
    }
  })
  return nodes
}
