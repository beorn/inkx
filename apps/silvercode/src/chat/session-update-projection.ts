import { messageTextFromOps, type MessageEntry, type MessageOp } from "@km/agent-harness/session-store"
import { normalizeCommandSessionOps, splitAssistantMessageForTranscript } from "../chat-model.ts"
import type { ChannelNotification } from "../notification-stream.ts"
import type { SessionHistoryMetadata } from "../session-metadata.ts"

export type SessionMetadataRowKind = "start" | "loaded" | "ended"

export type SessionMetadataRowData = {
  kind: SessionMetadataRowKind
  title: string
  timestamp?: string
  parts: string[]
  fields: Array<[string, string]>
}

export type LiveActivityTail = { __activity: true }
export type ChatNotificationGroup = { __notification: true; entries: ChannelNotification[] }
export type AssistantActivitySegment = {
  __assistantActivity: true
  id: string
  message: MessageEntry
  ops: MessageOp[]
}
export type ChatLifecycleItem = { __sessionMetadata: true; id: string; data: SessionMetadataRowData }
export type TranscriptPaddingItem = { __padding: true; id: string; height: number }
export type TranscriptItem =
  | MessageEntry
  | LiveActivityTail
  | ChatNotificationGroup
  | AssistantActivitySegment
  | ChatLifecycleItem
  | TranscriptPaddingItem
export type SimilarGroupKind = "user" | "system" | "notification" | "assistant-tool-activity"
export type GroupedTranscriptItem = { __group: true; kind: SimilarGroupKind; items: TranscriptItem[] }
export type TranscriptRenderItem = TranscriptItem | GroupedTranscriptItem

type SessionMetadataItems = {
  start?: ChatLifecycleItem
  loaded?: ChatLifecycleItem
  ended?: ChatLifecycleItem
}

export type ProjectSessionUpdateTranscriptArgs = {
  messages: readonly MessageEntry[]
  notificationEntries?: readonly ChannelNotification[]
  sessionMetadata?: SessionHistoryMetadata
  showActivity: boolean
  paddingY?: number
  paddingTop?: number
  paddingBottom?: number
  isBackgroundSystemMessage?: (message: MessageEntry) => boolean
}

export type ProjectedSessionUpdateTranscript = {
  metadata: SessionMetadataItems
  merged: TranscriptItem[]
  visibleItems: TranscriptItem[]
  contentItems: TranscriptItem[]
  items: TranscriptItem[]
  renderItems: TranscriptRenderItem[]
  topPadding: number
  bottomPadding: number
  listEpoch: string
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const hh = d.getHours().toString().padStart(2, "0")
  const mm = d.getMinutes().toString().padStart(2, "0")
  return `${hh}:${mm}`
}

export function formatDateTime(ts: number | undefined): string | undefined {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return undefined
  const d = new Date(ts)
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
  return `${date} ${formatTime(ts)}`
}

