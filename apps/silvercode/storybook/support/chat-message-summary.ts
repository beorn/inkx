import type { MessageOp, ToolCall as ToolCallType, ToolResultEntry, ToolUseId } from "@km/agent-harness"
import type { ActivityRun, ActivityRunStatus } from "../../src/chat-model.ts"
import type { ChatMessageSummaryItem } from "../../src/components/ChatMessageSummary.tsx"

type StoryActivityItem = Omit<ChatMessageSummaryItem, "activity">

function statusFromToolCall(toolCall: ToolCallType): ActivityRunStatus {
  if (toolCall.status === "in_progress" || toolCall.status === "pending") return "running"
  if (toolCall.status === "failed") return "failed"
  return "completed"
}

export function withActivityRun(item: StoryActivityItem, index: number): ChatMessageSummaryItem {
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
  const activity: ActivityRun = {
    id: item.id,
    kind: "tool",
    status,
    op,
    index,
  }
  return { ...item, activity }
}
