/**
 * Parser fixture for km-tui.omnibox-query-syntax.
 *
 * Covers every v1 operator family and combinations. v1.1 operators
 * (^prefix, suffix$, 'exact, property filters) are intentionally NOT
 * asserted here — they're expected to parse as smart terms today and
 * upgrade cleanly later without breaking these fixtures.
 */
import { describe, expect, it } from "vitest"
import { parseQuery, isEmptyQuery, positiveTerms } from "../src/state/omnibox-query-parser.ts"

describe("parseQuery — empty / whitespace", () => {
  it("returns an empty parsed query for '' ", () => {
    const q = parseQuery("")
    expect(q.terms).toEqual([])
    expect(q.sigil).toBeUndefined()
    expect(q.taskFilter).toBeUndefined()
    expect(isEmptyQuery(q)).toBe(true)
  })
  it("returns an empty parsed query for whitespace", () => {
    const q = parseQuery("   ")
    expect(isEmptyQuery(q)).toBe(true)
  })
})

describe("parseQuery — smart (bare) terms", () => {
  it("single bare term", () => {
    expect(parseQuery("foo").terms).toEqual([{ kind: "smart", value: "foo", negated: false }])
  })
  it("AND of bare terms", () => {
    expect(parseQuery("foo bar baz").terms).toEqual([
      { kind: "smart", value: "foo", negated: false },
      { kind: "smart", value: "bar", negated: false },
      { kind: "smart", value: "baz", negated: false },
    ])
  })
})

describe("parseQuery — phrase (quoted)", () => {
  it('"foo bar" → one phrase term', () => {
    expect(parseQuery('"foo bar"').terms).toEqual([{ kind: "phrase", value: "foo bar", negated: false }])
  })
  it("phrase + smart mixed", () => {
    expect(parseQuery('alpha "exact phrase" beta').terms).toEqual([
      { kind: "smart", value: "alpha", negated: false },
      { kind: "phrase", value: "exact phrase", negated: false },
      { kind: "smart", value: "beta", negated: false },
    ])
  })
  it('"#foo" escapes the sigil to a literal phrase', () => {
    const q = parseQuery('"#foo"')
    expect(q.sigil).toBeUndefined()
    expect(q.terms).toEqual([{ kind: "phrase", value: "#foo", negated: false }])
  })
})

describe("parseQuery — exclude (- and !)", () => {
  it("-foo → negated smart", () => {
    expect(parseQuery("-foo").terms).toEqual([{ kind: "smart", value: "foo", negated: true }])
  })
  it("!foo → negated smart (fzf)", () => {
    expect(parseQuery("!foo").terms).toEqual([{ kind: "smart", value: "foo", negated: true }])
  })
  it("include + exclude combination", () => {
    expect(parseQuery("foo -bar !baz").terms).toEqual([
      { kind: "smart", value: "foo", negated: false },
      { kind: "smart", value: "bar", negated: true },
      { kind: "smart", value: "baz", negated: true },
    ])
  })
  it("lone '-' or '!' is ignored", () => {
    expect(parseQuery("- !").terms).toEqual([])
  })
})

describe("parseQuery — sigils", () => {
  it("@foo → sigil '@' + body 'foo' as smart term", () => {
    const q = parseQuery("@foo")
    expect(q.sigil).toBe("@")
    expect(q.terms).toEqual([{ kind: "smart", value: "foo", negated: false }])
  })
  it("#foo → sigil '#'", () => {
    expect(parseQuery("#foo").sigil).toBe("#")
  })
  it("+foo → sigil '+'", () => {
    expect(parseQuery("+foo").sigil).toBe("+")
  })
  it("[foo → sigil '['", () => {
    const q = parseQuery("[foo")
    expect(q.sigil).toBe("[")
    expect(q.taskFilter).toBeUndefined()
    expect(q.terms).toEqual([{ kind: "smart", value: "foo", negated: false }])
  })
  it("sigil + multiple terms", () => {
    const q = parseQuery("@delei project")
    expect(q.sigil).toBe("@")
    expect(q.terms).toEqual([
      { kind: "smart", value: "delei", negated: false },
      { kind: "smart", value: "project", negated: false },
    ])
  })
})

describe("parseQuery — bracket task filters", () => {
  it.each([
    ["[]", "any"],
    ["[ ]", "todo"],
    ["[x]", "done"],
    ["[X]", "done"],
    ["[/]", "wip"],
    ["[-]", "dropped"],
    ["[!]", "blocked"],
  ] as const)("%s → taskFilter %s", (token, expected) => {
    const q = parseQuery(token)
    expect(q.taskFilter).toBe(expected)
    expect(q.sigil).toBeUndefined()
    expect(q.terms).toEqual([])
  })
  it("[x] buy milk → done filter + smart terms", () => {
    const q = parseQuery("[x] buy milk")
    expect(q.taskFilter).toBe("done")
    expect(q.terms).toEqual([
      { kind: "smart", value: "buy", negated: false },
      { kind: "smart", value: "milk", negated: false },
    ])
  })
  it("[foo (no closing bracket) → sigil, not taskFilter", () => {
    const q = parseQuery("[foo")
    expect(q.sigil).toBe("[")
    expect(q.taskFilter).toBeUndefined()
  })
})

describe("parseQuery — combinations", () => {
  it("sigil + phrase + exclude", () => {
    const q = parseQuery('@delei "new project" -archived')
    expect(q.sigil).toBe("@")
    expect(q.terms).toEqual([
      { kind: "smart", value: "delei", negated: false },
      { kind: "phrase", value: "new project", negated: false },
      { kind: "smart", value: "archived", negated: true },
    ])
  })
  it("taskFilter + sigil body after → taskFilter wins first, then sigil on next token", () => {
    // `[] @foo` parses [] as taskFilter and `@foo` stays as a smart-ish token
    // because the sigil is only consumed at the START of the query.
    const q = parseQuery("[] @foo")
    expect(q.taskFilter).toBe("any")
    expect(q.sigil).toBeUndefined()
    expect(q.terms).toEqual([{ kind: "smart", value: "@foo", negated: false }])
  })
  it("raw is preserved", () => {
    expect(parseQuery("  foo bar  ").raw).toBe("  foo bar  ")
  })
})

describe("positiveTerms", () => {
  it("drops negated terms", () => {
    const q = parseQuery("foo -bar baz")
    expect(positiveTerms(q).map((t) => t.value)).toEqual(["foo", "baz"])
  })
})

// ---------------------------------------------------------------------------
// v1.1 deferred operators — parse as smart terms today. These tests pin down
// the current behavior so upgrading to a real prefix/suffix/exact/prop parser
// later is a visible diff, not a silent change.
// ---------------------------------------------------------------------------
describe("parseQuery — v1.1 deferred (currently parsed as smart)", () => {
  it("^foo currently → smart '^foo' (TODO: prefix in v1.1)", () => {
    expect(parseQuery("^foo").terms).toEqual([{ kind: "smart", value: "^foo", negated: false }])
  })
  it("foo$ currently → smart 'foo$' (TODO: suffix in v1.1)", () => {
    expect(parseQuery("foo$").terms).toEqual([{ kind: "smart", value: "foo$", negated: false }])
  })
  it("'foo currently → smart \"'foo\" (TODO: exact-substring in v1.1)", () => {
    expect(parseQuery("'foo").terms).toEqual([{ kind: "smart", value: "'foo", negated: false }])
  })
  it("due::today currently → smart 'due::today' (TODO: property filter in v1.1)", () => {
    expect(parseQuery("due::today").terms).toEqual([{ kind: "smart", value: "due::today", negated: false }])
  })
})
