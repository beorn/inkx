/**
 * Omnibox parser tests — Phase 2 of km-tui.omnibox-query-syntax.
 *
 * Pure unit tests for `parseQuery(raw) → ParsedQuery`. No TUI, no app,
 * no fixtures — just the parser. Covers every operator in the v1 table:
 *
 *   bare / quoted phrase / 'exact / ^prefix / suffix$ / -foo / !foo
 *   [] [x] [ ] [/] [-] [.]   (task filters, leading + trailing)
 *   key::value / key::<v / key::>v / key::<=v / key::>=v
 *
 * plus sigil stripping (`: @ # + [ /`), the `[x]` vs `[foo` disambiguation,
 * whitespace tolerance, and the `raw` verbatim-preservation contract.
 */

import { describe, expect, it } from "vitest"
import { parseQuery } from "../src/state/omnibox-parse.ts"

describe("parseQuery — empty + bare", () => {
  it("empty buffer → universal mode, no terms/filters", () => {
    const q = parseQuery("")
    expect(q).toEqual({
      raw: "",
      mode: "universal",
      body: "",
      terms: [],
      taskStatus: null,
      properties: [],
    })
  })

  it("bare smart term → one smart term, mode universal", () => {
    const q = parseQuery("foo")
    expect(q.mode).toBe("universal")
    expect(q.body).toBe("foo")
    expect(q.terms).toEqual([{ kind: "smart", value: "foo", negated: false }])
    expect(q.taskStatus).toBeNull()
    expect(q.properties).toEqual([])
  })
})

describe("parseQuery — sigil dispatch", () => {
  it(":move → command mode, body stripped of sigil, smart term 'move'", () => {
    const q = parseQuery(":move")
    expect(q.mode).toBe("command")
    expect(q.body).toBe("move")
    expect(q.terms).toEqual([{ kind: "smart", value: "move", negated: false }])
  })

  it("@delei → context mode, body 'delei'", () => {
    const q = parseQuery("@delei")
    expect(q.mode).toBe("context")
    expect(q.body).toBe("delei")
    expect(q.terms).toEqual([{ kind: "smart", value: "delei", negated: false }])
  })

  it("#tag → tag mode", () => {
    const q = parseQuery("#foo")
    expect(q.mode).toBe("tag")
    expect(q.body).toBe("foo")
  })

  it("+proj → project mode", () => {
    const q = parseQuery("+alpha")
    expect(q.mode).toBe("project")
    expect(q.body).toBe("alpha")
  })

  it("/query → local_find mode, body is left alone (sigil NOT stripped)", () => {
    const q = parseQuery("/foo")
    expect(q.mode).toBe("local_find")
    // Contract: parser leaves the `/` in body for the ranker to deal with.
    expect(q.body).toBe("/foo")
  })
})

describe("parseQuery — phrase / exact / prefix / suffix", () => {
  it('quoted phrase "hello world" → one phrase term with literal value', () => {
    const q = parseQuery('"hello world"')
    expect(q.terms).toEqual([{ kind: "phrase", value: "hello world", negated: false }])
  })

  it("exact 'foo → one exact term, value 'foo'", () => {
    const q = parseQuery("'foo")
    expect(q.terms).toEqual([{ kind: "exact", value: "foo", negated: false }])
  })

  it("prefix ^foo → one prefix term", () => {
    const q = parseQuery("^foo")
    expect(q.terms).toEqual([{ kind: "prefix", value: "foo", negated: false }])
  })

  it("suffix foo$ → one suffix term", () => {
    const q = parseQuery("foo$")
    expect(q.terms).toEqual([{ kind: "suffix", value: "foo", negated: false }])
  })
})

describe("parseQuery — negation", () => {
  it("-foo → one negated smart term", () => {
    const q = parseQuery("-foo")
    expect(q.terms).toEqual([{ kind: "smart", value: "foo", negated: true }])
  })

  it("!foo → same as -foo (alt negation prefix)", () => {
    const q = parseQuery("!foo")
    expect(q.terms).toEqual([{ kind: "smart", value: "foo", negated: true }])
  })
})