export function shortPath(path: string | undefined): string | undefined {
  if (!path) return undefined
  const home = process.env.HOME
  return home && path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

function metadataPairs(fields: Record<string, string | number | undefined>): Array<[string, string]> {
  return Object.entries(fields).flatMap(([key, value]) =>
    value === undefined || value === "" ? [] : ([[key, String(value)]] as Array<[string, string]>),
  )
}

function durationLabel(start: number | undefined, end: number | undefined): string | undefined {
  if (typeof start !== "number" || typeof end !== "number" || end < start) return undefined
  const seconds = Math.round((end - start) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rem = seconds % 60
  if (minutes < 60) return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  const remMinutes = minutes % 60
  return remMinutes > 0 ? `${hours}h ${remMinutes}m` : `${hours}h`
}

export function displaySessionId(id: string): string {
  const value = id.includes(":") ? (id.split(":").pop() ?? id) : id
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value
}

export function sessionMetadataItems(metadata: SessionHistoryMetadata | undefined): SessionMetadataItems {
  if (!metadata) return {}
  const agent = metadata.agent ?? "agent"
  const model = metadata.model
  const cwd = shortPath(metadata.cwd)
  const startFields = metadataPairs({
    agent,
    sessionId: metadata.sessionId,
    cwd,
    model,
    account: metadata.account,
    resumeId: metadata.resumeId,
    spawnedAt: formatDateTime(metadata.spawnedAt),
    sessionInitAt: formatDateTime(metadata.sessionInitAt),
  })
  const start: ChatLifecycleItem = {
    __sessionMetadata: true,
    id: "session-metadata:start",
    data: {
      kind: "start",
      title: "Session started",
      timestamp: formatTime(metadata.spawnedAt),
      parts: [agent, model, cwd].filter((p): p is string => !!p),
      fields: startFields,
    },
  }

  const loaded =
    metadata.resumeId && metadata.replayCompletedAt
      ? {
          __sessionMetadata: true as const,
          id: "session-metadata:loaded",
          data: {
            kind: "loaded" as const,
            title: `Session resumed ${displaySessionId(metadata.resumeId)}`,
            timestamp: formatTime(metadata.replayCompletedAt),
            parts: [
              metadata.replayMessageCount !== undefined ? `${metadata.replayMessageCount} entries` : undefined,
            ].filter((p): p is string => !!p),
            fields: metadataPairs({
              resumeId: metadata.resumeId,
              transcriptPath: metadata.transcriptPath,
              replayStartedAt: formatDateTime(metadata.replayStartedAt),
              replayCompletedAt: formatDateTime(metadata.replayCompletedAt),
              replayMessageCount: metadata.replayMessageCount,
              replayBoundaryMessageId: metadata.replayBoundaryMessageId,
              liveStartedAt: formatDateTime(metadata.liveStartedAt),
            }),
          },
        }
      : undefined

  const ended =
    metadata.endedAt !== undefined
      ? {
          __sessionMetadata: true as const,
          id: "session-metadata:ended",
          data: {
            kind: "ended" as const,
            title: "Session ended",
            timestamp: formatTime(metadata.endedAt),
            parts: [durationLabel(metadata.spawnedAt, metadata.endedAt)].filter((p): p is string => !!p),
            fields: metadataPairs({
              endedAt: formatDateTime(metadata.endedAt),
              duration: durationLabel(metadata.spawnedAt, metadata.endedAt),
            }),
          },
        }
      : undefined
  return { start, loaded, ended }
}

export function isLiveActivityTail(item: TranscriptItem): item is LiveActivityTail {
  return (item as LiveActivityTail).__activity === true
}

export function isChatNotificationGroup(item: TranscriptItem): item is ChatNotificationGroup {
  return (item as ChatNotificationGroup).__notification === true
}

export function isChatLifecycleItem(item: TranscriptItem): item is ChatLifecycleItem {
  return (item as ChatLifecycleItem).__sessionMetadata === true
}

export function isTranscriptPadding(item: TranscriptItem): item is TranscriptPaddingItem {
  return (item as TranscriptPaddingItem).__padding === true
}

export function isAssistantActivitySegment(item: TranscriptItem): item is AssistantActivitySegment {
  return (item as AssistantActivitySegment).__assistantActivity === true
}

export function isTranscriptMessageEntry(item: TranscriptItem): item is MessageEntry {
  return (
    !isLiveActivityTail(item) &&
    !isChatNotificationGroup(item) &&
    !isChatLifecycleItem(item) &&
    !isTranscriptPadding(item) &&
    !isAssistantActivitySegment(item)
  )
}

function splitAssistantToolActivity(item: TranscriptItem): TranscriptItem[] {
  if (
    isLiveActivityTail(item) ||
    isChatNotificationGroup(item) ||
    isChatLifecycleItem(item) ||
    isTranscriptPadding(item) ||
    isAssistantActivitySegment(item) ||
    item.role !== "assistant"
  ) {
    return [item]
  }
  return splitAssistantMessageForTranscript(item).map(
    (slice): TranscriptItem =>
      slice.kind === "activity"
        ? { __assistantActivity: true, id: slice.id, message: slice.message, ops: slice.ops }
        : slice.message,
  )
}

function isAssistantToolActivity(item: TranscriptItem): boolean {
  if (isAssistantActivitySegment(item)) return true
  if (
    isLiveActivityTail(item) ||
    isChatNotificationGroup(item) ||
    isChatLifecycleItem(item) ||
    isTranscriptPadding(item) ||
    item.role !== "assistant"
  ) {
    return false
  }
  let hasTool = false
  for (const op of item.ops) {
    if (op.kind === "tool") {
      hasTool = true
      continue
    }
    if (op.kind === "thinking") continue
    if (op.kind === "text" && op.text.trim().length === 0) continue
    return false
  }
  return hasTool
}

export function isGrouped(item: TranscriptRenderItem): item is GroupedTranscriptItem {
  return (item as GroupedTranscriptItem).__group === true
}

function similarGroupKind(
  item: TranscriptItem,
  isBackgroundSystemMessage: (message: MessageEntry) => boolean,
): SimilarGroupKind | null {
  if (isChatNotificationGroup(item)) return "notification"
  if (isLiveActivityTail(item)) return null
  if (isChatLifecycleItem(item)) return null
  if (isTranscriptPadding(item)) return null
  if (isAssistantActivitySegment(item)) return "assistant-tool-activity"
  if (isAssistantToolActivity(item)) return "assistant-tool-activity"
  if (isBackgroundSystemMessage(item)) return "system"
  if (item.role === "user") return "user"
  return null
}

function groupSimilarItems(
  items: TranscriptItem[],
  isBackgroundSystemMessage: (message: MessageEntry) => boolean,
): TranscriptRenderItem[] {
  const grouped: TranscriptRenderItem[] = []
  for (const item of items) {
    const kind = similarGroupKind(item, isBackgroundSystemMessage)
    const last = grouped[grouped.length - 1]
    if (kind && last && isGrouped(last) && last.kind === kind) {
      last.items.push(item)
      continue
    }
    grouped.push(kind ? { __group: true, kind, items: [item] } : item)
  }
  return grouped
}

export function itemKey(item: TranscriptItem, i: number): string {
  if (isLiveActivityTail(item)) return "__activity"
  if (isChatNotificationGroup(item)) return `notification-cluster:${item.entries[0]?.id ?? i}`
  if (isChatLifecycleItem(item)) return item.id
  if (isTranscriptPadding(item)) return `__padding:${item.id}`
  if (isAssistantActivitySegment(item)) return item.id
  return String(item.id ?? i)
}

export function renderItemKey(item: TranscriptRenderItem, i: number): string {
  if (!isGrouped(item)) return itemKey(item, i)
  const first = item.items[0]
  return `group:${item.kind}:${first ? itemKey(first, i) : i}`
}

function insertRenderGaps(items: TranscriptRenderItem[]): TranscriptRenderItem[] {
  const out: TranscriptRenderItem[] = []
  for (const item of items) {
    const prev = out[out.length - 1]
    if (!prev && needsBreathingBefore(item) && !ownsVerticalSpacing(item)) {
      out.push({ __padding: true, id: `gap:start:${renderItemKey(item, out.length)}`, height: 1 })
    } else if (
      prev &&
      !(isTranscriptPaddingRenderItem(prev) || isTranscriptPaddingRenderItem(item)) &&
      !areDenseAdjacentItems(prev, item) &&
      !(ownsVerticalSpacing(prev) || ownsVerticalSpacing(item))
    ) {
      out.push({
        __padding: true,
        id: `gap:${renderItemKey(prev, out.length)}:${renderItemKey(item, out.length)}`,
        height: 1,
      })
    }
    out.push(item)
  }
  const last = out[out.length - 1]
  if (last && !isTranscriptPaddingRenderItem(last) && needsBreathingAfter(last) && !ownsVerticalSpacing(last)) {
    out.push({ __padding: true, id: `gap:${renderItemKey(last, out.length)}:end`, height: 1 })
  }
  return out
}

export function isTranscriptPaddingRenderItem(item: TranscriptRenderItem): item is TranscriptPaddingItem {
  return !isGrouped(item) && isTranscriptPadding(item)
}

function areDenseAdjacentItems(prev: TranscriptRenderItem, item: TranscriptRenderItem): boolean {
  if (isGrouped(prev) || isGrouped(item)) return false
  if (isTranscriptPadding(prev) || isTranscriptPadding(item)) return false
  if (isLiveActivityTail(prev) || isLiveActivityTail(item)) return false
  if (isChatNotificationGroup(prev) || isChatNotificationGroup(item)) return false
  if (isChatLifecycleItem(prev) || isChatLifecycleItem(item)) return false
  if (isAssistantActivitySegment(prev) || isAssistantActivitySegment(item)) return false
  return prev.role === "system" && item.role === "system"
}

function renderItemHasInternalBlankLine(item: TranscriptRenderItem): boolean {
  if (isGrouped(item)) return item.items.some(itemHasInternalBlankLine)
  return itemHasInternalBlankLine(item)
}

function needsBreathingBefore(item: TranscriptRenderItem): boolean {
  return renderItemHasInternalBlankLine(item)
}

function needsBreathingAfter(item: TranscriptRenderItem): boolean {
  return needsBreathingBefore(item)
}

function ownsVerticalSpacing(item: TranscriptRenderItem): boolean {
  return !isGrouped(item) && isChatLifecycleItem(item) && item.data.kind === "loaded"
}

export function itemTimestamp(item: TranscriptItem): number | null {
  if (
    isLiveActivityTail(item) ||
    isChatNotificationGroup(item) ||
    isChatLifecycleItem(item) ||
    isTranscriptPadding(item)
  ) {
    return null
  }
  if (isAssistantActivitySegment(item)) return item.message.ts
  return item.ts
}

export function sourceMessageId(item: TranscriptItem): string | null {
  if (!isTranscriptMessageEntry(item) && !isAssistantActivitySegment(item)) return null
  const message = isAssistantActivitySegment(item) ? item.message : item
  return ((message as unknown as { __sourceMessageId?: string }).__sourceMessageId ?? String(message.id)) as string
}

function itemBlockText(item: TranscriptItem): string {
  if (
    isLiveActivityTail(item) ||
    isChatNotificationGroup(item) ||
    isChatLifecycleItem(item) ||
    isTranscriptPadding(item)
  ) {
    return ""
  }
  const ops = isAssistantActivitySegment(item) ? item.ops : item.ops
  const thinking = ops.flatMap((op) => (op.kind === "thinking" ? [op.text] : [])).join("")
  return messageTextFromOps(ops) + thinking
}

function itemHasInternalBlankLine(item: TranscriptItem): boolean {
  return /\n[ \t]*\n/.test(itemBlockText(item))
}

function opTimestamp(op: MessageOp, fallback: number): number {
  return op.ts ?? fallback
}

function notificationTimestamp(entry: ChannelNotification): number {
  return entry.ts ?? entry.timestamp ?? 0
}

function cloneMessageForTimeline(message: MessageEntry, ops: MessageOp[], suffix: string): MessageEntry {
  const sourceId = sourceMessageId(message) ?? String(message.id)
  const ts = ops.reduce((min, op) => Math.min(min, opTimestamp(op, message.ts)), Number.POSITIVE_INFINITY)
  const out = {
    ...message,
    id: `${sourceId}:${suffix}` as MessageEntry["id"],
    ops,
    ts: Number.isFinite(ts) ? ts : message.ts,
  } as MessageEntry
  Object.defineProperty(out, "__sourceMessageId", {
    value: sourceId,
    enumerable: false,
    configurable: true,
  })
  Object.defineProperty(out, "text", {
    get() {
      return messageTextFromOps(ops)
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolCalls", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" ? [op.toolCall] : []))
    },
    enumerable: true,
    configurable: true,
  })
  Object.defineProperty(out, "toolResults", {
    get() {
      return ops.flatMap((op) => (op.kind === "tool" && op.result ? [op.result] : []))
    },
    enumerable: true,
    configurable: true,
  })
  return out
}

