/**
 * UserMessageBlock — short prompt.
 *
 * Renders a typical short user prompt. No fixture needed — the component
 * is pure props in.
 */
import React from "react"
import { UserMessageBlock } from "../../src/components/UserMessageBlock.tsx"
import type { Story } from "../types.ts"

export const userMessageBlockShort: Story = {
  id: "UserMessageBlock/short",
  component: "UserMessageBlock",
  variant: "short",
  description: "A typical short user prompt — single line.",
  knobs: [
    {
      kind: "select",
      id: "length",
      label: "Length",
      options: ["short", "medium", "long"],
      default: "short",
    },
  ],
  render(knobs) {
    const length = knobs.length as "short" | "medium" | "long"
    const text =
      length === "short"
        ? "fix the failing test"
        : length === "medium"
          ? "Please refactor the storage layer to remove the legacy parser. Make sure tests still pass."
          : "I'd like you to do the following in order: read the design doc, list every place we still use the v3 schema, propose a phased migration plan with at most 5 phases, then implement phase 1 in a fresh worktree. Stop and ask me before phase 2."
    return <UserMessageBlock text={text} />
  },
}
