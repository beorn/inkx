/**
 * Sigils — name-prefix characters with semantic meaning.
 *
 * A sigil is part of a node name, not a separate namespace. A node literally
 * named `@Alice` has name `@Alice`; `[[@Alice]]` and `@Alice` both link to
 * that same node.
 *
 * Sigil parsing rule: a sigil character counts as a sigil introducer only
 * when followed by a letter and preceded by a word boundary. This keeps
 * prose like "issue #42", "dial @911", "+4 dB" from becoming accidental
 * links.
 *
 * See docs/design/model/klink.md for the full rationale.
 */

export type SigilChar = "@" | "#" | "+"

export type SigilKind = "person" | "tag" | "project"

export type SigilDefinition = {
  readonly kind: SigilKind
}

/**
 * Recognized sigils. Centralized in source for v1; future work may load
 * from a config file and merge. The `kind` is informational — resolution
 * treats all three identically (sigil is just a name prefix).
 */
export const SIGILS: Readonly<Record<SigilChar, SigilDefinition>> = {
  "@": { kind: "person" },
  "#": { kind: "tag" },
  "+": { kind: "project" },
}

const SIGIL_CHARS: ReadonlySet<string> = new Set(Object.keys(SIGILS))

/**
 * True if `ch` is a recognized sigil character.
 */
export function isSigilChar(ch: string): ch is SigilChar {
  return ch.length === 1 && SIGIL_CHARS.has(ch)
}

/**
 * True if `name` starts with a recognized sigil. Does NOT enforce the
 * letter-after rule — that's for inline parsing, not name classification.
 * A node literally named `#42` would return true here.
 */
export function hasSigilPrefix(name: string): boolean {
  return name.length > 0 && isSigilChar(name.charAt(0))
}

/**
 * Return the sigil char if `name` starts with one, else `null`.
 */
export function getSigilChar(name: string): SigilChar | null {
  if (name.length === 0) return null
  const first = name.charAt(0)
  return isSigilChar(first) ? first : null
}

/**
 * True if the substring starting at position `i` in `text` begins a valid
 * inline sigil link.
 *
 * Rules:
 *   1. `text[i]` is a recognized sigil char.
 *   2. `text[i+1]` exists and is a letter (Unicode letter category).
 *   3. The preceding char (if any) is a word boundary — start of string,
 *      whitespace, or punctuation (but not an identifier character).
 *
 * This rule keeps "issue #42", "+4 dB", "dial @911", "foo#bar" all as
 * literal text while `#urgent`, `@Alice`, `+cleanup` parse as sigils.
 */
export function isInlineSigilStart(text: string, i: number): boolean {
  if (i < 0 || i >= text.length) return false
  if (!isSigilChar(text.charAt(i))) return false

  const next = text.charAt(i + 1)
  if (next === "") return false
  if (!isLetter(next)) return false

  if (i > 0) {
    const prev = text.charAt(i - 1)
    if (isIdentifierChar(prev)) return false
  }

  return true
}

function isLetter(ch: string): boolean {
  return /^\p{L}$/u.test(ch)
}

function isIdentifierChar(ch: string): boolean {
  // Letters, digits, underscore — anything that would make a word-continuation.
  return /^[\p{L}\p{N}_]$/u.test(ch)
}
