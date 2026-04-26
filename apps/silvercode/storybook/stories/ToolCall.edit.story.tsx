/**
 * <ToolCall> — edit kind with structured Diff content.
 *
 * Demonstrates the canonical ACP edit-kind body: a `ToolCallContent` with
 * `type: "diff"` rendered via silvery's `<Diff>` primitive. Shows the
 * default-expanded behavior so the diff is visible without a click.
 */
import React from "react"
import type { ToolCallId } from "@km/agent-harness"
import { ToolCall } from "../../src/components/ToolCall.tsx"
import type { Story } from "../types.ts"

const id = (s: string) => s as ToolCallId

export const toolCallEdit: Story = {
  id: "ToolCall/edit",
  component: "ToolCall",
  variant: "edit",
  description: "ACP edit-kind call with structured Diff content rendered via silvery <Diff>.",
  render() {
    return (
      <ToolCall
        toolCall={{
          toolCallId: id("story-edit-1"),
          title: "src/storage/sqlite.ts",
          kind: "edit",
          status: "completed",
          locations: [{ path: "src/storage/sqlite.ts" }],
          content: [
            {
              type: "diff",
              path: "src/storage/sqlite.ts",
              oldText: "const db = new Database(path)",
              newText: "const db = new Database(path, { readonly: false })",
            },
          ],
        }}
        defaultExpanded
      />
    )
  },
}
