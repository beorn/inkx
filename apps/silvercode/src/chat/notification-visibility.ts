import type { ChannelNotification } from "../notification-stream.ts"
import type { ChatEvent } from "./types.ts"
import { representedSubagentNotificationIdsFromChatEvents } from "./subagent-activities.ts"

export function filterVisibleNotificationEntries(
  entries: readonly ChannelNotification[],
  showDebug: boolean,
  selfSessionId: string,
  events: readonly ChatEvent[] = [],
): readonly ChannelNotification[] {
  if (showDebug) return entries
  const representedIds = representedSubagentNotificationIdsFromChatEvents(events, entries, { sessionId: selfSessionId })
  return entries.filter((entry) => !isHiddenSubagentNotification(entry, selfSessionId, representedIds))
}

function isHiddenSubagentNotification(
  entry: ChannelNotification,
  selfSessionId: string,
  representedIds: ReadonlySet<string>,
): boolean {
  if (!isSubagentNotification(entry)) return false
  if (isNonTerminalSubagentNotification(entry)) return true
  if (!isSameSessionSubagentNotification(entry, selfSessionId)) return false
  return representedIds.has(entry.id)
}

function isSubagentNotification(entry: ChannelNotification): boolean {
  return entry.source === "subagent" || entry.source === "sub-agent"
}

function isSameSessionSubagentNotification(entry: ChannelNotification, selfSessionId: string): boolean {
  const fromSessionId = typeof entry.meta?.fromSessionId === "string" ? entry.meta.fromSessionId : undefined
  return fromSessionId !== undefined && fromSessionId === selfSessionId
}

function isNonTerminalSubagentNotification(entry: ChannelNotification): boolean {
  if (!isSubagentNotification(entry)) return false
  const status = typeof entry.meta?.status === "string" ? entry.meta.status : undefined
  if (status) return status === "started" || status === "progress"
  return /^\[subagent\s+[^\]]+\]\s+(started|progress):/i.test(entry.content)
}
