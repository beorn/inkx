/**
 * Unit tests for syntax-linker pattern matcher.
 *
 * Bead: km-silvercode.autolinks-config
 */

import { describe, expect, test } from "vitest"
import { parseSyntaxlinksYaml } from "../../src/autolinks/config.ts"
import { detectAutolinks, mergeDetections } from "../../src/autolinks/match.ts"
import { detectReferences } from "../../src/detection.ts"

function rulesFromYaml(yaml: string) {
  return parseSyntaxlinksYaml(yaml)
}

describe("detectAutolinks", () => {
  test("finds literal patterns and emits autolink detections", () => {
    const rules = rulesFromYaml(`
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/path/to/repo"
    preview: readme
`)
    const detections = detectAutolinks("see ~repo for details", rules)
    expect(detections).toHaveLength(1)
    const d = detections[0]!
    expect(d.kind).toBe("autolink")
    expect(d.match).toBe("~repo")
    expect(d.start).toBe(4)
    expect(d.end).toBe(9)
    expect(d.payload.resolves_to).toBe("/path/to/repo")
    expect(d.payload.preview).toBe("readme")
  })

  test("regex pattern produces multiple matches", () => {
    const rules = rulesFromYaml(`
syntaxlinks:
  - pattern: "/\\\\+\\\\w+/"
    resolves_to: "/Users/beorn/Code"
    preview: bd-active
`)
    const detections = detectAutolinks("ping +km and +pam", rules)
    expect(detections.map((d) => d.match)).toEqual(["+km", "+pam"])
    // Same rule, same target — but the cache_key differentiates per-match.
    expect(detections[0]!.payload.cache_key).not.toBe(detections[1]!.payload.cache_key)
  })

  test("non-overlapping output: earlier rule wins", () => {
    const rules = rulesFromYaml(`
syntaxlinks:
  - pattern: "abc"
    resolves_to: "/a"
    preview: readme
  - pattern: "/[a-z]+/"
    resolves_to: "/b"
    preview: readme
`)
    const detections = detectAutolinks("abc def", rules)
    // The first rule's "abc" wins over the regex's "abc" (ties broken by rule_idx ascending),
    // and the regex still matches "def" cleanly.
    expect(detections.map((d) => d.match)).toEqual(["abc", "def"])
    expect(detections[0]!.payload.resolves_to).toBe("/a")
    expect(detections[1]!.payload.resolves_to).toBe("/b")
  })

  test("empty rule list returns []", () => {
    expect(detectAutolinks("anything goes", [])).toEqual([])
  })

  test("empty input returns []", () => {
    const rules = rulesFromYaml(`
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/x"
    preview: readme
`)
    expect(detectAutolinks("", rules)).toEqual([])
  })
})

describe("mergeDetections", () => {
  test("built-in URL takes priority over an autolink that overlaps it", () => {
    const text = "see https://example.com/x for details"
    const builtins = detectReferences(text)
    const autolinkRules = rulesFromYaml(`
syntaxlinks:
  - pattern: "/example\\\\.com\\\\/x/"
    resolves_to: "/local/x"
    preview: readme
`)
    const autolinks = detectAutolinks(text, autolinkRules)
    const merged = mergeDetections(builtins, autolinks)
    // The URL detection wins; the autolink that intersects it is dropped.
    const kinds = merged.map((d) => d.kind)
    expect(kinds).toContain("url")
    expect(kinds).not.toContain("autolink")
  })

  test("non-overlapping autolinks merge in start order", () => {
    // Use patterns that don't trip the built-in FILE/URL detection so this
    // test focuses on autolink merging, not the precedence rules covered above.
    const text = "look at AGENTS and call km-thing later"
    const builtins = detectReferences(text).filter((d) => d.kind !== "bead")
    const autolinkRules = rulesFromYaml(`
syntaxlinks:
  - pattern: "AGENTS"
    resolves_to: "agents-target"
    preview: readme
  - pattern: "km-thing"
    resolves_to: "km-target"
    preview: first-paragraph
`)
    const autolinks = detectAutolinks(text, autolinkRules)
    const merged = mergeDetections(builtins, autolinks)
    // Filter out anything not from us and verify both autolinks survive in order.
    const ours = merged.filter((d) => d.kind === "autolink").map((d) => d.match)
    expect(ours).toEqual(["AGENTS", "km-thing"])
  })

  test("built-in file detection wins over an overlapping autolink (documents priority)", () => {
    // Demonstrates that built-in detections shadow user autolinks when the
    // ranges overlap. Authors of `~repo`-style patterns will see this:
    // the tilde-path is a built-in file detection, so the autolink is dropped.
    const text = "look at ~repo here"
    const builtins = detectReferences(text)
    const autolinkRules = rulesFromYaml(`
syntaxlinks:
  - pattern: "~repo"
    resolves_to: "/r"
    preview: readme
`)
    const autolinks = detectAutolinks(text, autolinkRules)
    const merged = mergeDetections(builtins, autolinks)
    // Only the built-in file detection survives.
    expect(merged.some((d) => d.kind === "file" && d.match === "~repo")).toBe(true)
    expect(merged.some((d) => d.kind === "autolink")).toBe(false)
  })
})