function interleave(messages: readonly MessageEntry[], notification: readonly ChannelNotification[]): TranscriptItem[] {
  function pushNotification(out: TranscriptItem[], entry: ChannelNotification): void {
    const last = out[out.length - 1]
    if (last && isChatNotificationGroup(last)) {
      last.entries.push(entry)
      return
    }
    out.push({ __notification: true, entries: [entry] })
  }
  function flushAssistantOps(out: TranscriptItem[], message: MessageEntry, ops: MessageOp[], index: number): void {
    if (ops.length === 0) return
    const part = cloneMessageForTimeline(message, ops, `notification-${index}`)
    out.push(...splitAssistantToolActivity(part))
  }
  const out: TranscriptItem[] = []
  let j = 0
  for (const message of messages) {
    if (message.role === "assistant" && message.ops.length > 0) {
      const ops = normalizeCommandSessionOps(message.ops)
      let buffer: MessageOp[] = []
      let segment = 0
      for (const op of ops) {
        const ots = opTimestamp(op, message.ts)
        while (j < notification.length) {
          const entry = notification[j]
          if (!entry || notificationTimestamp(entry) >= ots) break
          flushAssistantOps(out, message, buffer, segment++)
          buffer = []
          pushNotification(out, entry)
          j++
        }
        buffer.push(op)
      }
      flushAssistantOps(out, message, buffer, segment)
      continue
    }
    const mts = message.ts
    while (j < notification.length) {
      const entry = notification[j]
      if (!entry || notificationTimestamp(entry) < mts) {
        if (entry) pushNotification(out, entry)
        j++
        continue
      }
      break
    }
    out.push(message)
  }
  while (j < notification.length) {
    const notificationEntry = notification[j++]
    if (notificationEntry) pushNotification(out, notificationEntry)
  }
  return out
}

