import type { MessageOp, ToolCall as ToolCallType, ToolResultEntry, ToolUseId } from "@km/agent-harness"
import type { ChatActivitySpan, ChatActivityStatus } from "../../src/chat-model.ts"
import type { TurnActivitySummaryItem } from "../../src/components/TurnActivitySummary.tsx"

type StoryActivityItem = Omit<TurnActivitySummaryItem, "span">

function statusFromToolCall(toolCall: ToolCallType): ChatActivityStatus {
  if (toolCall.status === "in_progress" || toolCall.status === "pending") return "running"
  if (toolCall.status === "failed") return "failed"
  return "completed"
}

export function withActivitySpan(item: StoryActivityItem, index: number): TurnActivitySummaryItem {
  const status = statusFromToolCall(item.toolCall)
  const result: ToolResultEntry | undefined =
    status === "running"
      ? undefined
      : {
          id: item.toolCall.toolCallId as unknown as ToolUseId,
          output: item.toolCall.rawOutput ?? "",
          is_error: status === "failed" ? true : undefined,
        }
  const op: MessageOp = {
    kind: "tool",
    toolCall: {
      id: item.toolCall.toolCallId as unknown as ToolUseId,
      name: item.toolCall.kind ?? item.toolCall.title,
      input: item.toolCall.rawInput,
    },
    result,
  }
  const span: ChatActivitySpan = {
    id: item.id,
    kind: "tool",
    status,
    op,
    index,
  }
  return { ...item, span }
}
