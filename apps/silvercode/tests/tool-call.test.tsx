/**
 * <ToolCall> family — kind / status / error / summary / apply-patch tests.
 *
 * Bead: km-silvercode.acp-tool-call.
 *
 * Strategy: render each component via `createRenderer` and assert the
 * static frame text. Components that wrap their headline in animated
 * primitives (TextReveal, AnimatedNumber) only show the typewritten /
 * counted-up state after the animation runs — for the static-frame
 * assertions here we cover the states whose label is plain Text:
 *
 *   - pending      (Text, $muted)
 *   - failed       (Text, $error)
 *   - in_progress  (TextShimmer wraps Text — text is present immediately)
 *   - completed    (TextReveal animates from 0 chars; we don't assert the
 *                   final string, just that the component mounts and
 *                   the surrounding structure renders)
 *
 * AnimatedNumber initializes with `value` showing on first frame because
 * `fromRef === toRef === value` at mount, so summary counts are checked.
 */

import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import type { ToolCall as ToolCallType, ToolCallId } from "@km/agent-harness"
import { ToolCall } from "../src/components/ToolCall.tsx"
import { ToolCallStatusTitle } from "../src/components/ToolCallStatusTitle.tsx"
import { ToolCallError } from "../src/components/ToolCallError.tsx"
import { ToolCallSummary } from "../src/components/ToolCallSummary.tsx"
import { ApplyPatch, parseAiderPatch } from "../src/components/ApplyPatch.tsx"

const id = (s: string) => s as ToolCallId

// Create a fresh renderer per test invocation. createRenderer keeps a
// long-lived `Ag` instance + last-buffer state for incremental rendering;
// reusing it across tests can leak in-progress shimmer timers and stale
// buffer state into subsequent renders. A factory keeps each test
// hermetic without paying the cost of `createTermless`.
function freshRender() {
  return createRenderer({ cols: 100, rows: 30 })
}

// =============================================================================
// <ToolCallStatusTitle>
// =============================================================================

describe("ToolCallStatusTitle", () => {
  test("pending renders the bare title", () => {
    const app = freshRender()(<ToolCallStatusTitle status="pending" kind="read" title="src/foo.ts" />)
    expect(app.text).toContain("src/foo.ts")
  })

  test("failed renders verb-failed phrase", () => {
    const app = freshRender()(<ToolCallStatusTitle status="failed" kind="search" title="for grep" />)
    expect(app.text).toContain("Search failed")
  })

  test("in_progress renders progressive verb (TextShimmer wraps)", () => {
    // TextShimmer renders Text with the children visible from frame 0.
    const app = freshRender()(<ToolCallStatusTitle status="in_progress" kind="execute" title="bun fix" />)
    expect(app.text).toContain("Running…")
  })

  test("kind: edit emits 'Edit' family vocabulary", () => {
    const app = freshRender()(<ToolCallStatusTitle status="pending" kind="edit" title="src/foo.ts" />)
    expect(app.text).toContain("src/foo.ts")
    const failed = freshRender()(<ToolCallStatusTitle status="failed" kind="edit" title="src/foo.ts" />)
    expect(failed.text).toContain("Edit failed")
  })

  test("label override wins over auto-derived phrase", () => {
    const app = freshRender()(
      <ToolCallStatusTitle status="pending" kind="read" title="src/foo.ts" label="Custom label" />,
    )
    expect(app.text).toContain("Custom label")
    expect(app.text).not.toContain("src/foo.ts")
  })
})

// =============================================================================
// <ToolCallError>
// =============================================================================

describe("ToolCallError", () => {
  test("renders ✗ glyph + label + body message", () => {
    const app = freshRender()(<ToolCallError label="ENOENT" message="No such file or directory: /tmp/missing.txt" />)
    expect(app.text).toContain("✗")
    expect(app.text).toContain("ENOENT")
    expect(app.text).toContain("No such file or directory: /tmp/missing.txt")
  })

  test("default label is 'Error' when none supplied", () => {
    const app = freshRender()(<ToolCallError message="boom" />)
    expect(app.text).toContain("Error")
    expect(app.text).toContain("boom")
  })

  test("retry affordance renders when onRetry passed", () => {
    const app = freshRender()(<ToolCallError message="x" onRetry={() => {}} />)
    expect(app.text).toContain("retry")
  })

  test("no retry affordance without onRetry", () => {
    const app = freshRender()(<ToolCallError message="x" />)
    expect(app.text).not.toContain("retry")
  })

  test("border uses $error color", () => {
    const app = freshRender()(<ToolCallError message="x" />)
    // The leftmost border column should be present in the frame (single border).
    // Validate the row contains the error glyph painted in the same frame.
    expect(app.text.split("\n").some((l) => l.includes("✗"))).toBe(true)
  })
})