describe("parseQuery — task filter disambiguation", () => {
  it("leading [x] → taskStatus 'done', mode 'universal' (NOT 'node')", () => {
    const q = parseQuery("[x]")
    expect(q.mode).toBe("universal")
    expect(q.taskStatus).toBe("done")
    expect(q.terms).toEqual([])
  })

  it("leading [] → taskStatus 'any'", () => {
    const q = parseQuery("[]")
    expect(q.mode).toBe("universal")
    expect(q.taskStatus).toBe("any")
  })

  it("leading [ ] → taskStatus 'todo'", () => {
    const q = parseQuery("[ ]")
    expect(q.mode).toBe("universal")
    expect(q.taskStatus).toBe("todo")
  })

  it("leading [/] → taskStatus 'wip'", () => {
    expect(parseQuery("[/]").taskStatus).toBe("wip")
  })

  it("leading [-] → taskStatus 'dropped'", () => {
    expect(parseQuery("[-]").taskStatus).toBe("dropped")
  })

  it("leading [.] → taskStatus 'blocked'", () => {
    expect(parseQuery("[.]").taskStatus).toBe("blocked")
  })

  it("trailing 'urgent [x]' → taskStatus done, smart 'urgent', mode universal", () => {
    const q = parseQuery("urgent [x]")
    expect(q.mode).toBe("universal")
    expect(q.taskStatus).toBe("done")
    expect(q.terms).toEqual([{ kind: "smart", value: "urgent", negated: false }])
  })

  it("plain '[foo' → node mode (real sigil), smart 'foo', taskStatus null", () => {
    const q = parseQuery("[foo")
    expect(q.mode).toBe("node")
    expect(q.body).toBe("foo")
    expect(q.taskStatus).toBeNull()
    expect(q.terms).toEqual([{ kind: "smart", value: "foo", negated: false }])
  })
})

describe("parseQuery — property filters", () => {
  it("due::today → eq op", () => {
    const q = parseQuery("due::today")
    expect(q.properties).toEqual([{ key: "due", op: "eq", value: "today" }])
    expect(q.terms).toEqual([])
  })

  it("due::<2026-04-15 → lt op", () => {
    const q = parseQuery("due::<2026-04-15")
    expect(q.properties).toEqual([{ key: "due", op: "lt", value: "2026-04-15" }])
  })

  it("priority::>=p1 → ge op (longest-prefix wins over >)", () => {
    const q = parseQuery("priority::>=p1")
    expect(q.properties).toEqual([{ key: "priority", op: "ge", value: "p1" }])
  })

  it("priority::>p1 → gt op", () => {
    const q = parseQuery("priority::>p1")
    expect(q.properties).toEqual([{ key: "priority", op: "gt", value: "p1" }])
  })

  it("due::<=today → le op", () => {
    const q = parseQuery("due::<=today")
    expect(q.properties).toEqual([{ key: "due", op: "le", value: "today" }])
  })
})

describe("parseQuery — combined query", () => {
  it("'@delei urgent [x] due::today' → context mode + 2 smart + task filter + 1 property", () => {
    const q = parseQuery("@delei urgent [x] due::today")
    expect(q.mode).toBe("context")
    expect(q.body).toBe("delei urgent [x] due::today")
    expect(q.terms).toEqual([
      { kind: "smart", value: "delei", negated: false },
      { kind: "smart", value: "urgent", negated: false },
    ])
    expect(q.taskStatus).toBe("done")
    expect(q.properties).toEqual([{ key: "due", op: "eq", value: "today" }])
  })
})

describe("parseQuery — whitespace + raw preservation", () => {
  it("multiple spaces and leading/trailing whitespace tolerated", () => {
    const q = parseQuery("  foo    bar  ")
    expect(q.mode).toBe("universal")
    expect(q.terms).toEqual([
      { kind: "smart", value: "foo", negated: false },
      { kind: "smart", value: "bar", negated: false },
    ])
  })

  it("raw field always preserves input verbatim", () => {
    for (const raw of ["", "foo", ":move", "  spaced  ", '@delei "hi there" [x]', "/find me"]) {
      expect(parseQuery(raw).raw).toBe(raw)
    }
  })
})
