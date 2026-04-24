import React, { useMemo } from "react"
import type { MessageEntry } from "@km/agent-harness"
import { Box, ListView, useBoxRect } from "silvery"
import { AssistantBlock } from "./AssistantBlock.tsx"
import { ToolCallBlock } from "./ToolCallBlock.tsx"
import { ToolResultBlock } from "./ToolResultBlock.tsx"
import { UserMessageBlock } from "./UserMessageBlock.tsx"

/**
 * Virtualized message stream.
 *
 * silvery's ListView owns scrolling: wheel / keyboard / scrollTo all go
 * through it, and only the visible window is rendered into the grid. That's
 * what keeps long sessions performant and prevents content from "walking off"
 * the card below the command box. We measure our own height via useBoxRect
 * (synchronous signal, updates on resize) and feed it to ListView's height
 * prop — no manual arithmetic, no hardcoded rows.
 *
 * estimateHeight is deliberately generous: messages have variable body size
 * (text + N tool calls each with its own expand/collapse) and exact measuring
 * would require a two-pass render. The current estimate favours overscan
 * correctness at the cost of a bit of render work during scroll — acceptable
 * for the M0..M12 session-length regime.
 */

function estimateMessageHeight(m: MessageEntry): number {
  let h = 1
  if (m.role === "user") {
    h += Math.max(1, Math.ceil(m.text.length / 80))
    return h
  }
  if (m.text.length > 0) {
    h += Math.max(1, Math.ceil(m.text.length / 80))
  }
  h += m.toolCalls.length
  h += m.toolResults.length
  return h
}

function MessageItem({ m }: { m: MessageEntry }): React.ReactElement {
  if (m.role === "user") {
    return <UserMessageBlock text={m.text} />
  }
  return (
    <Box flexDirection="column">
      {m.text.length > 0 && <AssistantBlock text={m.text} />}
      {m.toolCalls.map((c) => (
        <Box key={c.id} flexDirection="column">
          <ToolCallBlock id={c.id} name={c.name} input={c.input} mcpServer={c.mcp_server} />
          {m.toolResults
            .filter((r) => r.id === c.id)
            .map((r) => (
              <ToolResultBlock key={r.id} output={r.output} isError={r.is_error} />
            ))}
        </Box>
      ))}
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
  const estimate = useMemo(
    () => (index: number) => {
      const m = messages[index]
      return m ? estimateMessageHeight(m) : 1
    },
    [messages],
  )
  const scrollTo = Math.max(0, messages.length - 1)
  return (
    <ListView
      items={messages}
      height={Math.max(1, Math.floor(height))}
      getKey={(m) => m.id}
      estimateHeight={estimate}
      scrollTo={scrollTo}
      gap={1}
      overflowIndicator
      nav
      renderItem={(m) => <MessageItem m={m} />}
    />
  )
}