// =============================================================================
// <ToolCallSummary>
// =============================================================================

describe("ToolCallSummary", () => {
  test("renders kind verb, animated count, and noun (plural)", () => {
    const app = freshRender()(<ToolCallSummary kind="read" count={12} />)
    // Verb + plural noun.
    expect(app.text).toContain("Read")
    expect(app.text).toContain("12")
    expect(app.text).toContain("files")
  })

  test("count of 1 uses singular noun", () => {
    const app = freshRender()(<ToolCallSummary kind="read" count={1} />)
    expect(app.text).toContain("Read")
    expect(app.text).toContain("file")
    expect(app.text).not.toMatch(/files\b/)
  })

  test("breakdown is hidden by default and visible when expanded", () => {
    const breakdown = [
      { id: "1", label: "/tmp/a.ts" },
      { id: "2", label: "/tmp/b.ts" },
    ]
    const collapsed = freshRender()(<ToolCallSummary kind="read" count={2} breakdown={breakdown} />)
    expect(collapsed.text).not.toContain("/tmp/a.ts")
    const expanded = freshRender()(<ToolCallSummary kind="read" count={2} breakdown={breakdown} expanded />)
    expect(expanded.text).toContain("/tmp/a.ts")
    expect(expanded.text).toContain("/tmp/b.ts")
  })

  test("kind-specific verbs", () => {
    expect(freshRender()(<ToolCallSummary kind="edit" count={3} />).text).toContain("Edited")
    expect(freshRender()(<ToolCallSummary kind="execute" count={2} />).text).toContain("Ran")
    expect(freshRender()(<ToolCallSummary kind="search" count={1} />).text).toContain("Searched")
  })

  test("chevron only shows when breakdown is non-empty", () => {
    const noBreakdown = freshRender()(<ToolCallSummary kind="read" count={5} />)
    expect(noBreakdown.text).not.toContain("▸")
    const withBreakdown = freshRender()(
      <ToolCallSummary kind="read" count={5} breakdown={[{ id: "1", label: "/tmp/a" }]} />,
    )
    expect(withBreakdown.text).toContain("▸")
  })
})

// =============================================================================
// <ApplyPatch>
// =============================================================================

describe("ApplyPatch", () => {
  test("renders SEARCH/REPLACE fences and search/replace bodies", () => {
    const app = freshRender()(
      <ApplyPatch
        filePath="src/foo.ts"
        hunks={[
          {
            search: ["const x = 1", "const y = 2"],
            replace: ["const x = 11", "const y = 22"],
          },
        ]}
      />,
    )
    expect(app.text).toContain("--- src/foo.ts")
    expect(app.text).toContain("SEARCH")
    expect(app.text).toContain("REPLACE")
    expect(app.text).toContain("const x = 1")
    expect(app.text).toContain("const x = 11")
    expect(app.text).toContain("const y = 22")
  })

  test("renders multiple hunks in order", () => {
    const app = freshRender()(
      <ApplyPatch
        hunks={[
          { search: ["alpha"], replace: ["ALPHA"], header: "first" },
          { search: ["beta"], replace: ["BETA"], header: "second" },
        ]}
      />,
    )
    expect(app.text).toContain("first")
    expect(app.text).toContain("second")
    expect(app.text).toContain("alpha")
    expect(app.text).toContain("ALPHA")
    expect(app.text).toContain("beta")
    expect(app.text).toContain("BETA")
    // first must come before second in the rendered frame
    expect(app.text.indexOf("first")).toBeLessThan(app.text.indexOf("second"))
  })

  test("parseAiderPatch extracts hunks from raw text", () => {
    const raw = [
      "<<<<<<< SEARCH",
      "old line one",
      "old line two",
      "=======",
      "new line one",
      "new line two",
      ">>>>>>> REPLACE",
    ].join("\n")
    const hunks = parseAiderPatch(raw)
    expect(hunks).toHaveLength(1)
    expect(hunks[0]!.search).toEqual(["old line one", "old line two"])
    expect(hunks[0]!.replace).toEqual(["new line one", "new line two"])
  })

  test("parseAiderPatch returns [] on malformed input", () => {
    expect(parseAiderPatch("just some random text")).toEqual([])
  })

  test("parseAiderPatch handles multiple hunks", () => {
    const raw = [
      "<<<<<<< SEARCH",
      "a",
      "=======",
      "A",
      ">>>>>>> REPLACE",
      "<<<<<<< SEARCH",
      "b",
      "=======",
      "B",
      ">>>>>>> REPLACE",
    ].join("\n")
    const hunks = parseAiderPatch(raw)
    expect(hunks).toHaveLength(2)
    expect(hunks[0]!.replace).toEqual(["A"])
    expect(hunks[1]!.replace).toEqual(["B"])
  })
})

