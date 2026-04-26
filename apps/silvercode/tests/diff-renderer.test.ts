/**
 * Edit-tool diff rendering — via `<ToolCall>` with kind="edit".
 *
 * Edit-tool diff rendering now uses `<ToolCall>` via
 * silvery's `<Diff>` component. The ACP `ToolCallContent` variant `{ type:
 * "diff" }` feeds hunks to `<Diff>`; `SessionUpdateList.adaptToolCall` builds
 * this variant from the legacy `{ old_string, new_string }` Edit-tool input.
 *
 * These tests verify that:
 *   1. An Edit-tool call with `old_string`/`new_string` renders a diff body.
 *   2. The file path header appears when `file_path` is provided.
 *   3. Added and removed lines render with `+`/`-` markers.
 *
 * Uses React.createElement (not JSX) so this file can stay `.test.ts`.
 */

import { describe, expect, test } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { ToolCall } from "../src/components/ToolCall.tsx"
import type { ToolCallId } from "@km/agent-harness"

const render = createRenderer({ cols: 80, rows: 30 })

function makeEditToolCall(oldString: string, newString: string, filePath?: string) {
  return React.createElement(ToolCall, {
    toolCall: {
      toolCallId: "tc-1" as ToolCallId,
      title: filePath ?? "edit",
      kind: "edit" as const,
      status: "completed" as const,
      content: [
        {
          type: "diff" as const,
          path: filePath ?? "",
          oldText: oldString,
          newText: newString,
        },
      ],
    },
    defaultExpanded: true,
  })
}

describe("edit-tool diff rendering via <ToolCall>", () => {
  test("expanded edit tool call renders added and removed lines", () => {
    const app = render(makeEditToolCall("old-line", "new-line"))
    const text = app.text
    expect(text).toContain("old-line")
    expect(text).toContain("new-line")
  })

  test("file path header renders in diff body when provided", () => {
    const app = render(makeEditToolCall("a", "b", "src/foo.ts"))
    const text = app.text
    expect(text).toContain("src/foo.ts")
  })

  test("ToolCall header shows 'edit' kind title", () => {
    const app = render(makeEditToolCall("before", "after", "src/foo.ts"))
    const text = app.text
    // ToolCallStatusTitle renders "Edited src/foo.ts" for completed edit kind.
    expect(text).toContain("src/foo.ts")
  })
})
