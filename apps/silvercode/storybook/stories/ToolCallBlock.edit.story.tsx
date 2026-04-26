/**
 * ToolCallBlock — Edit tool (file modification).
 */
import React from "react"
import { ToolCallBlock } from "../../src/components/ToolCallBlock.tsx"
import type { Story } from "../types.ts"

export const toolCallBlockEdit: Story = {
  id: "ToolCallBlock/edit",
  component: "ToolCallBlock",
  variant: "edit",
  description: "Edit tool — file path summary + diff body when expanded.",
  render() {
    return (
      <ToolCallBlock
        id="story-edit-1"
        name="Edit"
        input={{
          file_path: "/Users/test/repo/src/storage/sqlite.ts",
          old_string: "const db = new Database(path)",
          new_string: "const db = new Database(path, { readonly: false })",
        }}
      />
    )
  },
}
