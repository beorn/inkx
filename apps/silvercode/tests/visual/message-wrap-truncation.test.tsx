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
import type { MessageEntry } from "@km/agent-harness"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

const longText =
  "A workspace for agentic knowledge workers: unified notes, tasks, and calendar in a TUI, with bidirectional markdown sync and a vendor/ submodule layout."

function fakeAssistantMessage(text: string): MessageEntry {
  return {
    id: "m1",
    role: "assistant",
    text,
    toolCalls: [],
    toolResults: [],
    ts: 0,
  } as unknown as MessageEntry
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
})
