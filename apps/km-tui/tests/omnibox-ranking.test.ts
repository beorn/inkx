/**
 * Canonical ranking fixture for km-tui.omnibox-ranker.
 *
 * Each test supplies:
 *   - a raw query string (passed through parseQuery)
 *   - a list of candidate display strings
 *   - the hand-written expected order of ids
 *
 * Must-include: the @delei vs @office/Finance/Accounts/Delei/SPD case from
 * km-tui.picker-rank-subpath. That's the regression floor this ranker owes
 * to the picker.
 *
 * See `omnibox-ranker.ts` for the tier definitions and rule summary.
 */
import { describe, expect, it } from "vitest"
import type { KNode } from "@km/core"
import { parseQuery } from "../src/state/omnibox-query-parser.ts"
import {
  rankResults,
  highlightMatches,
  stickySelectedIndex,
  type RankCandidate,
} from "../src/state/omnibox-ranker.ts"

// ----------------------------------------------------------------------------
// Fixture helpers
// ----------------------------------------------------------------------------

function mkNode(id: string, content: string, extra: Partial<KNode> = {}): KNode {
  return {
    id,
    type: "h",
    parent_id: null,
    position: { line: 0, column: 0 },
    item: { list: "-" },
    content,
    name: content,
    ...extra,
  } as KNode
}

function mkCand(id: string, title: string, extras: Partial<RankCandidate> = {}): RankCandidate {
  return { node: mkNode(id, title), title, ...extras }
}

function ranked(query: string, candidates: RankCandidate[]): string[] {
  return rankResults(parseQuery(query), candidates).map((r) => r.node.id)
}

// ----------------------------------------------------------------------------
// MUST-INCLUDE: @delei regression (km-tui.picker-rank-subpath)
// ----------------------------------------------------------------------------
describe("ranker — @delei regression (picker-rank-subpath floor)", () => {
  const cands = [
    mkCand("deep", "@office/Finance/Accounts/Delei/SPD"),
    mkCand("exact", "@delei"),
    mkCand("prefix-c", "@delei.c"),
    mkCand("prefix-org", "@delei.org"),
  ]

  it("exact @delei outranks deep subpath Delei", () => {
    expect(ranked("delei", cands)[0]).toBe("exact")
  })

  it("deep subpath ranks last among matchers", () => {
    const r = ranked("delei", cands)
    expect(r[r.length - 1]).toBe("deep")
  })

  it("shorter prefix beats longer prefix (@delei.c before @delei.org)", () => {
    const cPrefix = [mkCand("prefix-c", "@delei.c"), mkCand("prefix-org", "@delei.org")]
    expect(ranked("delei", cPrefix)).toEqual(["prefix-c", "prefix-org"])
  })

  it("full canonical expected order", () => {
    // exact (10000-body) > @delei.c (5000-short) > @delei.org (5000-longer)
    //   > @office/.../Delei/SPD (segment substring or fuzzy — must be last)
    expect(ranked("delei", cands)).toEqual(["exact", "prefix-c", "prefix-org", "deep"])
  })
})

// ----------------------------------------------------------------------------
// Smart-term ranking — tiered floor
// ----------------------------------------------------------------------------
describe("ranker — tiered smart ranking", () => {
  it("exact > prefix > segment-boundary substring > mid-segment substring > fuzzy", () => {
    const cands = [
      mkCand("fuzzy", "f_o_o_xyz"), // fuzzy (Tier 5)
      mkCand("prefix", "fooX"), // prefix (Tier 2)
      mkCand("segment", "alpha/foo_bar"), // segment-boundary substring (Tier 3)
      mkCand("mid", "xxfooxx"), // mid-segment substring (Tier 4)
      mkCand("exact", "foo"), // exact (Tier 1)
    ]
    expect(ranked("foo", cands)).toEqual(["exact", "prefix", "segment", "mid", "fuzzy"])
  })

  it("shorter exact wins when both are exact-equal (length dampener)", () => {
    // Ranker length dampener (10000 - t.length) means the shorter one wins;
    // with equal-length exact matches, id-asc breaks the tie.
    const cands = [mkCand("a1", "foo"), mkCand("a2", "foo")]
    expect(ranked("foo", cands)).toEqual(["a1", "a2"])
  })
})

