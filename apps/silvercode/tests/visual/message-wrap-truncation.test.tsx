/**
 * Regression: long assistant message paragraphs truncate at 1 line when
 * rendered through SessionUpdateList → ListView. The assistant row (inline
 * in SessionUpdateList) wraps fine in isolation; the bug was in ListView's
 * interaction with `useBoxRect` returning 0 on the first render (same
 * root-cause class as `km-silvercode.cursor-startup-position`).
 *
 * Bead: km-silvercode.message-wrap-truncation. Depends on
 * km-silvery.view-as-layout-output for the architectural fix.
 *
 * Two cases:
 *  - Inline assistant row: PASSES (proves the flex / Prose chain is correct).
 *  - SessionUpdateList with one long assistant message: fixed by Phase 3 of
 *    km-silvery.view-as-layout-output — ListView height-independence.
 */
import React from "react"
import { describe, expect, test, beforeAll } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Prose } from "silvery"
import { SessionUpdateList } from "../../src/components/SessionUpdateList.tsx"
import { MarkdownView } from "../../src/components/MarkdownView.tsx"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import { messageTextFromOps, type MessageEntry, type MessageOp } from "@km/agent-harness"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

const longText =
  "A workspace for agentic knowledge workers: unified notes, tasks, and calendar in a TUI, with bidirectional markdown sync and a vendor/ submodule layout."

function fakeAssistantMessage(text: string): MessageEntry {
  return fakeAssistantMessageOps([{ kind: "text", text }])
}

function fakeAssistantMessageOps(ops: MessageOp[]): MessageEntry {
  const text = messageTextFromOps(ops)
  // MessageEntry's `text` / `toolCalls` / `toolResults` are getter-only
  // projections over `ops`. Build the entry around `ops` directly so
  // SessionUpdateList renders the assistant text as expected.
  const entry: Record<string, unknown> = {
    id: "m1",
    role: "assistant",
    ops,
    ts: 0,
  }
  Object.defineProperty(entry, "text", {
    get(): string {
      return text
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(entry, "toolCalls", { value: [], enumerable: true, configurable: true })
  Object.defineProperty(entry, "toolResults", { value: [], enumerable: true, configurable: true })
  return entry as unknown as MessageEntry
}

describe("assistant message wrap (regression — km-silvercode.message-wrap-truncation)", () => {
  test("assistant row inline wraps long paragraph correctly", () => {
    const COLS = 60
    const ROWS = 30
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexDirection="row" gap={1} paddingX={1} flexShrink={1} minWidth={0}>
          <Prose flexGrow={1}>
            <MarkdownView source={longText} />
          </Prose>
        </Box>
      </Box>,
    )
    const totalRendered = app.text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .join(" ")
    expect(totalRendered).toContain("submodule")
    expect(totalRendered).toContain("layout")
  })

  // Regression for km-silvercode.message-wrap-truncation. Closed by Phase 3
  // of km-silvery.view-as-layout-output — ListView height-independence +
  // SessionUpdateList drops `useBoxRect`. Long paragraphs now wrap on the
  // first render through the real component chain.
  test("SessionUpdateList with long paragraph wraps (km-silvercode.message-wrap-truncation regression)", () => {
    const COLS = 60
    const ROWS = 30
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box
        width={COLS}
        height={ROWS}
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        overflow="hidden"
        paddingX={1}
      >
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1}>
          <SessionUpdateList
            messages={[fakeAssistantMessage(longText)]}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="s1"
            status="idle"
            turnStartedAt={0}
            inputTokens={0}
            outputTokens={0}
            pendingPermissions={0}
            inFlightTool={null}
          />
        </Box>
      </Box>,
    )
    const totalRendered = app.text
      .split("\n")
      .filter((l) => l.trim().length > 0)
      .join(" ")
    // Long paragraphs wrap on the first render via ListView height-independence.
    expect(totalRendered).toContain("submodule")
  })

  test("adjacent assistant text ops keep paragraph and list boundaries without splitting words", () => {
    const COLS = 96
    const ROWS = 32
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box
        width={COLS}
        height={ROWS}
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        overflow="hidden"
        paddingX={1}
      >
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1}>
          <SessionUpdateList
            messages={[
              fakeAssistantMessageOps([
                { kind: "text", text: "Fixed the remount path", boundary: "semantic" },
                {
                  kind: "text",
                  text: "The flicker was because PaneGrid rendered Content.Layout -> Welcome.",
                  boundary: "semantic",
                },
                { kind: "text", text: "Verified:", boundary: "semantic" },
                {
                  kind: "text",
                  text: "- LOG_LEVEL=silent DEBUG= bun vitest run welcome-no-remount.test.tsx",
                  boundary: "semantic",
                },
                { kind: "text", text: "- bun run typecheck still fails on unrelated errors.", boundary: "semantic" },
                { kind: "text", text: "wel" },
                { kind: "text", text: "come" },
              ]),
            ]}
            onApprove={() => {}}
            onDeny={() => {}}
            sessionId="s1"
            status="idle"
            turnStartedAt={0}
            inputTokens={0}
            outputTokens={0}
            pendingPermissions={0}
            inFlightTool={null}
          />
        </Box>
      </Box>,
    )
    const rendered = app.lines
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n")

    expect(rendered).not.toContain("pathThe")
    expect(rendered).not.toContain("Verified:·")
    expect(rendered).toContain("Fixed the remount path")
    expect(rendered).toContain("The flicker was because PaneGrid rendered")
    expect(rendered).toContain("Verified:")
    expect(rendered).toContain("· LOG_LEVEL=silent DEBUG= bun vitest run welcome-no-remount.test.tsx")
    expect(rendered).toContain("welcome")
    expect(rendered).not.toContain("wel come")
  })
})
