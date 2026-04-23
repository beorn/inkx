/* eslint-disable @typescript-eslint/no-non-null-assertion -- codebase idiom: arr[i]! / map.get(k)! / stack.pop()! after surrounding length/has/bounds check; TS noUncheckedIndexedAccess requires the assertion even when invariant is obvious */
/**
 * Tree Glob — zsh-style path glob parser with node qualifiers.
 *
 * Parses patterns like `./inbox/**(.)` into structured data.
 * Consumers translate qualifiers to their context (SQL, filter functions, etc).
 *
 * Three qualifier dimensions — OR within, AND across:
 * - fstype: `.` files, `/` folders
 * - nodetype: `i` outline, `l` list item
 * - task: `t` task, `p` past-due, `w` this-week, `d` has-due, `s` started, `x` done
 * - `^` negates next qualifier
 *
 * @example
 * parseTreeGlob("./inbox/**(.)") // recursive, files only
 * parseTreeGlob("./inbox/**(pw)")  // recursive, overdue OR this-week tasks
 * parseTreeGlob("./inbox/**(.pw)") // recursive, files AND (overdue OR this-week)
 */

/** Qualifier dimension — OR within, AND across */
export type QualifierType = "fstype" | "nodetype" | "task"

/** A single qualifier token parsed from the `(...)` suffix. */
export interface GlobQualifier {
  /** What dimension this qualifies */
  type: QualifierType
  /** Matched values (OR semantics within dimension) */
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

/** Node type qualifiers → nodetype dimension */
const NODETYPE_MAP: Record<string, string> = {
  i: "outline", // outline item (type=h, item=true)
  l: "list", // list item (type=p, item=true)
}

/** Task qualifiers → task dimension */
const TASK_MAP: Record<string, string> = {
  t: "task", // isTask (has item.task)
  p: "past_due", // overdue (due < today, not done)
  w: "this_week", // due this week incl today (not done)
  d: "has_due", // has any due date
  s: "started", // start date passed (not done)
  x: "done", // done or dropped
}

/**
 * Parse qualifier string (contents of parentheses).
 *
 * Three dimensions — OR within, AND across:
 * - fstype: `.` `/` (files, folders)
 * - nodetype: `i` `l` (outline, list item)
 * - task: `t` `p` `w` `d` `s` `x`
 * - `^` negates the next qualifier within its dimension
 */
function parseQualifiers(str: string): GlobQualifier[] {
  if (!str) return []

  const dims: Record<QualifierType, { include: string[]; exclude: string[] }> = {
    fstype: { include: [], exclude: [] },
    nodetype: { include: [], exclude: [] },
    task: { include: [], exclude: [] },
  }
  let negate = false

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]!

    if (ch === "^") {
      negate = true
      continue
    }

    // Check each dimension
    let matched = false

    const fstypeValues = FSTYPE_MAP[ch]
    if (fstypeValues) {
      const bucket = negate ? dims.fstype.exclude : dims.fstype.include
      bucket.push(...fstypeValues)
      matched = true
    }

    if (!matched && NODETYPE_MAP[ch]) {
      const bucket = negate ? dims.nodetype.exclude : dims.nodetype.include
      bucket.push(NODETYPE_MAP[ch]!)
      matched = true
    }

    if (!matched && TASK_MAP[ch]) {
      const bucket = negate ? dims.task.exclude : dims.task.include
      bucket.push(TASK_MAP[ch]!)
      matched = true
    }

    if (matched) negate = false
    else negate = false // unknown char — reset negate
  }

  const result: GlobQualifier[] = []
  for (const [type, { include, exclude }] of Object.entries(dims) as [
    QualifierType,
    { include: string[]; exclude: string[] },
  ][]) {
    if (include.length > 0) result.push({ type, values: include, negated: false })
    if (exclude.length > 0) result.push({ type, values: exclude, negated: true })
  }
  return result
}
