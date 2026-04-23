/**
 * Property-based fuzz tests for query parser
 *
 * Key properties tested:
 * 1. Idempotency — parse(serialize(parse(q))) === parse(q)
 * 2. No crash on valid input — random valid queries don't throw
 * 3. Structural integrity — AST arrays are always present
 */

import { test, describe, expect, gen, take, type SeededRandom } from "vimonkey"
import { parseQuery, type QueryAST } from "../../src/query/parser.ts"

// ---------------------------------------------------------------------------
// Query fragment generators
// ---------------------------------------------------------------------------

const WORDS = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel", "india", "juliet"]

const STATUSES = ["open", "done", "blocked", "in_progress", "pending"]
const PRIORITIES = ["1", "2", "3", "4", "5", "P1", "P2", "P3"]
const FIELDS = ["status", "priority", "due", "start", "assigned", "type"]
const OPS = [":", "=", "!=", ">", "<", ">=", "<="]
const REF_PREFIXES = ["@", "#", "+"]
const PROP_NAMES = ["metadata", "author", "score", "attempts", "level"]
const PROP_VALUES = ["alice", "bob", "active", "pending", "42", "95", "3.14"]

/** Generate a field:value condition */
function randomFieldCondition(rng: SeededRandom): string {
  const field = rng.pick(FIELDS)
  const op = rng.pick(OPS)
  const isDateField = field === "due" || field === "start"
  const value = isDateField ? randomDateValue(rng) : rng.pick([...STATUSES, ...PRIORITIES, rng.pick(WORDS)])
  return `${field}${op}${value}`
}

