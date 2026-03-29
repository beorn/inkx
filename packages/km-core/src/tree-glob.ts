/**
 * Tree Glob — zsh-style path glob parser with node qualifiers.
 *
 * Parses patterns like `./inbox/**(.)` into structured data.
 * Consumers translate qualifiers to their context (SQL, filter functions, etc).
 *
 * Qualifiers go inside `(...)` after the glob:
 * - `.` files, `/` folders, `#` sections
 * - `^` negates next qualifier
 * - Multiple qualifiers OR together: `(./)` = files or folders
 *
 * @example
 * parseTreeGlob("./inbox/**(.)") // recursive, files only
 * parseTreeGlob("./inbox/*(./)")  // non-recursive, files or folders
 * parseTreeGlob("./inbox/**(^#)") // recursive, not sections
 */

/** A single qualifier token parsed from the `(...)` suffix. */
export interface GlobQualifier {
  /** What dimension this qualifies */
  type: "fstype"
  /** Matched values (OR semantics) */
  values: string[]
  /** Whether this qualifier is negated (^) */
  negated: boolean
}

/** Result of parsing a tree glob pattern. */
export interface TreeGlob {
  /** Normalized path (no leading `./`, no trailing `/` or glob) */
  path: string
  /** Whether the pattern matches recursively (`**`) */
  recursive: boolean
  /** Parsed qualifiers from `(...)` suffix */
  qualifiers: GlobQualifier[]
  /** Whether the original pattern was negated (`-./inbox`) */
  negated: boolean
}

/** Map single-char qualifier tokens to fstype values. */
const FSTYPE_MAP: Record<string, string[]> = {
  ".": ["file", "mdfile"],
  "/": ["folder"],
  "#": ["mdsection"],
}

/**
 * Parse a tree glob pattern into structured data.
 *
 * Supports:
 * - `./inbox` — recursive (default), path "inbox"
 * - `./inbox/**` — recursive (explicit)
 * - `./inbox/*` — non-recursive (direct children)
 * - `./inbox/**(.)` — recursive, files only
 * - `./inbox/*(^#)` — non-recursive, not sections
 * - `./inbox/**(./)` — recursive, files or folders
 */
export function parseTreeGlob(pattern: string): TreeGlob {
  let p = pattern
  let negated = false

  // Handle negation prefix
  if (p.startsWith("-")) {
    negated = true
    p = p.slice(1)
  }

  // Extract qualifier suffix: everything inside trailing (...)
  let qualifierStr = ""
  const qualMatch = p.match(/\(([^)]*)\)$/)
  if (qualMatch) {
    qualifierStr = qualMatch[1] ?? ""
    p = p.slice(0, -qualMatch[0].length)
  }

  // Determine recursion from glob suffix
  let recursive: boolean
  if (p.endsWith("/**")) {
    recursive = true
    p = p.slice(0, -3)
  } else if (p.endsWith("/*")) {
    recursive = false
    p = p.slice(0, -2)
  } else if (p.endsWith("**")) {
    recursive = true
    p = p.slice(0, -2)
    if (p.endsWith("/")) p = p.slice(0, -1)
  } else {
    // Bare path (./inbox) — recursive by default
    recursive = true
  }

  // Normalize path: strip leading ./ or /
  if (p.startsWith("./")) p = p.slice(2)
  if (p.startsWith("/")) p = p.slice(1)
  if (p.endsWith("/")) p = p.slice(0, -1)

  // Parse qualifiers
  const qualifiers = parseQualifiers(qualifierStr)

  return { path: p, recursive, qualifiers, negated }
}

/**
 * Parse qualifier string (contents of parentheses).
 * Single-char tokens: `.` `/` `#` `^`
 * All non-negated qualifiers OR together within same type.
 */
function parseQualifiers(str: string): GlobQualifier[] {
  if (!str) return []

  const fstypeInclude: string[] = []
  const fstypeExclude: string[] = []
  let negate = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!

    if (ch === "^") {
      negate = true
      continue
    }

    const values = FSTYPE_MAP[ch]
    if (values) {
      if (negate) {
        fstypeExclude.push(...values)
        negate = false
      } else {
        fstypeInclude.push(...values)
      }
      continue
    }

    // Unknown qualifier — skip (future: task qualifiers)
    negate = false
  }

  const result: GlobQualifier[] = []
  if (fstypeInclude.length > 0) {
    result.push({ type: "fstype", values: fstypeInclude, negated: false })
  }
  if (fstypeExclude.length > 0) {
    result.push({ type: "fstype", values: fstypeExclude, negated: true })
  }
  return result
}
