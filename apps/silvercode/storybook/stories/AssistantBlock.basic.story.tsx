/**
 * AssistantBlock — basic markdown reply.
 */
import React from "react"
import { AssistantBlock } from "../../src/components/AssistantBlock.tsx"
import type { Story } from "../types.ts"

const SHORT = "Sure — I'll start with the failing test and work backwards from there."

const LONG = `I'll take a closer look. Three things to verify first:

1. The store mutation is happening on a fresh state object (not in place).
2. The subscriber list is being notified after the mutation, not before.
3. No subscriber is being added inside an effect body that itself reads the signal.

Want me to write a test that covers all three, or just (1)?`

export const assistantBlockBasic: Story = {
  id: "AssistantBlock/basic",
  component: "AssistantBlock",
  variant: "basic",
  description: "Plain assistant prose — no code, no tool calls.",
  knobs: [
    {
      kind: "select",
      id: "size",
      label: "Size",
      options: ["short", "long"],
      default: "short",
    },
  ],
  render(knobs) {
    const text = knobs.size === "short" ? SHORT : LONG
    return <AssistantBlock text={text} />
  },
}
