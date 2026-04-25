/**
 * Regression: long assistant message paragraphs truncate at 1 line when
 * rendered through MessageList → ListView. AssistantBlock alone wraps fine;
 * the bug is in ListView's interaction with `useBoxRect` returning 0 on the
 * first render (same root-cause class as `km-silvercode.cursor-startup-position`).
 *
 * Bead: km-silvercode.message-wrap-truncation. Depends on
 * km-silvery.view-as-layout-output for the architectural fix.
 *
 * Two cases:
 *  - AssistantBlock alone: PASSES (proves the flex / Prose chain is correct).
 *  - MessageList with one long assistant message: FAILS today (regression
 *    marker). Will pass when view-as-layout-output lands.
 */
import React from "react"
import { describe, expect, test, beforeAll } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box } from "silvery"
import { MessageList } from "../../src/components/MessageList.tsx"
import { AssistantBlock } from "../../src/components/AssistantBlock.tsx"
import { isLayoutEngineInitialized, setLayoutEngine } from "@silvery/ag-react"
import { createFlexilyZeroEngine } from "@silvery/ag-term/adapters/flexily-zero-adapter"
import type { Message } from "@km/agent-harness"

beforeAll(() => {
  if (!isLayoutEngineInitialized()) setLayoutEngine(createFlexilyZeroEngine())
})

const longText =
  "A workspace for agentic knowledge workers: unified notes, tasks, and calendar in a TUI, with bidirectional markdown sync and a vendor/ submodule layout."

function fakeAssistantMessage(text: string): Message {
  return {
    id: "m1",
    role: "assistant",
    text,
    toolCalls: [],
    toolResults: [],
    ts: 0,
  } as unknown as Message
}

describe("assistant message wrap (regression — km-silvercode.message-wrap-truncation)", () => {
  test("AssistantBlock alone wraps long paragraph correctly", () => {
    const COLS = 60
    const ROWS = 30
    const render = createRenderer({ cols: COLS, rows: ROWS })
    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <AssistantBlock text={longText} />
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
  // MessageList drops `useBoxRect`. Long paragraphs now wrap on the first
  // render through the real component chain.
  test("MessageList with long paragraph wraps (km-silvercode.message-wrap-truncation regression)", () => {
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
          <MessageList
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
    // Today: only "● A workspace ... unified not" survives; "submodule" / "layout" are clipped.
    expect(totalRendered).toContain("submodule")
  })
})