// ----------------------------------------------------------------------------
// Parent / path field weighting
// ----------------------------------------------------------------------------
describe("ranker — field weighting (title > parent > path)", () => {
  it("title match outranks equivalent parent-context match", () => {
    const cands = [
      mkCand("p", "unrelated", { parentContext: "foo bar baz" }),
      mkCand("t", "foo bar baz"),
    ]
    // Title is 1.0× vs parent 0.8× — title wins.
    expect(ranked("foo", cands)[0]).toBe("t")
  })

  it("falls back to parent when title doesn't match", () => {
    const cands = [
      mkCand("p", "no-match-here", { parentContext: "foo" }),
      mkCand("none", "unrelated"),
    ]
    expect(ranked("foo", cands)).toEqual(["p"])
  })

  it("falls back to path when neither title nor parent match", () => {
    const cands = [
      mkCand("p", "no-match", { parentContext: "also-no", path: "a/foo/b" }),
      mkCand("none", "unrelated"),
    ]
    expect(ranked("foo", cands)).toEqual(["p"])
  })
})

// ----------------------------------------------------------------------------
// Negation (exclude)
// ----------------------------------------------------------------------------
describe("ranker — exclude terms", () => {
  it("-foo removes any candidate containing foo", () => {
    const cands = [
      mkCand("keep", "bar baz"),
      mkCand("drop-title", "foo baz"),
      mkCand("drop-parent", "bar", { parentContext: "foo" }),
    ]
    expect(ranked("bar -foo", cands)).toEqual(["keep"])
  })

  it("!foo is equivalent to -foo (fzf syntax)", () => {
    const cands = [mkCand("keep", "bar"), mkCand("drop", "foo")]
    expect(ranked("bar !foo", cands)).toEqual(["keep"])
  })
})

// ----------------------------------------------------------------------------
// Phrase terms
// ----------------------------------------------------------------------------
describe("ranker — phrase terms", () => {
  it('"new project" requires exact substring "new project"', () => {
    const cands = [
      mkCand("a", "new project launch"), // exact substring → matches
      mkCand("b", "project new things"), // words present but not adjacent → no match
    ]
    expect(ranked('"new project"', cands)).toEqual(["a"])
  })

  it("phrase term never fuzzy-matches", () => {
    const cands = [
      mkCand("a", "n_e_w_p"), // fuzzy-only → phrase must reject
    ]
    expect(ranked('"new"', cands)).toEqual([])
  })
})

// ----------------------------------------------------------------------------
// Task filter
// ----------------------------------------------------------------------------
describe("ranker — bracket task filter", () => {
  const todo = mkNode("t", "buy milk", { item: { list: "-", task: { marker: "[ ]", status: "todo" } } })
  const done = mkNode("d", "buy eggs", { item: { list: "-", task: { marker: "[x]", status: "done" } } })
  const plain = mkNode("p", "not-a-task")

  const candsNode = [
    { node: todo, title: "buy milk" },
    { node: done, title: "buy eggs" },
    { node: plain, title: "not-a-task" },
  ]

  it("[] matches any task, excludes non-task", () => {
    const r = rankResults(parseQuery("[]"), candsNode).map((x) => x.node.id)
    expect(r).toEqual(["d", "t"]) // lex order by title: "buy eggs" < "buy milk"
  })

  it("[x] matches only done tasks", () => {
    const r = rankResults(parseQuery("[x]"), candsNode).map((x) => x.node.id)
    expect(r).toEqual(["d"])
  })

  it("[ ] + text term narrows to todo tasks matching text", () => {
    const r = rankResults(parseQuery("[ ] milk"), candsNode).map((x) => x.node.id)
    expect(r).toEqual(["t"])
  })
})

// ----------------------------------------------------------------------------
// Empty query
// ----------------------------------------------------------------------------
describe("ranker — empty query", () => {
  it("returns all candidates sorted by title", () => {
    const cands = [mkCand("z", "zebra"), mkCand("a", "apple"), mkCand("m", "mango")]
    expect(ranked("", cands)).toEqual(["a", "m", "z"])
  })
})

// ----------------------------------------------------------------------------
// Determinism — stable sort
// ----------------------------------------------------------------------------
describe("ranker — determinism", () => {
  it("same-score ties break on id ascending (stable)", () => {
    const cands = [mkCand("c", "foo"), mkCand("a", "foo"), mkCand("b", "foo")]
    expect(ranked("foo", cands)).toEqual(["a", "b", "c"])
  })
})

