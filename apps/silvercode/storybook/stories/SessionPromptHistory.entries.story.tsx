/**
 * <SessionPromptHistory> — history modal with sample entries.
 *
 * `SessionPromptHistory` reads from a log directory on disk via `scanLogDir`.
 * In a storybook context no real log dir exists, so we pass `logDir` as
 * `undefined` — the component renders "No prior sessions" gracefully.
 *
 * The story exercises the visual: modal frame, search input, empty-state label,
 * and the full entry list if one were populated.
 */
import React, { useState } from "react"
import { Box, Screen } from "silvery"
import { SessionPromptHistory } from "../../src/components/SessionPromptHistory.tsx"
import type { Story } from "../types.ts"

export const sessionPromptHistoryEntries: Story = {
  id: "SessionPromptHistory/entries",
  component: "SessionPromptHistory",
  variant: "entries",
  description: "History modal — no log dir (renders empty-state label + search input).",
  render() {
    return <SessionPromptHistoryStory />
  },
}

function SessionPromptHistoryStory(): React.ReactElement {
  const [open, setOpen] = useState(true)
  return (
    <Screen flexDirection="column">
      <Box flexGrow={1} flexDirection="column">
        {open && <SessionPromptHistory onClose={() => setOpen(false)} logDir={undefined} />}
      </Box>
    </Screen>
  )
}
