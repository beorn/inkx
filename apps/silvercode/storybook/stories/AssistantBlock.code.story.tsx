/**
 * AssistantBlock — markdown with embedded code fences.
 *
 * Exercises the markdown + syntax-highlight path inside AssistantBlock /
 * MarkdownView. Useful for design iteration on code-block styling and
 * line-wrap behavior.
 */
import React from "react"
import { AssistantBlock } from "../../src/components/AssistantBlock.tsx"
import type { Story } from "../types.ts"

const TEXT = `Here's the change:

\`\`\`ts
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}
\`\`\`

And the test that proves it works at the boundaries:

\`\`\`ts
expect(clamp(5, 0, 10)).toBe(5)
expect(clamp(-1, 0, 10)).toBe(0)
expect(clamp(99, 0, 10)).toBe(10)
\`\`\``

export const assistantBlockCode: Story = {
  id: "AssistantBlock/code",
  component: "AssistantBlock",
  variant: "code",
  description: "Assistant message with embedded TypeScript code fences.",
  render() {
    return <AssistantBlock text={TEXT} />
  },
}
