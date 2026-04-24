import React, { useState } from "react"
import type { MessageEntry } from "@km/agent-harness"
import { Box, ListView, useBoxRect } from "silvery"
import { AssistantBlock } from "./AssistantBlock.tsx"
import { ToolCallBlock } from "./ToolCallBlock.tsx"
import { ToolResultBlock } from "./ToolResultBlock.tsx"
import { UserMessageBlock } from "./UserMessageBlock.tsx"

/**
 * Virtualized message stream — same shape km-logview uses.
 *
 * ListView owns scroll (wheel / keyboard / cursor). We pass height via
 * useBoxRect and let ListView measure actual item heights after first
 * render. No manual estimate, no scrollTo pinning — scrollTo was blocking
 * user scroll by yanking the viewport back to the latest message every
 * render. Cursor follows the latest item on the arrival path (cursorKey
 * bound to state that auto-advances as new messages land) but the user
 * can scroll away with j/k/wheel and the cursor stays where they put it.
 */

function MessageItem({ m }: { m: MessageEntry }): React.ReactElement {
  if (m.role === "user") {
    return <UserMessageBlock text={m.text} />
  }
  return (
    <Box flexDirection="column">
      {m.text.length > 0 && <AssistantBlock text={m.text} />}
      {m.toolCalls.map((c) => {
        const results = m.toolResults.filter((r) => r.id === c.id)
        const running = results.length === 0
        return (
          <Box key={c.id} flexDirection="column">
            <ToolCallBlock
              id={c.id}
              name={c.name}
              input={c.input}
              mcpServer={c.mcp_server}
              running={running}
            />
            {results.map((r) => (
              <ToolResultBlock key={r.id} output={r.output} isError={r.is_error} />
            ))}
          </Box>
        )
      })}
    </Box>
  )
}

export function MessageList({
  messages,
}: {
  messages: MessageEntry[]
  onApprove: (requestId: string) => void
  onDeny: (requestId: string) => void
  sessionId: string
}): React.ReactElement {
  const { height } = useBoxRect()
  const [cursor, setCursor] = useState<number>(-1)
  return (
    <ListView
      items={messages}
      height={Math.max(1, Math.floor(height))}
      getKey={(_m, i) => i}
      gap={1}
      nav
      cursorKey={cursor}
      onCursor={setCursor}
      maxRendered={200}
      renderItem={(m) => <MessageItem m={m} />}
    />
  )
}
