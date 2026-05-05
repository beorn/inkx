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
import { SessionPromptComposer } from "../../src/components/SessionPromptComposer.tsx"

function WelcomeComposer({ value = "" }: { value?: string }): React.ReactElement {
  return (
    <SessionPromptComposer
      queueText=""
      onQueueChange={() => {}}
      onQueueSubmit={() => {}}
      inputValue={value}
      onInputChange={() => {}}
      inputDisabled={false}
      onSubmit={() => {}}
      onExit={() => {}}
      focusedRegion="command"
      onFocusRegion={() => {}}
    />
  )
}

export const welcomeBasic: Story = {
  id: "Welcome/basic",
  component: "Welcome",
  variant: "basic",
  description: "First-launch welcome surface with immediate command input.",
  render() {
    return <Welcome handle={fakeSessionHandle()} agent="codex" model="gpt-5.4" composerSlot={<WelcomeComposer />} />
  },
}

export const welcomeFreshWithDraft: Story = {
  id: "Welcome/fresh-with-draft",
  component: "Welcome",
  variant: "fresh-with-draft",
  description: "Fresh startup stays responsive while the backend spawns.",
  render() {
    return (
      <Welcome
        handle={fakeSessionHandle()}
        agent="claude-code"
        model="claude-opus-4-7"
        composerSlot={<WelcomeComposer value="draft prompt while spawning" />}
      />
    )
  },
}

export const welcomeLoadingResume: Story = {
  id: "Welcome/loading-resume",
  component: "Welcome",
  variant: "loading-resume",
  description: "Resume loading state: logo, Loading session, session id, then agent/model.",
  render() {
    const resumeId = "019ddb63-6e8d-7141-a603-f7c86c135be6"
    return (
      <Welcome
        handle={fakeSessionHandle({ resumeId })}
        agent="codex"
        model="gpt-5.4"
        status="spawning"
        composerSlot={<WelcomeComposer />}
      />
    )
  },
}
