/**
 * <SessionPromptComposer> — empty composer, command region only.
 *
 * The composer shows only the command region when the queue is empty.
 * This variant exercises the minimal idle state: no queue, no input text,
 * focus on the command region (the default on session start).
 */
import React, { useState } from "react"
import { Box, Screen } from "silvery"
import { SessionPromptComposer } from "../../src/components/SessionPromptComposer.tsx"
import type { Story } from "../types.ts"

export const sessionPromptComposerEmpty: Story = {
  id: "SessionPromptComposer/empty",
  component: "SessionPromptComposer",
  variant: "empty",
  description: "Empty composer — command region only, no queue, no input text.",
  knobs: [
    {
      kind: "select",
      id: "promptColor",
      label: "Prompt color",
      options: ["$primary", "$info", "$warning", "$error"],
      default: "$primary",
    },
  ],
  render(knobs) {
    const promptColor = knobs.promptColor as string
    return <EmptyComposerStory promptColor={promptColor} />
  },
}

function EmptyComposerStory({ promptColor }: { promptColor: string }): React.ReactElement {
  const [inputValue, setInputValue] = useState("")
  return (
    <Screen flexDirection="column">
      <Box flexGrow={1} />
      <SessionPromptComposer
        queueText=""
        onQueueChange={() => {}}
        onQueueSubmit={() => {}}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSubmit={() => {}}
        onExit={() => {}}
        focusedRegion="command"
        onFocusRegion={() => {}}
        promptColor={promptColor}
      />
    </Screen>
  )
}
