import React from "react"
import type { MessageEntry } from "@silvery/agent-harness"
import { Box } from "silvery"
import { AssistantBlock } from "./AssistantBlock.tsx"
import { ToolCallBlock } from "./ToolCallBlock.tsx"
import { ToolResultBlock } from "./ToolResultBlock.tsx"
import { UserMessageBlock } from "./UserMessageBlock.tsx"

export function MessageList({
  messages,
  onApprove,
  onDeny,
  sessionId,
}: {
  messages: MessageEntry[]
  onApprove: (requestId: string) => void
  onDeny: (requestId: string) => void
  sessionId: string
}): React.ReactElement {
  return (
    <Box flexDirection="column" gap={1}>
      {messages.map((m) => {
        if (m.role === "user") {
          return <UserMessageBlock key={m.id} text={m.text} />
        }
        return (
          <Box key={m.id} flexDirection="column">
            {m.text.length > 0 && <AssistantBlock text={m.text} />}
            {m.toolCalls.map((c) => (
              <Box key={c.id} flexDirection="column">
                <ToolCallBlock
                  id={c.id}
                  name={c.name}
                  input={c.input}
                  mcpServer={c.mcp_server}
                />
                {m.toolResults
                  .filter((r) => r.id === c.id)
                  .map((r) => (
                    <ToolResultBlock key={r.id} output={r.output} isError={r.is_error} />
                  ))}
              </Box>
            ))}
          </Box>
        )
      })}
    </Box>
  )
}