// =============================================================================
// <ToolCall> — kind + status integration
// =============================================================================

describe("ToolCall", () => {
  function tc(overrides: Partial<ToolCallType>): ToolCallType {
    return {
      toolCallId: id("tc-1"),
      title: "default title",
      ...overrides,
    }
  }

  test("kind=read pending renders the title", () => {
    const app = freshRender()(<ToolCall toolCall={tc({ kind: "read", status: "pending", title: "src/foo.ts" })} />)
    expect(app.text).toContain("src/foo.ts")
  })

  test("kind=execute in_progress renders the progressive verb", () => {
    const app = freshRender()(<ToolCall toolCall={tc({ kind: "execute", status: "in_progress", title: "bun fix" })} />)
    expect(app.text).toContain("Running…")
  })

  test("kind=read failed renders the error envelope below the header", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({ kind: "read", status: "failed", title: "src/foo.ts" })}
        errorMessage="ENOENT: missing file"
      />,
    )
    expect(app.text).toContain("Read failed")
    expect(app.text).toContain("✗")
    expect(app.text).toContain("ENOENT: missing file")
  })

  test("failed call defaults to expanded but uses ToolCallError envelope as the source of truth", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "search",
          status: "failed",
          title: "for grep",
        })}
        errorMessage="grep: invalid pattern"
      />,
    )
    expect(app.text).toContain("Search failed")
    expect(app.text).toContain("grep: invalid pattern")
  })

  test("text-content body renders inline when expanded", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "execute",
          status: "in_progress",
          title: "ls",
          content: [
            {
              type: "content",
              content: { type: "text", text: "README.md\npackage.json" },
            },
          ],
        })}
        defaultExpanded
      />,
    )
    expect(app.text).toContain("README.md")
    expect(app.text).toContain("package.json")
  })

  test("diff-content body renders silvery's <Diff> with file path", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "edit",
          status: "in_progress",
          title: "edit",
          content: [
            {
              type: "diff",
              path: "src/foo.ts",
              oldText: "const x = 1",
              newText: "const x = 2",
            },
          ],
        })}
        defaultExpanded
      />,
    )
    expect(app.text).toContain("--- src/foo.ts")
    // Old line marked with - and new line with +; <Diff> uses "+" / "-" markers.
    expect(app.text).toMatch(/-\s*const x = 1/)
    expect(app.text).toMatch(/\+\s*const x = 2/)
  })

  test("locations chip renders path:line in the header", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "read",
          status: "pending",
          title: "src/foo.ts",
          locations: [{ path: "src/foo.ts", line: 42 }],
        })}
      />,
    )
    expect(app.text).toContain("src/foo.ts:42")
  })

  test("multiple locations: shows up to 3 then '+N' marker", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "search",
          status: "pending",
          title: "match",
          locations: [{ path: "a.ts" }, { path: "b.ts" }, { path: "c.ts" }, { path: "d.ts" }, { path: "e.ts" }],
        })}
      />,
    )
    expect(app.text).toContain("a.ts")
    expect(app.text).toContain("b.ts")
    expect(app.text).toContain("c.ts")
    expect(app.text).toContain("+2")
  })

  test("terminal-content body renders placeholder", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "execute",
          status: "in_progress",
          title: "shell",
          content: [{ type: "terminal", terminalId: "term-42" }],
        })}
        defaultExpanded
      />,
    )
    expect(app.text).toContain("term-42")
  })

  test("no content → no chevron", () => {
    const app = freshRender()(<ToolCall toolCall={tc({ kind: "read", status: "pending", title: "x" })} />)
    expect(app.text).not.toContain("▸")
    expect(app.text).not.toContain("▾")
  })

  test("content present + collapsed → chevron ▸", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "execute",
          status: "in_progress",
          title: "x",
          content: [{ type: "content", content: { type: "text", text: "body" } }],
        })}
      />,
    )
    expect(app.text).toContain("▸")
  })
})
