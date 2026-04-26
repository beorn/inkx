/**
 * <SessionPromptComposer> — queue region active (QUEUE HELD state).
 *
 * The queue holds two pending follow-up entries. The divider reads
 * "QUEUE HELD" in $warning when the queue region has focus. Exercises
 * the two-region layout and the wire-format/display-format round-trip.
 */
import React, { useState } from "react"
import { Screen } from "silvery"
import { SessionPromptComposer } from "../../src/components/SessionPromptComposer.tsx"
import type { Story } from "../types.ts"

// Two queued entries joined by \n\n (wire format).
const SAMPLE_QUEUE = "Then run the tests\n\nIf they pass, commit with a conventional message"

export const sessionPromptComposerWithQueue: Story = {
  id: "SessionPromptComposer/with-queue",
  component: "SessionPromptComposer",
  variant: "with-queue",
  description: "Composer with two queued entries and focus on the queue region.",
  knobs: [
    {
      kind: "select",
      id: "focusedRegion",
      label: "Focused region",
      options: ["command", "queue"],
      default: "queue",
    },
  ],
  render(knobs) {
    const focusedRegion = knobs.focusedRegion as "command" | "queue"
    return <WithQueueComposerStory focusedRegion={focusedRegion} />
  },
}

function WithQueueComposerStory({ focusedRegion }: { focusedRegion: "command" | "queue" }): React.ReactElement {
  const [queueText, setQueueText] = useState(SAMPLE_QUEUE)
  const [inputValue, setInputValue] = useState("Fix the failing test")
  const [region, setRegion] = useState<"command" | "queue">(focusedRegion)

  return (
    <Screen flexDirection="column" justifyContent="flex-end">
      <SessionPromptComposer
        queueText={queueText}
        onQueueChange={setQueueText}
        onQueueSubmit={() => setQueueText("")}
        inputValue={inputValue}
        onInputChange={setInputValue}
        onSubmit={() => {}}
        onExit={() => {}}
        focusedRegion={region}
        onFocusRegion={setRegion}
      />
    </Screen>
  )
}
