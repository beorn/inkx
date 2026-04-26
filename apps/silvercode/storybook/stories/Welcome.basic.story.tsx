/**
 * Welcome — first-launch greeting.
 *
 * Welcome takes a SessionHandle but reads almost nothing from it (the
 * exported component pattern is `(_: { handle }) => …`); we synthesize
 * a minimal handle stub for the story.
 */
import React from "react"
import { Welcome } from "../../src/components/Welcome.tsx"
import type { Story } from "../types.ts"
import { fakeSessionHandle } from "../support/fake-session-handle.ts"

export const welcomeBasic: Story = {
  id: "Welcome/basic",
  component: "Welcome",
  variant: "basic",
  description: "First-launch welcome surface.",
  render() {
    return <Welcome handle={fakeSessionHandle()} />
  },
}
