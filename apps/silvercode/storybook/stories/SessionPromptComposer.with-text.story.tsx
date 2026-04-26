/**
 * <SessionPromptComposer> — command region with typed text.
 *
 * Shows the composer mid-composition: a multi-word prompt is already in the
 * command buffer. The `>` prompt adopts the mode color.
 */
import React, { useState } from "react"
import { Screen } from "silvery"
import { SessionPromptComposer } from "../../src/components/SessionPromptComposer.tsx"
import type { Story } from "../types.ts"

export const sessionPromptComposerWithText: Story = {
  id: "SessionPromptComposer/with-text",
  component: "SessionPromptComposer",
  variant: "with-text",
  description: "Composer with a multi-word prompt in the command buffer.",
  knobs: [
    {
      kind: "select",
      id: "disabled",
      label: "Input disabled",
      options: ["false", "true"],
      default: "false",
    },
  ],
  render(knobs) {
    const inputDisabled = knobs.disabled === "true"
    return <WithTextComposerStory inputDisabled={inputDisabled} />
  },
}

function WithTextComposerStory({ inputDisabled }: { inputDisabled: boolean }): React.ReactElement {
  const [inputValue, setInputValue] = useState("Fix the failing test in apps/silvercode/tests/")
  return (
    <Screen flexDirection="column" justifyContent="flex-end">
      <SessionPromptComposer
        queueText=""
        onQueueChange={() => {}}
        onQueueSubmit={() => {}}
        inputValue={inputValue}
        onInputChange={setInputValue}
        inputDisabled={inputDisabled}
        onSubmit={() => {}}
        onExit={() => {}}
        focusedRegion="command"
        onFocusRegion={() => {}}
      />
    </Screen>
  )
}
