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
 * Context for token parsing
 */
interface ParseContext {
  term: string
  negated: boolean
  offset: QueryOffset
}

/**
 * Create empty AST
 */
function createEmptyAST(): QueryAST {
  return {
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
}

/**
 * Tokenize query string preserving quoted phrases
 */
function tokenize(query: string): TokenInfo[] {
  const tokens: TokenInfo[] = []
  const regex = /"([^"]+)"|(\S+)/g
  let match
  while ((match = regex.exec(query)) !== null) {
    if (match[1] !== undefined) {
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
  return tokens
}

/**
 * Try to parse a reference token (@mention, #tag, +project)
 */
function tryParseRef(ctx: ParseContext, ast: QueryAST): boolean {
  const { term, negated, offset } = ctx
  const prefixMap: Record<string, QueryRef["type"]> = {
    "@": "person",
    "#": "tag",
    "+": "project",
  }
  const prefix = term[0]
  const type = prefixMap[prefix]
  if (!type) return false

  ast.refs.push({
    type,
    value: term.slice(1),
    negated,
    offset,
  })
  return true
}

/**
 * Check if term looks like a path pattern
 */
function isPathPattern(term: string): boolean {
  return (
    term.startsWith("./") ||
    term.startsWith("/") ||
    term.endsWith("/") ||
    term.includes("**")
  )
}

/**
 * Try to parse a path pattern token
 */
function tryParsePath(ctx: ParseContext, ast: QueryAST): boolean {
  const { term, negated, offset } = ctx
  if (!isPathPattern(term)) return false

  const recursive = term.endsWith("**")
  let pattern = term

  if (recursive) {
    pattern = term.slice(0, -2)
    if (pattern.endsWith("/")) {
      pattern = pattern.slice(0, -1)
    }
  }

  ast.paths.push({ pattern, recursive, negated, offset })
  return true
}

/**
 * Try to parse property existence check (prop::*)
 */
function tryParsePropExists(
  propName: string,
  propValue: string,
  ctx: ParseContext,
  ast: QueryAST,
): boolean {
  if (propValue !== "*") return false

  ast.propConditions.push({
    prop: propName.toLowerCase(),
    op: "exists",
    negated: ctx.negated,
    offset: ctx.offset,
  })
  return true
}

/**
 * Try to parse property comparison (prop::>N, prop::<=N, etc.)
 */
function tryParsePropComparison(
  propName: string,
  propValue: string,
  ctx: ParseContext,
  ast: QueryAST,
): boolean {
  const compMatch = propValue.match(/^(>=|<=|>|<)(-?\d+(?:\.\d+)?)$/)
  if (!compMatch) return false

  const [, compOp, numStr] = compMatch
  ast.propConditions.push({
    prop: propName.toLowerCase(),
    op: compOp as ">" | "<" | ">=" | "<=",
    value: parseFloat(numStr ?? "0"),
    negated: ctx.negated,
    offset: ctx.offset,
  })
  return true
}

/**
 * Parse property equality (prop::value)
 */
function parsePropEquality(
  propName: string,
  propValue: string,
  ctx: ParseContext,
  ast: QueryAST,
): void {
  const numValue = parseFloat(propValue)
  const isNumber = !isNaN(numValue) && /^-?\d+(\.\d+)?$/.test(propValue)

  ast.propConditions.push({
    prop: propName.toLowerCase(),
    op: ctx.negated ? "!=" : "=",
    value: isNumber ? numValue : propValue,
    negated: ctx.negated,
    offset: ctx.offset,
  })
}

/**
 * Try to parse a property query (prop::value)
 */
function tryParseProp(ctx: ParseContext, ast: QueryAST): boolean {
  const propMatch = ctx.term.match(/^([a-z][a-z0-9_-]*)::(.*)$/i)
  if (!propMatch) return false

  const [, propName, propValue] = propMatch
  if (!propName || propValue === undefined) return false

  if (tryParsePropExists(propName, propValue, ctx, ast)) return true
  if (tryParsePropComparison(propName, propValue, ctx, ast)) return true
  parsePropEquality(propName, propValue, ctx, ast)
  return true
}

/**
 * Try to parse special query (blocked:true/false)
 */
function tryParseSpecial(ctx: ParseContext, ast: QueryAST): boolean {
  const lower = ctx.term.toLowerCase()
  if (lower !== "blocked:true" && lower !== "blocked:false") return false

  ast.specials.push({
    type: "blocked",
    value: lower === "blocked:true",
    offset: ctx.offset,
  })
  return true
}

/**
 * Map operator string to QueryCondition operator
 */
function mapOperator(opStr: string, negated: boolean): QueryCondition["op"] {
  if (opStr === ":" || opStr === "=") return negated ? "!=" : "="
  if (opStr === "!=") return "!="
  if (opStr === ">") return ">"
  if (opStr === "<") return "<"
  if (opStr === ">=") return ">="
  if (opStr === "<=") return "<="
  return "="
}

/**
 * Try to parse field:value condition
 */
function tryParseField(ctx: ParseContext, ast: QueryAST): boolean {
  const fieldMatch = ctx.term.match(/^([a-z_]+)([:=<>!]+)(.+)$/i)
  if (!fieldMatch) return false

  const [, field, opStr, rawValue] = fieldMatch
  if (!field || !opStr || !rawValue) return false

  ast.conditions.push({
    field: mapFieldName(field),
    op: mapOperator(opStr, ctx.negated),
    value: rawValue,
    negated: ctx.negated,
    offset: ctx.offset,
  })
  return true
}

/**
 * Add plain text search term
 */
function addTextTerm(ctx: ParseContext, ast: QueryAST): void {
  ast.text.push(ctx.negated ? `-${ctx.term}` : ctx.term)
  ast.textTerms.push({
    value: ctx.term,
    negated: ctx.negated,
    offset: ctx.offset,
  })
}

/**
 * Process a single token and add to AST
 */
function processToken(tokenInfo: TokenInfo, ast: QueryAST): void {
  const { value: token, start, end, isPhrase } = tokenInfo

  // Handle quoted phrases
  if (isPhrase) {
    ast.phrases.push(token)
    ast.phraseTerms.push({ value: token, offset: { start, end } })
    return
  }

  if (!token) return

  // Prepare parsing context
  const negated = token.startsWith("-")
  const term = negated ? token.slice(1) : token
  const ctx: ParseContext = { term, negated, offset: { start, end } }

  // Try each parser in order
  if (tryParseRef(ctx, ast)) return
  if (tryParsePath(ctx, ast)) return
  if (tryParseProp(ctx, ast)) return
  if (tryParseSpecial(ctx, ast)) return
  if (tryParseField(ctx, ast)) return

  // Default: plain text search
  addTextTerm(ctx, ast)
}

/**
 * Parse a query string into an AST
 */
export function parseQuery(query: string): QueryAST {
  const ast = createEmptyAST()

  if (!query || query.trim() === "") {
    return ast
  }

  const tokens = tokenize(query)
  for (const token of tokens) {
    processToken(token, ast)
  }

  return ast
}
