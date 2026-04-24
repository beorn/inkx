import React from "react"
import { Box, Text } from "silvery"

/**
 * M8 — tiny keyword-based colorizer.
 *
 * Shiki-backed `@silvery/syntax` is the target implementation; shipping a
 * standalone Shiki wrapper + grammar bundle is out of scope for M0. This
 * module is the seed: it highlights common language keywords, strings, and
 * comments in enough colour to feel like real syntax, and swaps to Shiki
 * transparently when that package lands.
 */

const LANG_KEYWORDS: Record<string, string[]> = {
  ts: [
    "const",
    "let",
    "var",
    "function",
    "async",
    "await",
    "return",
    "if",
    "else",
    "export",
    "import",
    "from",
    "as",
    "type",
    "interface",
    "class",
    "extends",
    "implements",
    "new",
    "for",
    "while",
    "do",
    "break",
    "continue",
    "switch",
    "case",
    "default",
    "try",
    "catch",
    "finally",
    "throw",
    "this",
    "super",
    "null",
    "undefined",
    "true",
    "false",
    "void",
  ],
  tsx: [
    "const",
    "let",
    "var",
    "function",
    "async",
    "await",
    "return",
    "if",
    "else",
    "export",
    "import",
    "from",
    "as",
    "type",
    "interface",
    "class",
    "extends",
    "new",
  ],
  js: [
    "const",
    "let",
    "var",
    "function",
    "async",
    "await",
    "return",
    "if",
    "else",
    "export",
    "import",
    "from",
    "as",
    "class",
    "extends",
    "new",
  ],
  py: [
    "def",
    "class",
    "return",
    "if",
    "elif",
    "else",
    "for",
    "while",
    "import",
    "from",
    "as",
    "pass",
    "break",
    "continue",
    "lambda",
    "with",
    "yield",
    "raise",
    "try",
    "except",
    "finally",
    "True",
    "False",
    "None",
    "self",
  ],
  rs: [
    "fn",
    "let",
    "mut",
    "const",
    "pub",
    "use",
    "mod",
    "struct",
    "enum",
    "impl",
    "trait",
    "match",
    "if",
    "else",
    "for",
    "while",
    "return",
    "self",
    "Self",
    "async",
    "await",
    "move",
    "crate",
    "ref",
  ],
  go: [
    "func",
    "var",
    "const",
    "package",
    "import",
    "type",
    "struct",
    "interface",
    "return",
    "if",
    "else",
    "for",
    "range",
    "switch",
    "case",
    "default",
    "go",
    "chan",
    "map",
  ],
  sh: [
    "if",
    "fi",
    "then",
    "else",
    "elif",
    "for",
    "while",
    "do",
    "done",
    "function",
    "return",
    "export",
    "local",
    "case",
    "esac",
    "in",
  ],
  bash: [
    "if",
    "fi",
    "then",
    "else",
    "elif",
    "for",
    "while",
    "do",
    "done",
    "function",
    "return",
    "export",
    "local",
    "case",
    "esac",
    "in",
  ],
  sql: [
    "SELECT",
    "FROM",
    "WHERE",
    "INSERT",
    "INTO",
    "UPDATE",
    "DELETE",
    "CREATE",
    "TABLE",
    "INDEX",
    "DROP",
    "ALTER",
    "JOIN",
    "LEFT",
    "RIGHT",
    "INNER",
    "OUTER",
    "ON",
    "AS",
    "GROUP",
    "BY",
    "ORDER",
    "LIMIT",
    "OFFSET",
    "HAVING",
  ],
  json: [],
  md: [],
  yaml: [],
  plain: [],
}

function tokenize(line: string, keywords: string[]): Array<{ text: string; color?: string }> {
  // Comment tokens (rudimentary): `//`, `#` at start-of-line.
  if (/^\s*\/\//.test(line) || /^\s*#/.test(line)) {
    return [{ text: line, color: "$muted" }]
  }
  const tokens: Array<{ text: string; color?: string }> = []
  let buf = ""
  let i = 0
  while (i < line.length) {
    const ch = line[i]!
    if (ch === '"' || ch === "'" || ch === "`") {
      if (buf.length > 0) {
        tokens.push(...splitWords(buf, keywords))
        buf = ""
      }
      const quote = ch
      let str = quote
      i++
      while (i < line.length && line[i] !== quote) {
        const curr = line[i] ?? ""
        const nxt = line[i + 1] ?? ""
        if (curr === "\\" && i + 1 < line.length) {
          str += curr + nxt
          i += 2
          continue
        }
        str += curr
        i++
      }
      if (i < line.length) str += line[i] ?? ""
      i++
      tokens.push({ text: str, color: "$success" })
      continue
    }
    buf += ch
    i++
  }
  if (buf.length > 0) tokens.push(...splitWords(buf, keywords))
  return tokens
}

function splitWords(seg: string, keywords: string[]): Array<{ text: string; color?: string }> {
  const parts: Array<{ text: string; color?: string }> = []
  const re = /([A-Za-z_][A-Za-z0-9_]*)|([^A-Za-z_]+)/g
  for (const m of seg.matchAll(re)) {
    const word = m[1]
    const other = m[2]
    if (word) {
      if (keywords.includes(word)) parts.push({ text: word, color: "$accent" })
      else if (/^\d+$/.test(word)) parts.push({ text: word, color: "$info" })
      else parts.push({ text: word })
    } else if (other) {
      parts.push({ text: other })
    }
  }
  return parts
}

export function SyntaxHighlighter({ language, code }: { language: string; code: string }): React.ReactElement {
  const lang = (language || "plain").toLowerCase()
  const keywords = LANG_KEYWORDS[lang] ?? []
  const lines = code.split("\n")
  return (
    <Box
      flexDirection="column"
      paddingX={1}
      backgroundColor="$surfacebg"
      borderStyle="single"
      borderColor="$border"
      minWidth={0}
      overflow="hidden"
    >
      <Box flexDirection="row">
        <Text color="$muted">{lang}</Text>
      </Box>
      {lines.map((line, i) => {
        const tokens = tokenize(line, keywords)
        // overflow=hidden + minWidth=0 on each row so a long code line
        // clips at the right edge instead of expanding the card outward
        // (which pushes the side panel off-screen).
        return (
          <Box key={i} flexDirection="row" minWidth={0} overflow="hidden">
            {tokens.map((t, j) => (
              <Text key={j} color={t.color}>
                {t.text}
              </Text>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
