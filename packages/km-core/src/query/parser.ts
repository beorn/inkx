/**
 * Query Language Parser
 *
 * Parses structured queries for task filtering.
 * Pure parsing - no database dependencies.
 *
 * Syntax:
 * - field:value      Filter by field (status:open, priority:1, due:2026-01-20)
 * - @ref             Filter by mention
 * - #tag             Filter by tag
 * - +project         Filter by project
 * - -field:value     Negation (exclude matches)
 * - "phrase"         Quoted phrase search
 * - text             Full-text search
 */

/**
 * Offset information for syntax highlighting
 */
export interface QueryOffset {
  start: number
  end: number
}

/**
 * Parsed query condition
 */
export interface QueryCondition {
  field: string
  op: "=" | "!=" | ">" | "<" | ">=" | "<=" | "LIKE"
  value: string
  negated?: boolean
  offset?: QueryOffset
}

/**
 * Parsed reference filter
 */
export interface QueryRef {
  type: "person" | "tag" | "project"
  value: string
  negated?: boolean
  offset?: QueryOffset
}

/**
 * Path pattern filter
 */
export interface QueryPath {
  pattern: string
  recursive: boolean // True if pattern ends with **
  negated?: boolean
  offset?: QueryOffset
}

/**
 * Text search term with offset
 */
export interface QueryText {
  value: string
  negated?: boolean
  offset?: QueryOffset
}

/**
 * Phrase search with offset
 */
export interface QueryPhrase {
  value: string
  offset?: QueryOffset
}

/**
 * Property condition for inline property queries
 */
export interface QueryPropCondition {
  prop: string
  op: "exists" | "=" | "!=" | ">" | "<" | ">=" | "<="
  value?: string | number
  negated?: boolean
  offset?: QueryOffset
}

/**
 * Special query conditions (blocked, etc.)
 */
export interface QuerySpecial {
  type: "blocked"
  value: boolean
  offset?: QueryOffset
}

/**
 * Parsed query AST
 */
export interface QueryAST {
  conditions: QueryCondition[]
  refs: QueryRef[]
  paths: QueryPath[] // Path pattern filters
  propConditions: QueryPropCondition[] // Inline property queries
  specials: QuerySpecial[] // Special conditions like blocked:true
  text: string[] // Backwards compatible - plain text values
  phrases: string[] // Backwards compatible - plain phrase values
  textTerms: QueryText[] // Text with offsets
  phraseTerms: QueryPhrase[] // Phrases with offsets
}

/**
 * Field alias mappings
 */
const FIELD_ALIASES: Record<string, string> = {
  status: "task_status",
  priority: "priority",
  p: "priority",
  due: "due_date",
  start: "scheduled_date",
  scheduled: "scheduled_date",
  assigned: "assigned_to",
  type: "type",
}

/**
 * Map common field aliases to canonical names
 */
export function mapFieldName(field: string): string {
  return FIELD_ALIASES[field.toLowerCase()] ?? field
}

/**
 * Token with position information
 */
interface TokenInfo {
  value: string
  start: number
  end: number
  isPhrase: boolean
}

/**
 * Parse a query string into an AST
 */
