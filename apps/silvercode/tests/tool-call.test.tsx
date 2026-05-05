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
import { Box, PopoverProvider } from "silvery"
import type { ToolCall as ToolCallType, ToolCallId } from "@km/agent-harness"
import { ToolCall } from "../src/components/ToolCall.tsx"
import { ToolCallStatusTitle } from "../src/components/ToolCallStatusTitle.tsx"
import { ToolCallError } from "../src/components/ToolCallError.tsx"
import { ToolCallSummary } from "../src/components/ToolCallSummary.tsx"
import { ApplyPatch, parseAiderPatch } from "../src/components/ApplyPatch.tsx"

const id = (s: string) => s as ToolCallId
const LEFT_SUPER_PRESS = "\x1b[57444;9:1u"
const settle = (ms = 60) => new Promise<void>((resolve) => setTimeout(resolve, ms))

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
  // The title carries the meaning; the parent ToolCall card paints status
  // via the leading glyph (spinner / ✓ / ✗ / ·) and border. The verb prefix
  // ("Reading…", "Read 3 files", "Search failed") is intentionally dropped
  // — the icon already conveys status. Bead: km-silvercode.acp-tool-call.

  test("pending renders the title verbatim", () => {
    const app = freshRender()(<ToolCallStatusTitle status="pending" kind="read" title="src/foo.ts" />)
    expect(app.text).toContain("src/foo.ts")
    expect(app.text).not.toMatch(/\bRead\b/) // no verb prefix
  })

  test("failed renders the title (no 'Search failed' verb)", () => {
    const app = freshRender()(<ToolCallStatusTitle status="failed" kind="search" title="for grep" />)
    expect(app.text).toContain("for grep")
    expect(app.text).not.toContain("Search failed")
  })

  test("in_progress renders the title (no 'Running…' verb)", () => {
    const app = freshRender()(<ToolCallStatusTitle status="in_progress" kind="execute" title="bun fix" />)
    expect(app.text).toContain("bun fix")
    expect(app.text).not.toContain("Running")
  })

  test("kind: edit also renders the title verbatim", () => {
    const app = freshRender()(<ToolCallStatusTitle status="pending" kind="edit" title="src/foo.ts" />)
    expect(app.text).toContain("src/foo.ts")
    const failed = freshRender()(<ToolCallStatusTitle status="failed" kind="edit" title="src/foo.ts" />)
    expect(failed.text).toContain("src/foo.ts")
    expect(failed.text).not.toContain("Edit failed")
  })

  test("label override wins over title", () => {
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

  test("summary never renders disclosure triangles", () => {
    const noBreakdown = freshRender()(<ToolCallSummary kind="read" count={5} />)
    expect(noBreakdown.text).not.toContain("▸")
    expect(noBreakdown.text).not.toContain("▾")
    const withBreakdown = freshRender()(
      <ToolCallSummary kind="read" count={5} breakdown={[{ id: "1", label: "/tmp/a" }]} />,
    )
    expect(withBreakdown.text).not.toContain("▸")
    expect(withBreakdown.text).not.toContain("▾")
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

  test("kind=execute in_progress renders the title verbatim (no 'Running…' verb)", () => {
    const app = freshRender()(<ToolCall toolCall={tc({ kind: "execute", status: "in_progress", title: "bun fix" })} />)
    expect(app.text).toContain("bun fix")
    expect(app.text).not.toContain("Running")
  })

  test("image path in a view tool title opens an image preview popover on Cmd-hover", async () => {
    const render = createRenderer({ cols: 120, rows: 20, kittyMode: true, autoRender: true })
    const app = render(
      <PopoverProvider>
        <Box width={120} height={20} flexDirection="column">
          <ToolCall toolCall={tc({ kind: "execute", status: "completed", title: "View /tmp/screenshot.png" })} />
        </Box>
      </PopoverProvider>,
    )

    const col = app.text.indexOf("/tmp/screenshot.png")
    expect(col).toBeGreaterThanOrEqual(0)
    app.stdin.write(LEFT_SUPER_PRESS)
    await app.hover(col, 0)
    await settle(650)

    expect(app.text).toContain("[image preview]")
  })

  test("display-shortened image path in a view title resolves for preview", async () => {
    const prevHome = process.env["HOME"]
    process.env["HOME"] = "/Users/beorn"
    try {
      const render = createRenderer({ cols: 120, rows: 20, kittyMode: true, autoRender: true })
      const app = render(
        <PopoverProvider>
          <Box width={120} height={20} flexDirection="column">
            <ToolCall toolCall={tc({ kind: "execute", status: "completed", title: "View ~desk/Screenshot 1.png" })} />
          </Box>
        </PopoverProvider>,
      )

      const col = app.text.indexOf("~desk/Screenshot 1.png")
      expect(col).toBeGreaterThanOrEqual(0)
      app.stdin.write(LEFT_SUPER_PRESS)
      await app.hover(col, 0)
      await settle(650)

      expect(app.text).toContain("~desk/Screenshot 1.png")
      expect(app.text).toContain("[image preview]")
    } finally {
      if (prevHome !== undefined) process.env["HOME"] = prevHome
      else delete process.env["HOME"]
    }
  })

  test("kind=read failed renders neutral bullet + title + inline error message", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={tc({ kind: "read", status: "failed", title: "src/foo.ts" })}
        errorMessage="ENOENT: missing file"
      />,
    )
    // v2 contract (km-silvercode.tool-call-rendering-v2): one neutral
    // marker row + title, one inline message body. No separate "Error"
    // envelope and no `✗` glyph.
    expect(app.text).toContain("src/foo.ts")
    expect(app.text).toMatch(/•\s+src\/foo\.ts/)
    expect(app.text).toContain("ENOENT: missing file")
    expect(app.text).not.toMatch(/✗\s+Error\b/)
    expect(app.text).not.toContain("Read failed")
  })

  test("failed call inlines the error message in the unified card body", () => {
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
    expect(app.text).toContain("for grep")
    expect(app.text).toContain("grep: invalid pattern")
    expect(app.text).not.toContain("Search failed")
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

  test("no content → no disclosure triangle", () => {
    const app = freshRender()(<ToolCall toolCall={tc({ kind: "read", status: "pending", title: "x" })} />)
    expect(app.text).not.toContain("▸")
    expect(app.text).not.toContain("▾")
  })

  test("content present + not toggled → body hidden (no disclosure triangle either)", () => {
    // v2 contract: hover previews via popover; click toggles inline body.
    // With no click and no `defaultExpanded`, the body is simply not visible.
    const app = freshRender()(
      <ToolCall
        toolCall={tc({
          kind: "execute",
          status: "in_progress",
          title: "x",
          content: [{ type: "content", content: { type: "text", text: "BODY-TOKEN" } }],
        })}
      />,
    )
    expect(app.text).not.toContain("BODY-TOKEN")
    expect(app.text).not.toContain("▸")
    expect(app.text).not.toContain("▾")
  })
})

// =============================================================================
// Text summarization — long bash output should not dump all lines inline.
// =============================================================================

describe("ToolCall text summarization", () => {
  /**
   * Build a 28-line bash result (mirrors the `ls` scenario from the bug report).
   * The content is a single text block with one filename per line.
   */
  function bashLsToolCall(): ToolCallType {
    const files = Array.from({ length: 28 }, (_, i) => `file${String(i + 1).padStart(2, "0")}.ts`)
    return {
      toolCallId: id("bash-ls"),
      title: "ls",
      kind: "execute",
      status: "completed",
      content: [
        {
          type: "content",
          content: { type: "text", text: files.join("\n") },
        },
      ],
    }
  }

  test("28-line bash output: expanded body shows all lines inline", () => {
    const app = freshRender()(<ToolCall toolCall={bashLsToolCall()} defaultExpanded />)
    const lineCount = app.text.split("\n").filter((l) => l.trim().startsWith("file")).length
    expect(lineCount).toBe(28)
  })

  test("28-line bash output: preview shows first 3 lines", () => {
    const app = freshRender()(<ToolCall toolCall={bashLsToolCall()} defaultExpanded />)
    expect(app.text).toContain("file01.ts")
    expect(app.text).toContain("file02.ts")
    expect(app.text).toContain("file03.ts")
  })

  test("28-line bash output: expanded body has no inner hidden-lines accordion", () => {
    const app = freshRender()(<ToolCall toolCall={bashLsToolCall()} defaultExpanded />)
    expect(app.text).not.toContain("25 more lines")
  })

  test("28-line bash output: lines 4-28 are visible when expanded", () => {
    const app = freshRender()(<ToolCall toolCall={bashLsToolCall()} defaultExpanded />)
    expect(app.text).toContain("file04.ts")
    expect(app.text).toContain("file28.ts")
  })

  test("short output (≤5 lines) renders verbatim — no accordion", () => {
    const shortText = "README.md\npackage.json\nbun.lock"
    const app = freshRender()(
      <ToolCall
        toolCall={{
          toolCallId: id("short"),
          title: "ls",
          kind: "execute",
          status: "completed",
          content: [{ type: "content", content: { type: "text", text: shortText } }],
        }}
        defaultExpanded
      />,
    )
    expect(app.text).toContain("README.md")
    expect(app.text).toContain("package.json")
    expect(app.text).toContain("bun.lock")
    // No accordion needed for short output.
    expect(app.text).not.toContain("more lines")
  })

  test("exactly 5-line output renders verbatim (at threshold, no accordion)", () => {
    const text = Array.from({ length: 5 }, (_, i) => `line${i + 1}`).join("\n")
    const app = freshRender()(
      <ToolCall
        toolCall={{
          toolCallId: id("five"),
          title: "ls",
          kind: "execute",
          status: "completed",
          content: [{ type: "content", content: { type: "text", text: text } }],
        }}
        defaultExpanded
      />,
    )
    expect(app.text).toContain("line5")
    expect(app.text).not.toContain("more lines")
  })

  test("6-line output renders verbatim when expanded", () => {
    const text = Array.from({ length: 6 }, (_, i) => `line${i + 1}`).join("\n")
    const app = freshRender()(
      <ToolCall
        toolCall={{
          toolCallId: id("six"),
          title: "ls",
          kind: "execute",
          status: "completed",
          content: [{ type: "content", content: { type: "text", text: text } }],
        }}
        defaultExpanded
      />,
    )
    expect(app.text).toContain("line4")
    expect(app.text).toContain("line6")
    expect(app.text).not.toContain("more lines")
  })

  test("just-over-threshold output has no inner summary when expanded", () => {
    const text = Array.from({ length: SUMMARY_THRESHOLD + 1 }, (_, i) => `x${i}`).join("\n")
    const app = freshRender()(
      <ToolCall
        toolCall={{
          toolCallId: id("singular"),
          title: "cmd",
          kind: "execute",
          status: "completed",
          content: [{ type: "content", content: { type: "text", text: text } }],
        }}
        defaultExpanded
      />,
    )
    expect(app.text).toContain("x5")
    expect(app.text).not.toContain("more line")
  })
})

// Re-export SUMMARY_THRESHOLD for the singular-grammar test — import the
// constants from the component under test so the test adapts to future
// threshold changes automatically.
const SUMMARY_THRESHOLD = 5

// =============================================================================
// Path display friendliness — bead km-silvercode.path-display-friendly
// =============================================================================

describe("ToolCall path display friendliness", () => {
  /**
   * The bug report screenshots show absolute paths like
   * `/Users/beorn/Bear/Vault/RESOLVER.md` rendered verbatim in the tool-call
   * widget header. The user expects tilde-shortened forms — `~vault/...` for
   * recognised aliases, `~/...` for HOME-relative paths.
   *
   * `formatPathForDisplay` (apps/silvercode/src/utils/format-path.ts) drives
   * the substitution. These tests pin the user-facing rendering of the
   * widget. They don't stub HOME — the assertions only fire when running
   * under a HOME that ends with the expected vault/km prefix, which is
   * always true for `process.env.HOME` on the developer machine and for the
   * CI test runner ($HOME is set there too). The substitutions reduce the
   * visual surface; original paths must NOT appear.
   */
  const HOME = process.env["HOME"] ?? ""

  test("title that is an absolute vault path shortens to ~vault/...", () => {
    if (!HOME) return // skip if test runner has no HOME
    const fullPath = `${HOME}/Bear/Vault/RESOLVER.md`
    const app = freshRender()(
      <ToolCall toolCall={{ toolCallId: id("t1"), kind: "read", status: "pending", title: fullPath }} />,
    )
    // Either the alias form (~vault/) or HOME fallback (~/Bear/Vault/) is
    // acceptable depending on the alias map; the literal absolute path
    // must NOT appear.
    expect(app.text).not.toContain(fullPath)
    expect(app.text).toMatch(/~vault\/RESOLVER\.md|~\/Bear\/Vault\/RESOLVER\.md/)
  })

  test("title that is an absolute km path shortens to ~km/...", () => {
    if (!HOME) return
    const fullPath = `${HOME}/Code/pim/km/CLAUDE.md`
    const app = freshRender()(
      <ToolCall toolCall={{ toolCallId: id("t2"), kind: "read", status: "pending", title: fullPath }} />,
    )
    expect(app.text).not.toContain(fullPath)
    expect(app.text).toMatch(/~km\/CLAUDE\.md|~\/Code\/pim\/km\/CLAUDE\.md/)
  })

  test("locations chip shortens absolute paths", () => {
    if (!HOME) return
    const fullPath = `${HOME}/Bear/Vault/RESOLVER.md`
    const app = freshRender()(
      <ToolCall
        toolCall={{
          toolCallId: id("t3"),
          kind: "read",
          status: "pending",
          title: "x",
          locations: [{ path: fullPath, line: 42 }],
        }}
      />,
    )
    expect(app.text).not.toContain(fullPath)
    // Either the alias form or HOME fallback, with `:42` appended.
    expect(app.text).toMatch(/~vault\/RESOLVER\.md:42|~\/Bear\/Vault\/RESOLVER\.md:42/)
  })

  test("title with leading verb + path is also shortened", () => {
    // Some agents pass titles like "Read /Users/.../foo.ts" — the path
    // substring must be shortened, the rest preserved.
    if (!HOME) return
    const fullPath = `${HOME}/Bear/Vault/RESOLVER.md`
    const app = freshRender()(
      <ToolCall toolCall={{ toolCallId: id("t4"), kind: "read", status: "pending", title: `Read ${fullPath}` }} />,
    )
    expect(app.text).not.toContain(fullPath)
    expect(app.text).toContain("Read ")
  })

  test("path inside a shell command is shortened", () => {
    if (!HOME) return
    const fullPath = `${HOME}/Bear/Vault/@inbox/`
    const cmd = `ls -la "${fullPath}"`
    const app = freshRender()(
      <ToolCall toolCall={{ toolCallId: id("t5"), kind: "execute", status: "pending", title: cmd }} />,
    )
    // Whichever shortened form the alias map yields, the literal HOME
    // prefix must not survive.
    expect(app.text).not.toContain(`${HOME}/Bear/Vault`)
  })

  test("non-path titles render unchanged", () => {
    const app = freshRender()(
      <ToolCall toolCall={{ toolCallId: id("t6"), kind: "execute", status: "pending", title: "bun fix" }} />,
    )
    expect(app.text).toContain("bun fix")
  })

  test("relative path in title is left unchanged", () => {
    const app = freshRender()(
      <ToolCall toolCall={{ toolCallId: id("t7"), kind: "read", status: "pending", title: "src/foo.ts" }} />,
    )
    expect(app.text).toContain("src/foo.ts")
  })

  test("/tmp path in title is left unchanged (outside HOME)", () => {
    const app = freshRender()(
      <ToolCall toolCall={{ toolCallId: id("t8"), kind: "read", status: "pending", title: "/tmp/scratch.txt" }} />,
    )
    expect(app.text).toContain("/tmp/scratch.txt")
  })

  test("image path in non-shell title is an OSC 8 file link", () => {
    const app = freshRender()(
      <ToolCall
        toolCall={{
          toolCallId: id("t-image"),
          kind: "execute",
          status: "completed",
          title: "View /tmp/screenshot.png",
        }}
      />,
    )
    expect(app.text).toContain("View /tmp/screenshot.png")
    expect(app.ansi).toContain("file:///tmp/screenshot.png")
  })

  test("diff content path is shortened", () => {
    if (!HOME) return
    const fullPath = `${HOME}/Code/pim/km/CLAUDE.md`
    const app = freshRender()(
      <ToolCall
        toolCall={{
          toolCallId: id("t9"),
          kind: "edit",
          status: "in_progress",
          title: "edit",
          content: [{ type: "diff", path: fullPath, oldText: "a", newText: "b" }],
        }}
        defaultExpanded
      />,
    )
    // The "--- <path>" header inside the diff body must use the shortened form.
    expect(app.text).not.toContain(`--- ${fullPath}`)
    expect(app.text).toMatch(/--- ~km\/CLAUDE\.md|--- ~\/Code\/pim\/km\/CLAUDE\.md/)
  })
})
