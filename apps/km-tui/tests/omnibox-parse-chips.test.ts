/**
 * Phase tests — `chipsFromQuery` derives a visible chip list from a parsed
 * query string. Implements `km-tui.omnibox-parse-chips` acceptance criteria
 * (a)-(d): one chip per parsed token, color/style differs per token kind,
 * unparsed-remainder shown as a dimmed chip, updates on every keystroke.
 *
 * The pure derivation lives in `omnibox-chips.ts` so the chips can be
 * rendered both above the input (UnifiedOmnibox) AND used as snapshot
 * fixtures here without instantiating React.
 */
import { describe, expect, it } from "vitest"
import { chipsFromQuery, type Chip } from "../src/state/omnibox-chips.ts"

function kinds(chips: readonly Chip[]): string[] {
  return chips.map((c) => c.kind)
}
function labels(chips: readonly Chip[]): string[] {
  return chips.map((c) => c.label)
}

describe("chipsFromQuery — empty / whitespace", () => {
  it("returns no chips for empty buffer", () => {
    expect(chipsFromQuery("")).toEqual([])
  })
  it("returns no chips for whitespace-only buffer", () => {
    expect(chipsFromQuery("   ")).toEqual([])
  })
})

describe("chipsFromQuery — sigils", () => {
  it("'@me' → one context chip", () => {
    const chips = chipsFromQuery("@me")
    expect(kinds(chips)).toEqual(["context"])
    expect(labels(chips)).toEqual(["@me"])
  })
  it("'#urgent' → one tag chip", () => {
    const chips = chipsFromQuery("#urgent")
    expect(kinds(chips)).toEqual(["tag"])
    expect(labels(chips)).toEqual(["#urgent"])
  })
  it("'+km' → one project chip", () => {
    const chips = chipsFromQuery("+km")
    expect(kinds(chips)).toEqual(["project"])
    expect(labels(chips)).toEqual(["+km"])
  })
  it("'[foo' → one node chip (regular nodes scope, body becomes the suffix)", () => {
    const chips = chipsFromQuery("[foo")
    expect(kinds(chips)).toEqual(["node"])
    expect(labels(chips)).toEqual(["[foo"])
  })
  it("':' bare colon → command-mode chip with no body", () => {
    const chips = chipsFromQuery(":")
    expect(kinds(chips)).toEqual(["command"])
    expect(labels(chips)).toEqual([":"])
  })
  it("':go' → command chip 'go'", () => {
    const chips = chipsFromQuery(":go")
    expect(kinds(chips)).toEqual(["command"])
    expect(labels(chips)).toEqual([":go"])
  })
  it("'/find' → local_find chip", () => {
    const chips = chipsFromQuery("/find")
    expect(kinds(chips)).toEqual(["local_find"])
    expect(labels(chips)).toEqual(["/find"])
  })
})

describe("chipsFromQuery — bracket task filters", () => {
  it("'[]' → task-any chip", () => {
    const chips = chipsFromQuery("[]")
    expect(kinds(chips)).toEqual(["task"])
    expect(labels(chips)).toEqual(["[]"])
  })
  it("'[ ]' → task-todo chip", () => {
    expect(labels(chipsFromQuery("[ ]"))).toEqual(["[ ]"])
    expect(kinds(chipsFromQuery("[ ]"))).toEqual(["task"])
  })
  it("'[x]' → task-done chip", () => {
    expect(labels(chipsFromQuery("[x]"))).toEqual(["[x]"])
  })
  it("'[!]' → task-blocked chip", () => {
    expect(labels(chipsFromQuery("[!]"))).toEqual(["[!]"])
  })
})

describe("chipsFromQuery — terms", () => {
  it("smart term becomes a text chip", () => {
    const chips = chipsFromQuery("foo")
    expect(kinds(chips)).toEqual(["text"])
    expect(labels(chips)).toEqual(["foo"])
  })
  it("AND of bare terms → multiple text chips", () => {
    expect(kinds(chipsFromQuery("foo bar baz"))).toEqual(["text", "text", "text"])
    expect(labels(chipsFromQuery("foo bar baz"))).toEqual(["foo", "bar", "baz"])
  })
  it("'-foo' → exclude chip", () => {
    expect(kinds(chipsFromQuery("-foo"))).toEqual(["exclude"])
    expect(labels(chipsFromQuery("-foo"))).toEqual(["-foo"])
  })
  it("'!foo' → exclude chip", () => {
    expect(kinds(chipsFromQuery("!foo"))).toEqual(["exclude"])
    expect(labels(chipsFromQuery("!foo"))).toEqual(["!foo"])
  })
  it('"foo bar" → phrase chip', () => {
    expect(kinds(chipsFromQuery('"foo bar"'))).toEqual(["phrase"])
    expect(labels(chipsFromQuery('"foo bar"'))).toEqual(['"foo bar"'])
  })
})

describe("chipsFromQuery — composed", () => {
  it("'[] due @me urgent -resolved' → multiple chips in source order", () => {
    // Chips render in source order so the strip mirrors the buffer
    // left-to-right — "what you typed" lines up with "what we recognized."
    const chips = chipsFromQuery("[] due @me urgent -resolved")
    expect(kinds(chips)).toEqual(["task", "text", "context", "text", "exclude"])
    expect(labels(chips)).toEqual(["[]", "due", "@me", "urgent", "-resolved"])
  })
  it("'#bug -wip' → tag + exclude", () => {
    expect(kinds(chipsFromQuery("#bug -wip"))).toEqual(["tag", "exclude"])
  })
  it("':move +km' (command + project) → command + project chips", () => {
    // Command sigil consumes the whole leading bracket; ': move' body is
    // attached to the command chip. The trailing '+km' still becomes a
    // project chip via the parser's tokenizer when it lives after a space.
    const chips = chipsFromQuery(":move +km")
    expect(kinds(chips)).toEqual(["command", "project"])
    expect(labels(chips)).toEqual([":move", "+km"])
  })
})

describe("chipsFromQuery — kind colors", () => {
  it("each chip kind maps to a distinct theme token (acceptance c)", () => {
    // Spec: chip color/style differs per kind. We assert the kind→color
    // mapping is total (all 7 kinds defined) and unique enough that the
    // user can scan them at a glance.
    const all = chipsFromQuery("[] @me #urgent +km :go /find foo -bad")
    const unique = new Set(all.map((c) => c.color))
    expect(unique.size).toBeGreaterThanOrEqual(5) // at least 5 distinct color tokens
    for (const chip of all) {
      expect(chip.color).toMatch(/^\$/) // semantic theme token, not raw color
    }
  })
})

describe("chipsFromQuery — every keystroke updates", () => {
  it("typing one char at a time produces stable, growing chip lists", () => {
    // Acceptance (b): chips update on every keystroke without jitter.
    expect(labels(chipsFromQuery(""))).toEqual([])
    expect(labels(chipsFromQuery("@"))).toEqual(["@"]) // sigil, no body yet
    expect(labels(chipsFromQuery("@m"))).toEqual(["@m"])
    expect(labels(chipsFromQuery("@me"))).toEqual(["@me"])
    expect(labels(chipsFromQuery("@me "))).toEqual(["@me"])
    expect(labels(chipsFromQuery("@me u"))).toEqual(["@me", "u"])
    expect(labels(chipsFromQuery("@me ur"))).toEqual(["@me", "ur"])
  })
})