export function parseQuery(query: string): QueryAST {
  const ast: QueryAST = {
    conditions: [],
    refs: [],
    paths: [],
    propConditions: [],
    specials: [],
    text: [],
    phrases: [],
    textTerms: [],
    phraseTerms: [],
  }

  if (!query || query.trim() === "") {
    return ast
  }

  // Tokenize by splitting on whitespace, but preserve quoted strings
  // Track positions for each token
  const tokens: TokenInfo[] = []
  const regex = /"([^"]+)"|(\S+)/g
  let match
  while ((match = regex.exec(query)) !== null) {
    // match[1] is content inside quotes (phrase search)
    // match[2] is unquoted token
    if (match[1] !== undefined) {
      // Quoted phrase - track full match including quotes
      tokens.push({
        value: match[1],
        start: match.index,
        end: match.index + match[0].length,
        isPhrase: true,
      })
    } else {
      tokens.push({
        value: match[2] ?? "",
        start: match.index,
        end: match.index + match[0].length,
        isPhrase: false,
      })
    }
  }

  for (const tokenInfo of tokens) {
    const { value: token, start, end, isPhrase } = tokenInfo

    // Handle quoted phrases
    if (isPhrase) {
      ast.phrases.push(token)
      ast.phraseTerms.push({
        value: token,
        offset: { start, end },
      })
      continue
    }

    if (!token) continue

    // Check for negation prefix
    const negated = token.startsWith("-")
    const term = negated ? token.slice(1) : token
    const offset: QueryOffset = { start, end }

    // @mention
    if (term.startsWith("@")) {
      ast.refs.push({
        type: "person",
        value: term.slice(1),
        negated,
        offset,
      })
      continue
    }

    // #tag
    if (term.startsWith("#")) {
      ast.refs.push({
        type: "tag",
        value: term.slice(1),
        negated,
        offset,
      })
      continue
    }

    // +project
    if (term.startsWith("+")) {
      ast.refs.push({
        type: "project",
        value: term.slice(1),
        negated,
        offset,
      })
      continue
    }

    // Path patterns: ./path, /path, path/, **
    // - ./path/** - relative path with recursive
    // - /absolute/path - absolute path
    // - path/ - contains path segment
    if (
      term.startsWith("./") ||
      term.startsWith("/") ||
      term.endsWith("/") ||
      term.includes("**")
    ) {
      const recursive = term.endsWith("**")
      let pattern = term

      // Remove ** suffix for cleaner pattern matching
      if (recursive) {
        pattern = term.slice(0, -2)
        // Also remove trailing slash if present
        if (pattern.endsWith("/")) {
          pattern = pattern.slice(0, -1)
        }
      }

      ast.paths.push({
        pattern,
        recursive,
        negated,
        offset,
      })
      continue
    }

    // Property queries: prop::* (exists), prop::value (equals), prop::>N (comparison)
    // Pattern: name::value where :: distinguishes from field:value
    const propMatch = term.match(/^([a-z][a-z0-9_-]*)::(.*)$/i)
    if (propMatch) {
      const [, propName, propValue] = propMatch

      if (propValue === "*") {
        // Existence check: prop::*
        ast.propConditions.push({
          prop: propName?.toLowerCase() ?? "",
          op: "exists",
          negated,
          offset,
        })
      } else {
        // Check for comparison operators: >N, <N, >=N, <=N
        const compMatch = propValue?.match(/^(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/)
        if (compMatch) {
          const [, compOp, numStr] = compMatch
          ast.propConditions.push({
            prop: propName?.toLowerCase() ?? "",
            op: compOp as ">" | "<" | ">=" | "<=",
            value: parseFloat(numStr ?? "0"),
            negated,
            offset,
          })
        } else {
          // Value match: prop::value
          // Check if it's a number
          const numValue = parseFloat(propValue ?? "")
          const isNumber =
            !isNaN(numValue) && /^-?\d+(\.\d+)?$/.test(propValue ?? "")

          ast.propConditions.push({
            prop: propName?.toLowerCase() ?? "",
            op: negated ? "!=" : "=",
            value: isNumber ? numValue : (propValue ?? ""),
            negated,
            offset,
          })
        }
      }
      continue
    }

    // Special queries: blocked:true/false
    if (
      term.toLowerCase() === "blocked:true" ||
      term.toLowerCase() === "blocked:false"
    ) {
      ast.specials.push({
        type: "blocked",
        value: term.toLowerCase() === "blocked:true",
        offset,
      })
      continue
    }

    // field:value (supports comma-separated values like status:open,blocked)
    const fieldMatch = term.match(/^([a-z_]+)([:=<>!]+)(.+)$/i)
    if (fieldMatch) {
      const [, field, opStr, rawValue] = fieldMatch
      let op: QueryCondition["op"] = "="

      // Determine operator
      if (opStr === ":" || opStr === "=") {
        op = negated ? "!=" : "="
      } else if (opStr === "!=") {
        op = "!="
      } else if (opStr === ">") {
        op = ">"
      } else if (opStr === "<") {
        op = "<"
      } else if (opStr === ">=") {
        op = ">="
      } else if (opStr === "<=") {
        op = "<="
      }

      // Map field aliases
      const mappedField = mapFieldName(field ?? "")

      // Store value as-is (comma-separated values handled by executor)
      ast.conditions.push({
        field: mappedField,
        op,
        value: rawValue ?? "",
        negated,
        offset,
      })
      continue
    }

    // Plain text search term
    ast.text.push(negated ? `-${term}` : term)
    ast.textTerms.push({
      value: term,
      negated,
      offset,
    })
  }

  return ast
}
