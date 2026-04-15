import { describe, expect, it } from "vitest"
import { fuzzyScore, fuzzyMatch, highlightMatches } from "../src/views/search-utils.ts"

describe("fuzzyMatch", () => {
  it("matches consecutive chars", () => {
    expect(fuzzyMatch("abc", "abcdef")).toBe(true)
  })
  it("matches out-of-order chars if they appear in order", () => {
    expect(fuzzyMatch("abc", "a_b_c")).toBe(true)
  })
  it("rejects missing chars", () => {
    expect(fuzzyMatch("xyz", "abcdef")).toBe(false)
  })
  it("rejects reversed chars", () => {
    expect(fuzzyMatch("cba", "abc")).toBe(false)
  })
  it("is case-insensitive", () => {
    expect(fuzzyMatch("ABC", "abcdef")).toBe(true)
  })
})

describe("fuzzyScore ranking — picker-rank-subpath regression", () => {
  // Reproduces km-tui.picker-rank-subpath:
  // Searching 'Delei' in the Go to context picker puts
  // '@office/Finance/Accounts/Delei/SPD' above plain '@delei',
  // '@delei.c', '@delei.org'. That ranking is wrong — exact
  // and prefix matches on @delei should outrank deep subpath
  // matches.

  function rank(query: string, targets: string[]): string[] {
    return [...targets]
      .map((t) => ({ t, s: fuzzyScore(query, t) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((r) => r.t)
  }

  it("exact sigil-body match beats deep subpath", () => {
    const ranked = rank("delei", ["@office/Finance/Accounts/Delei/SPD", "@delei", "@delei.c", "@delei.org"])
    expect(ranked[0]).toBe("@delei")
  })

  it("prefix matches rank above deep subpath", () => {
    const ranked = rank("delei", ["@office/Finance/Accounts/Delei/SPD", "@delei.c", "@delei.org"])
    // The deep subpath must be last
    expect(ranked[ranked.length - 1]).toBe("@office/Finance/Accounts/Delei/SPD")
  })

  it("shorter prefix match ranks above longer prefix match", () => {
    // @delei.c and @delei.org both start with 'delei' after the sigil,
    // but @delei.c is shorter so it's a tighter match.
    const ranked = rank("delei", ["@delei.org", "@delei.c"])
    expect(ranked[0]).toBe("@delei.c")
  })

  it("segment-boundary match beats mid-segment match", () => {
    // 'work' at start of segment (project/work/foo) should beat
    // mid-segment occurrence (network/homework).
    const ranked = rank("work", ["network/homework", "project/work/foo"])
    expect(ranked[0]).toBe("project/work/foo")
  })

  it("exact match beats prefix match", () => {
    const ranked = rank("foo", ["foobar", "foo"])
    expect(ranked[0]).toBe("foo")
  })

  it("prefix match beats substring match", () => {
    const ranked = rank("bar", ["foobar", "barfoo"])
    expect(ranked[0]).toBe("barfoo")
  })

  it("char-order fuzzy match scores worst among matches", () => {
    const ranked = rank("abc", ["a_b_c", "abcdef", "abc"])
    // exact > prefix > fuzzy
    expect(ranked).toEqual(["abc", "abcdef", "a_b_c"])
  })

  it("non-match returns score <= 0", () => {
    expect(fuzzyScore("xyz", "abcdef")).toBeLessThanOrEqual(0)
  })
})

describe("highlightMatches", () => {
  it("empty query returns empty spans", () => {
    expect(highlightMatches("foo", "")).toEqual([])
  })
  it("no match returns empty spans", () => {
    expect(highlightMatches("abcdef", "xyz")).toEqual([])
  })
  it("exact full-string match", () => {
    expect(highlightMatches("foo", "foo")).toEqual([{ start: 0, end: 3 }])
  })
  it("prefix match", () => {
    expect(highlightMatches("foobar", "foo")).toEqual([{ start: 0, end: 3 }])
  })
  it("substring match in middle", () => {
    expect(highlightMatches("barfoobaz", "foo")).toEqual([{ start: 3, end: 6 }])
  })
  it("suffix match", () => {
    expect(highlightMatches("barfoo", "foo")).toEqual([{ start: 3, end: 6 }])
  })
  it("fuzzy disjoint match emits multiple spans", () => {
    expect(highlightMatches("f_o_o", "foo")).toEqual([
      { start: 0, end: 1 },
      { start: 2, end: 3 },
      { start: 4, end: 5 },
    ])
  })
  it("consecutive fuzzy chars merge into one span", () => {
    expect(highlightMatches("abcd", "ab")).toEqual([{ start: 0, end: 2 }])
  })
  it("case-insensitive with spans on original-case indices", () => {
    expect(highlightMatches("FooBar", "foo")).toEqual([{ start: 0, end: 3 }])
  })
  it("multiple separate spans with gaps", () => {
    expect(highlightMatches("abxcdy", "acd")).toEqual([
      { start: 0, end: 1 },
      { start: 3, end: 5 },
    ])
  })
  it("query longer than target returns empty", () => {
    expect(highlightMatches("ab", "abcdef")).toEqual([])
  })
  it("single char query", () => {
    expect(highlightMatches("hello", "e")).toEqual([{ start: 1, end: 2 }])
  })
})
