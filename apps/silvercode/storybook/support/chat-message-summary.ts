import type { ToolCall as ToolCallType } from "@km/agent-harness"
import type { ChatMessageSummaryActivity, ChatMessageSummaryItem } from "../../src/components/ChatMessageSummary.tsx"

type StoryActivityItem = Omit<ChatMessageSummaryItem, "activity">

function statusFromToolCall(toolCall: ToolCallType): ChatMessageSummaryActivity["status"] {
  if (toolCall.status === "in_progress" || toolCall.status === "pending") return "running"
  if (toolCall.status === "failed") return "failed"
  return "completed"
}

export function withActivityRun(item: StoryActivityItem): ChatMessageSummaryItem {
  return { ...item, activity: { id: item.id, status: statusFromToolCall(item.toolCall) } }
}