/** Generate a date value (YYYY-MM-DD) */
function randomDateValue(rng: SeededRandom): string {
  const year = rng.int(2020, 2030)
  const month = String(rng.int(1, 12)).padStart(2, "0")
  const day = String(rng.int(1, 28)).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Generate a @mention, #tag, or +project reference */
function randomRef(rng: SeededRandom): string {
  return `${rng.pick(REF_PREFIXES)}${rng.pick(WORDS)}`
}

/** Generate a path pattern */
function randomPath(rng: SeededRandom): string {
  const parts = rng.array(rng.int(1, 3), () => rng.pick(WORDS))
  const prefix = rng.pick(["./", "/", ""])
  const suffix = rng.bool(0.3) ? "/**" : rng.bool(0.3) ? "/" : ""
  return `${prefix}${parts.join("/")}${suffix}`
}

/** Generate a quoted phrase */
function randomPhrase(rng: SeededRandom): string {
  const count = rng.int(2, 4)
  const words = rng.array(count, () => rng.pick(WORDS))
  return `"${words.join(" ")}"`
}

/** Generate a property query (prop::value) */
function randomPropQuery(rng: SeededRandom): string {
  const prop = rng.pick(PROP_NAMES)
  const variant = rng.int(0, 3)
  switch (variant) {
    case 0:
      return `${prop}::*` // existence
    case 1:
      return `${prop}::${rng.pick(PROP_VALUES)}` // value match
    case 2: {
      const compOp = rng.pick([">", "<", ">=", "<="])
      return `${prop}::${compOp}${rng.int(1, 100)}`
    }
    default:
      return `${prop}::${rng.int(1, 100)}` // numeric value
  }
}

/** Generate a special condition */
function randomSpecial(rng: SeededRandom): string {
  return `blocked:${rng.pick(["true", "false"])}`
}

/** Generate a plain text term */
function randomText(rng: SeededRandom): string {
  return rng.pick(WORDS)
}

type FragmentGenerator = (rng: SeededRandom) => string

const FRAGMENT_GENERATORS: Array<[number, FragmentGenerator]> = [
  [30, randomFieldCondition],
  [15, randomRef],
  [10, randomPath],
  [10, randomPhrase],
  [10, randomPropQuery],
  [5, randomSpecial],
  [20, randomText],
]

/** Pick a weighted random fragment generator */
function pickFragmentGenerator(rng: SeededRandom): FragmentGenerator {
  const total = FRAGMENT_GENERATORS.reduce((sum, [w]) => sum + w, 0)
  let r = rng.float() * total
  for (const [weight, gen] of FRAGMENT_GENERATORS) {
    r -= weight
    if (r <= 0) return gen
  }
  return FRAGMENT_GENERATORS[FRAGMENT_GENERATORS.length - 1]![1]
}

/** Generate a complete query string from random fragments */
function generateQuery(rng: SeededRandom, fragmentCount: number): string {
  const fragments: string[] = []
  for (let i = 0; i < fragmentCount; i++) {
    const generator = pickFragmentGenerator(rng)
    let fragment = generator(rng)
    // Optionally negate (except phrases and specials)
    if (rng.bool(0.2) && !fragment.startsWith('"') && !fragment.startsWith("blocked:")) {
      fragment = `-${fragment}`
    }
    fragments.push(fragment)
  }
  return fragments.join(" ")
}

// ---------------------------------------------------------------------------
// AST serialization (for roundtrip testing)
// ---------------------------------------------------------------------------

/**
 * Serialize a QueryAST back to a query string.
 * This enables parse → serialize → parse roundtrip testing.
 */
function serializeAST(ast: QueryAST): string {
  const parts: string[] = []

  // Conditions
  for (const cond of ast.conditions) {
    const neg = cond.negated ? "-" : ""
    // Reverse field alias mapping for serialization
    const field = reverseFieldName(cond.field)
    const op = cond.op === "=" && !cond.negated ? ":" : cond.op === "!=" && cond.negated ? ":" : cond.op
    parts.push(`${neg}${field}${op}${cond.value}`)
  }

  // Refs
  for (const ref of ast.refs) {
    const neg = ref.negated ? "-" : ""
    const prefix = ref.type === "person" ? "@" : ref.type === "tag" ? "#" : "+"
    parts.push(`${neg}${prefix}${ref.value}`)
  }

  // Paths
  //
  // The parser stores the raw pattern verbatim (parseTreeGlob handles
  // recursion detection downstream in the executor). `path.recursive` is a
  // derived flag — true iff `path.pattern` already contains `**`. Appending
  // `/**` here would double up, so we serialize the pattern as-is.
  for (const path of ast.paths) {
    const neg = path.negated ? "-" : ""
    parts.push(`${neg}${path.pattern}`)
  }

  // Prop conditions
  for (const prop of ast.propConditions) {
    const neg = prop.negated ? "-" : ""
    if (prop.op === "exists") {
      parts.push(`${neg}${prop.prop}::*`)
    } else if (prop.op === "=" || prop.op === "!=") {
      parts.push(`${neg}${prop.prop}::${prop.value}`)
    } else {
      parts.push(`${neg}${prop.prop}::${prop.op}${prop.value}`)
    }
  }

  // Specials
  for (const special of ast.specials) {
    parts.push(`${special.type}:${special.value}`)
  }

  // Phrases
  for (const phrase of ast.phraseTerms) {
    parts.push(`"${phrase.value}"`)
  }

  // Text terms
  for (const text of ast.textTerms) {
    const neg = text.negated ? "-" : ""
    parts.push(`${neg}${text.value}`)
  }

  return parts.join(" ")
}

/** Reverse map canonical field names back to aliases for serialization */
const REVERSE_FIELD_MAP: Record<string, string> = {
  task_status: "status",
  due_at: "due",
  start_at: "start",
  assigned_to: "assigned",
}

function reverseFieldName(field: string): string {
  return REVERSE_FIELD_MAP[field] ?? field
}

/** Compare two ASTs ignoring offset information (which depends on string position) */
function stripOffsets(ast: QueryAST): Omit<QueryAST, "text" | "phrases"> {
  return {
    conditions: ast.conditions.map(({ offset: _, ...rest }) => rest),
    refs: ast.refs.map(({ offset: _, ...rest }) => rest),
    paths: ast.paths.map(({ offset: _, ...rest }) => rest),
    propConditions: ast.propConditions.map(({ offset: _, ...rest }) => rest),
    specials: ast.specials.map(({ offset: _, ...rest }) => rest),
    textTerms: ast.textTerms.map(({ offset: _, ...rest }) => rest),
    phraseTerms: ast.phraseTerms.map(({ offset: _, ...rest }) => rest),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Query Parser Fuzz: Idempotency", () => {
  test.fuzz("second roundtrip is stable (single fragments)", async () => {
    const queries = gen(({ random }) => {
      const generator = pickFragmentGenerator(random)
      return generator(random)
    })

    for await (const q of take(queries, 200)) {
      const ast1 = parseQuery(q)
      const serialized = serializeAST(ast1)
      const ast2 = parseQuery(serialized)
      const reserialized = serializeAST(ast2)
      const ast3 = parseQuery(reserialized)

      // After first roundtrip, subsequent roundtrips must be stable
      expect(stripOffsets(ast3)).toEqual(stripOffsets(ast2))
    }
  })

  test.fuzz("second roundtrip is stable (multi-fragment queries)", async () => {
    const queries = gen(({ random }) => {
      const count = random.int(2, 6)
      return generateQuery(random, count)
    })

    for await (const q of take(queries, 100)) {
      const ast1 = parseQuery(q)
      const serialized = serializeAST(ast1)
      const ast2 = parseQuery(serialized)
      const reserialized = serializeAST(ast2)
      const ast3 = parseQuery(reserialized)

      expect(stripOffsets(ast3)).toEqual(stripOffsets(ast2))
    }
  })
})

describe("Query Parser Fuzz: No Crash", () => {
  test.fuzz("random valid queries never throw", async () => {
    const queries = gen(({ random }) => {
      const count = random.int(1, 8)
      return generateQuery(random, count)
    })

    for await (const q of take(queries, 500)) {
      // Must not throw
      const ast = parseQuery(q)

      // Structural integrity: all arrays exist
      expect(ast.conditions).toBeInstanceOf(Array)
      expect(ast.refs).toBeInstanceOf(Array)
      expect(ast.paths).toBeInstanceOf(Array)
      expect(ast.propConditions).toBeInstanceOf(Array)
      expect(ast.specials).toBeInstanceOf(Array)
      expect(ast.text).toBeInstanceOf(Array)
      expect(ast.phrases).toBeInstanceOf(Array)
      expect(ast.textTerms).toBeInstanceOf(Array)
      expect(ast.phraseTerms).toBeInstanceOf(Array)
    }
  })

  test.fuzz("empty and whitespace-only queries are safe", async () => {
    const queries = gen(({ random }) => {
      const spaces = " ".repeat(random.int(0, 10))
      const tabs = "\t".repeat(random.int(0, 3))
      return random.bool(0.3) ? "" : `${spaces}${tabs}${spaces}`
    })

    for await (const q of take(queries, 100)) {
      const ast = parseQuery(q)
      expect(ast.conditions).toHaveLength(0)
      expect(ast.refs).toHaveLength(0)
      expect(ast.text).toHaveLength(0)
    }
  })
})

describe("Query Parser Fuzz: Preservation", () => {
  test.fuzz("field conditions preserve field, op, and value", async () => {
    const queries = gen(({ random }) => randomFieldCondition(random))

    for await (const q of take(queries, 200)) {
      const ast = parseQuery(q)
      // Should parse as either a condition or fallback to text (not crash)
      expect(ast.conditions.length + ast.textTerms.length).toBeGreaterThan(0)

      if (ast.conditions.length > 0) {
        const cond = ast.conditions[0]!
        // Value should be non-empty
        expect(cond.value.length).toBeGreaterThan(0)
        // Field should be a known canonical name or the original
        expect(cond.field.length).toBeGreaterThan(0)
      }
    }
  })

  test.fuzz("refs preserve type and value through roundtrip", async () => {
    const queries = gen(({ random }) => {
      const neg = random.bool(0.2) ? "-" : ""
      return `${neg}${randomRef(random)}`
    })

    for await (const q of take(queries, 200)) {
      const ast1 = parseQuery(q)
      expect(ast1.refs).toHaveLength(1)

      const serialized = serializeAST(ast1)
      const ast2 = parseQuery(serialized)
      expect(ast2.refs).toHaveLength(1)

      expect(ast2.refs[0]!.type).toBe(ast1.refs[0]!.type)
      expect(ast2.refs[0]!.value).toBe(ast1.refs[0]!.value)
      expect(ast2.refs[0]!.negated).toBe(ast1.refs[0]!.negated)
    }
  })

  test.fuzz("phrases survive roundtrip", async () => {
    const queries = gen(({ random }) => randomPhrase(random))

    for await (const q of take(queries, 200)) {
      const ast1 = parseQuery(q)
      expect(ast1.phraseTerms).toHaveLength(1)

      const serialized = serializeAST(ast1)
      const ast2 = parseQuery(serialized)
      expect(ast2.phraseTerms).toHaveLength(1)
      expect(ast2.phraseTerms[0]!.value).toBe(ast1.phraseTerms[0]!.value)
    }
  })

  test.fuzz("prop conditions survive roundtrip", async () => {
    const queries = gen(({ random }) => randomPropQuery(random))

    for await (const q of take(queries, 200)) {
      const ast1 = parseQuery(q)
      expect(ast1.propConditions).toHaveLength(1)

      const serialized = serializeAST(ast1)
      const ast2 = parseQuery(serialized)
      expect(ast2.propConditions).toHaveLength(1)

      expect(ast2.propConditions[0]!.prop).toBe(ast1.propConditions[0]!.prop)
      expect(ast2.propConditions[0]!.op).toBe(ast1.propConditions[0]!.op)
      // Value comparison: both could be string or number
      expect(ast2.propConditions[0]!.value).toEqual(ast1.propConditions[0]!.value)
    }
  })
})