function messageItems(messages: readonly MessageEntry[]): TranscriptItem[] {
  const out: TranscriptItem[] = []
  for (const message of messages) {
    if (message.role === "assistant") {
      out.push(...splitAssistantToolActivity(message))
    } else {
      out.push(message)
    }
  }
  return out
}

function dedupeAdjacentReplayBookkeeping(items: TranscriptItem[]): TranscriptItem[] {
  const out: TranscriptItem[] = []
  let previousLabel: string | null = null
  for (const item of items) {
    const label = replayBookkeepingLabel(item)
    if (label && label === previousLabel) continue
    out.push(item)
    previousLabel = label
  }
  return out
}

function replayBookkeepingLabel(item: TranscriptItem): string | null {
  if (!isTranscriptMessageEntry(item) || item.role !== "system") return null
  const text = item.text.trim()
  return isReplayBookkeepingText(text) ? text : null
}

function isReplayBookkeepingText(text: string): boolean {
  return (
    text === "Last prompt snapshot" ||
    text === "Queue enqueue" ||
    text === "Queue dequeue" ||
    text.startsWith("Permission mode: ") ||
    text.startsWith("Title: ") ||
    text.startsWith("AI title: ") ||
    text.startsWith("Agent: ")
  )
}

export function projectSessionUpdateTranscript({
  messages,
  notificationEntries,
  sessionMetadata,
  showActivity,
  paddingY = 0,
  paddingTop,
  paddingBottom,
  isBackgroundSystemMessage = () => false,
}: ProjectSessionUpdateTranscriptArgs): ProjectedSessionUpdateTranscript {
  const merged =
    notificationEntries && notificationEntries.length > 0
      ? interleave(messages, notificationEntries)
      : messageItems(messages)
  const timelineItems = dedupeAdjacentReplayBookkeeping(merged)
  const metadata = sessionMetadataItems(sessionMetadata)
  const replayMessageCount = Math.max(0, sessionMetadata?.replayMessageCount ?? 0)
  const replayBoundaryMessageId = sessionMetadata?.replayBoundaryMessageId
  const replayCompletedAt = sessionMetadata?.replayCompletedAt
  const replayLiveMessageThreshold = sessionMetadata?.spawnedAt
  const replayLiveSessionInitAt = sessionMetadata?.sessionInitAt
  const replayLiveStartedAt = sessionMetadata?.liveStartedAt
  const visibleItems: TranscriptItem[] = []
  if (metadata.start) visibleItems.push(metadata.start)
  let seenReplayMessages = 0
  const seenReplayMessageIds = new Set<string>()
  let insertedLoadedMetadata = false
  let sawReplayItemBeforeLiveThreshold = false
  for (let index = 0; index < timelineItems.length; index++) {
    const item = timelineItems[index]
    if (item === undefined) continue
    const timestamp = itemTimestamp(item)
    if (metadata.loaded && !insertedLoadedMetadata && replayCompletedAt !== undefined) {
      const crossesLiveThreshold =
        timestamp !== null &&
        replayLiveMessageThreshold !== undefined &&
        timestamp >= replayLiveMessageThreshold &&
        sawReplayItemBeforeLiveThreshold
      const crossesSessionInit =
        timestamp !== null && replayLiveSessionInitAt !== undefined && timestamp >= replayLiveSessionInitAt
      const crossesLiveStarted =
        timestamp !== null && replayLiveStartedAt !== undefined && timestamp >= replayLiveStartedAt
      const looksLive =
        timestamp !== null &&
        (replayBoundaryMessageId !== undefined
          ? crossesLiveStarted || crossesSessionInit || crossesLiveThreshold
          : timestamp > replayCompletedAt || crossesLiveStarted || crossesSessionInit || crossesLiveThreshold)
      if (looksLive) {
        visibleItems.push(metadata.loaded)
        insertedLoadedMetadata = true
      }
    }
    visibleItems.push(item)
    const sourceId = sourceMessageId(item)
    if (sourceId && !seenReplayMessageIds.has(sourceId)) {
      seenReplayMessageIds.add(sourceId)
      seenReplayMessages++
    }
    const nextItem = timelineItems[index + 1]
    const nextSourceId = nextItem !== undefined ? sourceMessageId(nextItem) : null
    const isLastSliceForSource = sourceId === null || nextSourceId !== sourceId
    const isReplayBoundary =
      isLastSliceForSource &&
      (replayBoundaryMessageId !== undefined
        ? sourceId === replayBoundaryMessageId
        : replayCompletedAt === undefined && replayMessageCount > 0 && seenReplayMessages === replayMessageCount)
    if (metadata.loaded && !insertedLoadedMetadata && isReplayBoundary) {
      visibleItems.push(metadata.loaded)
      insertedLoadedMetadata = true
    }
    if (timestamp !== null && replayLiveMessageThreshold !== undefined && timestamp < replayLiveMessageThreshold) {
      sawReplayItemBeforeLiveThreshold = true
    }
  }
  if (metadata.loaded && !insertedLoadedMetadata) {
    visibleItems.push(metadata.loaded)
  }
  if (metadata.ended) visibleItems.push(metadata.ended)
  const contentItems: TranscriptItem[] = showActivity ? [...visibleItems, { __activity: true }] : visibleItems
  const topPadding = Math.max(0, paddingTop ?? paddingY)
  const bottomPadding = Math.max(0, paddingBottom ?? paddingY)
  const items: TranscriptItem[] =
    (topPadding > 0 || bottomPadding > 0) && contentItems.length > 0
      ? [
          ...(topPadding > 0 ? [{ __padding: true as const, id: "viewport-top", height: topPadding }] : []),
          ...contentItems,
          ...(bottomPadding > 0 ? [{ __padding: true as const, id: "viewport-bottom", height: bottomPadding }] : []),
        ]
      : contentItems
  const renderItems = insertRenderGaps(groupSimilarItems(items, isBackgroundSystemMessage))
  const baseListEpoch = sessionMetadata?.replayCompletedAt ? `replay:${sessionMetadata.replayCompletedAt}` : "live"
  return {
    metadata,
    merged,
    visibleItems,
    contentItems,
    items,
    renderItems,
    topPadding,
    bottomPadding,
    listEpoch: baseListEpoch,
  }
}