// ----------------------------------------------------------------------------
// Sticky selection (result stability)
// ----------------------------------------------------------------------------
describe("stickySelectedIndex", () => {
  it("finds the previously-selected node in the new result list", () => {
    const cands = [mkCand("a", "foo"), mkCand("b", "foo_bar"), mkCand("c", "foo_bar_baz")]
    const results = rankResults(parseQuery("foo"), cands)
    // previous user was on id "b"
    expect(stickySelectedIndex(results, "b")).toBeGreaterThanOrEqual(0)
    expect(results[stickySelectedIndex(results, "b")]!.node.id).toBe("b")
  })

  it("returns -1 when the previous selection is no longer in results", () => {
    const cands = [mkCand("a", "foo")]
    const results = rankResults(parseQuery("foo"), cands)
    expect(stickySelectedIndex(results, "gone")).toBe(-1)
  })

  it("protects against fast-typing wrong-Enter: previously-selected id stays findable across reranks", () => {
    // Simulate a user typing "fo" then "foo" — result set shrinks but the
    // previously-selected id must still be locatable in the new results.
    const cands = [mkCand("x", "format"), mkCand("y", "food"), mkCand("z", "foo")]
    const r1 = rankResults(parseQuery("fo"), cands)
    const r2 = rankResults(parseQuery("foo"), cands)
    // User was on "y" (food) in r1; r2 still contains it.
    expect(stickySelectedIndex(r1, "y")).toBeGreaterThanOrEqual(0)
    expect(stickySelectedIndex(r2, "y")).toBeGreaterThanOrEqual(0)
  })
})

// ----------------------------------------------------------------------------
// Recency hook (km-tui.omnibox-recents TODO)
// ----------------------------------------------------------------------------
describe("ranker — recency hook (wired-but-not-fed)", () => {
  it("recencyBoost adds to the score and can flip a tie", () => {
    const cands = [mkCand("a", "foo"), mkCand("b", "foo")]
    const parsed = parseQuery("foo")
    const base = rankResults(parsed, cands)
    // Without boost, a < b by id-asc.
    expect(base.map((r) => r.node.id)).toEqual(["a", "b"])
    // With a boost for b, b should win.
    const boosted = rankResults(parsed, cands, { recencyBoost: (id) => (id === "b" ? 10_000 : 0) })
    expect(boosted.map((r) => r.node.id)).toEqual(["b", "a"])
  })
})

// ----------------------------------------------------------------------------
// highlightMatches — typed spans (NOT HTML, NOT ANSI)
// ----------------------------------------------------------------------------
describe("highlightMatches", () => {
  it("returns [] for empty query", () => {
    expect(highlightMatches("hello", parseQuery(""))).toEqual([])
  })

  it("highlights a single smart substring match", () => {
    expect(highlightMatches("hello world", parseQuery("world"))).toEqual([{ start: 6, end: 11 }])
  })

  it("highlights a phrase match literally", () => {
    expect(highlightMatches("new project kickoff", parseQuery('"new project"'))).toEqual([
      { start: 0, end: 11 },
    ])
  })

  it("merges overlapping spans from multiple terms", () => {
    // "foo" (0..3) and "oob" (1..4) overlap → one span (0..4)
    const spans = highlightMatches("foobar", parseQuery("foo oob"))
    expect(spans).toEqual([{ start: 0, end: 4 }])
  })

  it("skips negated terms", () => {
    expect(highlightMatches("foobar baz", parseQuery("foo -baz"))).toEqual([{ start: 0, end: 3 }])
  })

  it("falls back to fzf-style spans when substring is not present", () => {
    // 'abc' is not a substring of 'a_b_c' but is a char-order match.
    const spans = highlightMatches("a_b_c", parseQuery("abc"))
    expect(spans.length).toBeGreaterThan(0)
    // Each matched char should be inside a span.
    const covers = (i: number) => spans.some((s) => i >= s.start && i < s.end)
    expect(covers(0)).toBe(true)
    expect(covers(2)).toBe(true)
    expect(covers(4)).toBe(true)
  })

  it("returns typed spans (plain objects, no HTML/ANSI)", () => {
    const spans = highlightMatches("hello", parseQuery("ello"))
    expect(spans).toEqual([{ start: 1, end: 5 }])
    for (const s of spans) {
      expect(typeof s.start).toBe("number")
      expect(typeof s.end).toBe("number")
    }
  })
})
