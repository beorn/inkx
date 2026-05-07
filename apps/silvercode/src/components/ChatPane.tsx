import React from "react"
import { Box, Text, type ListViewHandle } from "silvery"
import { useSignal } from "@silvery/ag-react"
import type { Controller, SessionHandle } from "../controller.ts"
import { createChatSessionProjectionStore } from "../chat/store.ts"
import type { ChatEvent, ChatEventId, ChatLeaf, ChatNodeId } from "../chat/types.ts"
import { useNotificationStream } from "../hooks/use-notification-stream.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { SessionUpdateList } from "./SessionUpdateList.tsx"
import { Welcome } from "./Welcome.tsx"
import type { MessageEntry, SessionState } from "@km/agent-harness"
import { Chat } from "./Chat.tsx"
import { ChatBlockList } from "./ChatBlockList.tsx"
import { chatActivitySnapshotFromMessages } from "../chat/activity-snapshot.ts"
import {
  projectCurrentSubagentActivitiesFromChatEvents,
  subagentActivityRowsFromActivities,
} from "../chat/subagent-activities.ts"
import { filterVisibleNotificationEntries } from "../chat/notification-visibility.ts"
import { NotificationBlock } from "./NotificationBlock.tsx"
import type { NotificationStreamEntry } from "../notification-stream.ts"
import { useBackgroundTasks } from "../hooks/use-background-tasks.ts"

/**
 * Per-agent display labels for the inline activity row's spawning state.
 * Mirrors the AGENT_LABELS map in `Welcome.tsx` (and the AGENT_DISPLAY map
 * in `SidePanel.tsx`) so the chat-side "Spawning Claude Code v…" label and
 * the welcome-side "<agent label>" muted line stay in sync. Bead: km-cr94.
 */
const AGENT_LABELS_FOR_ACTIVITY: Readonly<Record<string, string>> = {
  claude: "Claude Code",
  "claude-code": "Claude Code",
  "claude-code-spawn": "Claude Code",
  "claude-code-sdk": "Claude Code",
  codex: "Codex",
  "codex-spawn": "Codex",
  gemini: "Gemini",
  "github-copilot-cli": "GitHub Copilot",
}

function agentLabelFor(agent?: string): string | null {
  if (!agent) return null
  return AGENT_LABELS_FOR_ACTIVITY[agent] ?? null
}

function hasVisibleTranscriptContent(messages: readonly MessageEntry[]): boolean {
  return messages.some((m) => {
    if (m.text.trim().length > 0) return true
    return m.ops.some((op) => {
      if (op.kind === "text" || op.kind === "thinking") return op.text.trim().length > 0
      return true
    })
  })
}

function isRecapSystemText(text: string): boolean {
  return text === "RECAP" || text.startsWith("RECAP ·") || text.startsWith("<recap:")
}

function isDebugSystemMessage(message: MessageEntry): boolean {
  if (message.role !== "system") return false
  if (!message.additionalContext) return false
  if (isRecapSystemText(message.text)) return false
  if (message.text === "Compact summary") return false
  return true
}

function messageIdForChatEvent(event: ChatEvent): string | undefined {
  switch (event.type) {
    case "message.started":
    case "message.part.added":
    case "message.completed":
      return event.payload.messageId
    default:
      return undefined
  }
}

function eventsAfterReplayBoundary(
  events: readonly ChatEvent[],
  replayBoundaryMessageId: string | undefined,
): readonly ChatEvent[] {
  if (!replayBoundaryMessageId) return events
  let boundaryIndex = -1
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (event && messageIdForChatEvent(event) === replayBoundaryMessageId) boundaryIndex = index
  }
  return boundaryIndex >= 0 ? events.slice(boundaryIndex + 1) : events
}

function notificationEntryTs(entry: NotificationStreamEntry): number {
  return entry.ts ?? entry.timestamp ?? 0
}

function notificationEntriesAfterProjectedEvents(
  entries: readonly NotificationStreamEntry[],
  currentEvents: readonly ChatEvent[],
  allEvents: readonly ChatEvent[],
): readonly NotificationStreamEntry[] {
  if (currentEvents === allEvents) return entries
  const firstCurrentTs = currentEvents[0]?.ts
  if (firstCurrentTs === undefined) return []
  return entries.filter((entry) => notificationEntryTs(entry) >= firstCurrentTs)
}

function notificationLeafFromEntry(entry: NotificationStreamEntry): ChatLeaf {
  const id = `notification:${entry.id}`
  return {
    id: `leaf:${id}` as ChatNodeId,
    type: "notification",
    channel: "notification",
    eventIds: [id as ChatEventId],
    width: "prose",
    defaultDisclosure: "collapsed",
    detailAccess: ["expand", "cmd-hover"],
    rawRefs: [{ id, source: "local", label: entry.source, raw: entry }],
    props: {
      source: entry.source,
      body: entry.content,
      actionable: entry.actionable,
    },
  }
}

function ProjectedTranscriptCompare({ leaves }: { leaves: readonly ChatLeaf[] }): React.ReactElement | null {
  if (leaves.length === 0) return null
  return (
    <Box flexDirection="column" flexShrink={0} height={12} minWidth={0} overflow="hidden" paddingTop={1}>
      <ContentDivider label={`Projected ChatBlocks · ${leaves.length}`} />
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} overflow="hidden">
        <ChatBlockList leaves={leaves} follow={false} />
      </Box>
    </Box>
  )
}

function ContentDivider({ label }: { label: string }): React.ReactElement {
  return (
    <Box flexDirection="row" flexShrink={0} minWidth={0}>
      <Text color="$muted">{label}</Text>
    </Box>
  )
}

/**
 * One session's visible pane: scrollable message list + inline activity
 * indicator (delegated to SessionUpdateList's tail slot when status is active).
 *
 * The pane owns overflow clipping — `overflow="hidden"` here + in App.tsx's
 * left column Box form the two boundaries the flex engine honours. Without
 * those, wide unwrappable content (paths, URLs, JSON) expands the column
 * and pushes the side panel off-screen.
 *
 * Active-pane visual cue: a 1-col `▎` bar painted in `$accent` flush with
 * the focused pane's left edge. Picked over a bg tint because (a) it adds
 * zero chrome to inactive panes — they still render with no background —
 * and (b) it works on every terminal theme without depending on a subtle
 * bg color that some palettes flatten. Inactive panes paint a same-width
 * blank column so the content origin doesn't jump on focus change. NO
 * border around the pane — that'd be exactly the "boxes around
 * everything" anti-pattern this bead course-corrects against.
 */
export function ChatPane({
  handle,
  isFocused,
  isDimmed = false,
  onFocus,
  onApprove,
  onDeny,
  onRegisterScrollList,
  showDebug = false,
  controller,
  agent,
  composerSlot,
  follow = "end",
  showFocusBar = false,
  allSessions,
}: {
  handle: SessionHandle
  isFocused: boolean
  /** When true, the pane content renders dimmed — used as the "ghost"
   * effect for the source pane during a drag-move operation. */
  isDimmed?: boolean
  onFocus: () => void
  onApprove: (requestId: string) => void
  onDeny: (requestId: string) => void
  /**
   * Optional registration callback. App.tsx uses this to maintain a
   * Map<sessionId, ListViewHandle> so app-level Shift+Up/Down/PageUp/Down
   * scroll bindings can reach the focused session's ListView even though
   * keyboard focus lives in the SessionPromptComposer. Called with `null` on
   * unmount to drop the entry.
   */
  onRegisterScrollList?: (sessionId: string, handle: ListViewHandle | null) => void
  /** App-level `/raw` debug toggle. Forwarded to SessionUpdateList; expands
   *  each user message's `additionalContext` (system-reminders, hook
   *  output, isMeta bodies) inline. Bead:
   *  km-silvercode.resume-show-everything-collapsed. */
  showDebug?: boolean
  /**
   * Controller — when provided, the ChatPane reads the per-session
   * notification stream and merges its events into the chat scrollback as
   * inline notification rows. Optional so legacy tests / fixture stories
   * can omit it and get a pure-message scrollback.
   * Bead: km-silvercode.notification-inline-display.
   */
  controller?: Controller
  /** Canonical agent id from BUILTIN_AGENTS — drives the welcome screen's
   *  H1 ("Silver Code for Codex" vs "Silver Code for Claude Code").
   *  Undefined falls back to bare "Silver Code". */
  agent?: string
  /** App-level SessionPromptComposer element — forwarded to the centered
   *  Welcome screen so the same component appears under the banner during
   *  the empty-state. App suppresses the bottom-anchored render in that
   *  state so there's only ever one composer mounted. Bead:
   *  km-silvercode.welcome-bypassed-by-pane-grid-spawn. */
  composerSlot?: React.ReactNode
  /** Chat panes follow the latest turn; natural-height story previews can disable it. */
  follow?: "end" | false
  /** PaneGrid enables this when pane chrome is meaningful; standalone panes stay chrome-free. */
  showFocusBar?: boolean
  /** All live sessions, used only to enrich the agents drawer metadata. */
  allSessions?: ReadonlyArray<SessionHandle>
}): React.ReactElement {
  const state = useStoreSignal(handle.store)
  const sessionHandles = React.useMemo(() => allSessions ?? [handle], [allSessions, handle])
  const chatProjection = React.useMemo(
    () => createChatSessionProjectionStore(handle.store, { sessionId: handle.id }),
    [handle.id, handle.store],
  )
  React.useEffect(() => () => chatProjection.dispose(), [chatProjection])
  React.useEffect(() => {
    chatProjection.setChannelVisible("debug", showDebug)
  }, [chatProjection, showDebug])
  const projectedEvents = useSignal(chatProjection.events) ?? chatProjection.events()
  const projectedLeaves = useSignal(chatProjection.visibleLeaves) ?? chatProjection.visibleLeaves()
  const activeAgents = useSignal(controller?.crossAgentState.activeSessions ?? null) ?? []
  const sessionStates = useAllSessionStates(sessionHandles)
  const backgroundTasks = useBackgroundTasks(controller, handle.id)
  // Notification stream — pre-filtered through the mute set so muted source
  // rows never reach `SessionUpdateList`. The hook handles a null
  // controller internally (returns []), keeping rules-of-hooks intact.
  const rawNotificationEntries = useNotificationStream(controller ?? null, handle.id, { respectMute: false })
  const mutedNotificationEntries = useNotificationStream(controller ?? null, handle.id)
  const currentProjectedEvents = React.useMemo(
    () => eventsAfterReplayBoundary(projectedEvents, handle.metadata?.replayBoundaryMessageId),
    [handle.metadata?.replayBoundaryMessageId, projectedEvents],
  )
  const currentRawNotificationEntries = React.useMemo(
    () => notificationEntriesAfterProjectedEvents(rawNotificationEntries, currentProjectedEvents, projectedEvents),
    [currentProjectedEvents, projectedEvents, rawNotificationEntries],
  )
  const currentSubagentActivityProjection = React.useMemo(
    () =>
      projectCurrentSubagentActivitiesFromChatEvents(currentProjectedEvents, {
        notificationEntries: currentRawNotificationEntries,
        sessionId: handle.id,
      }),
    [currentProjectedEvents, currentRawNotificationEntries, handle.id],
  )
  const currentSubagentActivities = React.useMemo(
    () => subagentActivityRowsFromActivities(currentSubagentActivityProjection.activities),
    [currentSubagentActivityProjection],
  )
  const notificationBlock = React.useMemo(
    () =>
      chatActivitySnapshotFromMessages(state.messages, backgroundTasks, {
        agents: currentSubagentActivities,
        sessionId: handle.id,
      }),
    [backgroundTasks, currentSubagentActivities, handle.id, state.messages],
  )
  const notificationBlockCounts = React.useMemo(
    () => ({ ...notificationBlock.counts, agentsRunning: 0 }),
    [notificationBlock.counts],
  )
  const drawerSessions = React.useMemo(
    () =>
      activeAgents.map((session) => {
        const handleForSession = sessionHandles.find((candidate) => candidate.id === session.sessionId)
        const liveState = sessionStates.get(session.sessionId)
        const metadata = handleForSession?.metadata
        const cost = liveState?.cost
        const elapsedMs = elapsedMsSince(metadata?.spawnedAt ?? session.startedAt, metadata?.endedAt)
        return {
          ...session,
          metrics: {
            ...(elapsedMs !== undefined ? { elapsedMs } : {}),
            ...(cost && cost.usd > 0 ? { costUsd: cost.usd } : {}),
          },
          metadata: {
            model: session.model || liveState?.model || metadata?.model,
            account: metadata?.account,
            cwd: metadata?.cwd,
            tools: liveState?.tools.length,
            mcpServers: liveState?.mcpServers.length,
            slashCommands: liveState?.slashCommands.length,
            skills: liveState?.skills.length,
            plugins: liveState?.plugins.length,
          },
          raw: {
            kind: "session",
            coordinatorSessionId: session.sessionId,
            providerSessionId: metadata?.sessionId ?? liveState?.sessionId,
            name: session.name,
            status: session.status,
            model: session.model || liveState?.model || metadata?.model,
            startedAt: session.startedAt,
            metadata,
            state: liveState
              ? {
                  sessionId: liveState.sessionId,
                  model: liveState.model,
                  mode: liveState.mode,
                  cwd: liveState.cwd,
                  tools: liveState.tools,
                  mcpServers: liveState.mcpServers,
                  slashCommands: liveState.slashCommands,
                  skills: liveState.skills,
                  plugins: liveState.plugins,
                  claudeCodeVersion: liveState.claudeCodeVersion,
                  apiKeySource: liveState.apiKeySource,
                  status: liveState.status,
                  messageCount: liveState.messages.length,
                  pendingPermissions: liveState.permissions.length,
                  hasPendingQuestion: liveState.pendingQuestion !== null,
                  plan: liveState.plan,
                  todos: liveState.todos,
                  cost: liveState.cost,
                  lastError: liveState.lastError,
                }
              : undefined,
          },
        }
      }),
    [activeAgents, sessionHandles, sessionStates],
  )
  const notificationEntries = React.useMemo(
    () => filterVisibleNotificationEntries(mutedNotificationEntries, showDebug, handle.id, state.messages),
    [handle.id, mutedNotificationEntries, showDebug, state.messages],
  )
  const notificationLeaves = React.useMemo(
    () => notificationEntries.map((entry) => notificationLeafFromEntry(entry)),
    [notificationEntries],
  )
  const projectedCompareLeaves = React.useMemo(
    () => [...projectedLeaves, ...notificationLeaves],
    [notificationLeaves, projectedLeaves],
  )
  const legacyMessages = React.useMemo(
    () => (showDebug ? state.messages : state.messages.filter((message) => !isDebugSystemMessage(message))),
    [showDebug, state.messages],
  )
  // Callback ref — fires with the live ListViewHandle on mount and with
  // null on unmount. Mirrors the handle into App's registration map so
  // app-level Shift+Up/Down scroll bindings can reach this pane's list
  // even though keyboard focus lives in the SessionPromptComposer.
  const sessionId = handle.id
  const scrollListRefCb = React.useCallback(
    (instance: ListViewHandle | null): void => {
      onRegisterScrollList?.(sessionId, instance)
    },
    [onRegisterScrollList, sessionId],
  )

  // The most recent tool call that doesn't yet have a matching result is
  // the one currently in flight. Used in the activity indicator label.
  const inFlightTool = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i]
      if (m === undefined) continue
      for (let j = m.toolCalls.length - 1; j >= 0; j--) {
        const c = m.toolCalls[j]
        if (c === undefined) continue
        const hasResult = m.toolResults.some((r) => r.id === c.id)
        if (!hasResult) return c.name
      }
    }
    return null
  })()

  // Elapsed time is anchored to the latest MessageEntry's `ts` (most
  // recent turn, user or assistant); if there are no messages yet we
  // pass null and the indicator omits the elapsed segment.
  const turnStartedAt = state.messages[state.messages.length - 1]?.ts ?? null
  const hasTranscriptContent = hasVisibleTranscriptContent(legacyMessages)
  const [composerHeight, setComposerHeight] = React.useState(0)
  const composerOverlayHeight = composerSlot ? Math.max(3, composerHeight) : 0
  const transcriptBottomPadding = hasTranscriptContent ? 1 : 0

  return (
    // `userSelect="contain"` is a hard CSS-style selection boundary here:
    // document-aware selection can expand within the pane, but not into
    // neighboring panes or the side panel.
    <Box
      flexDirection="row"
      width="100%"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      minHeight={0}
      overflow="hidden"
      userSelect="contain"
      backgroundColor={isDimmed ? "$bg-surface-subtle" : undefined}
      onClick={onFocus}
      position="relative"
    >
      <Box flexShrink={0} width={showFocusBar ? 1 : 0}>
        {showFocusBar ? <Text color={isFocused ? "$accent" : undefined}>{isFocused ? "▎" : " "}</Text> : null}
      </Box>
      {showFocusBar && isFocused ? (
        <Box position="absolute" top={1} left={0} width={1} height={1} flexShrink={0}>
          <Text color="$accent">▎</Text>
        </Box>
      ) : null}
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
          {!hasTranscriptContent ? (
            <Welcome
              handle={handle}
              agent={agent}
              model={state.model || handle.metadata?.model}
              composerSlot={composerSlot}
            />
          ) : (
            <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0}>
              <Chat.Transcript>
                <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} position="relative">
                  <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} overflow="hidden">
                    <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} overflow="hidden">
                      <SessionUpdateList
                        ref={scrollListRefCb}
                        messages={legacyMessages}
                        onApprove={onApprove}
                        onDeny={onDeny}
                        sessionId={handle.id}
                        status={state.status}
                        turnStartedAt={turnStartedAt}
                        inputTokens={state.cost.inputTokens}
                        outputTokens={state.cost.outputTokens}
                        pendingPermissions={state.permissions.length}
                        inFlightTool={inFlightTool}
                        showDebug={showDebug}
                        notificationEntries={notificationEntries}
                        sessionMetadata={handle.metadata}
                        agentLabel={agentLabelFor(agent)}
                        agentVersion={state.claudeCodeVersion || null}
                        follow={follow}
                        paddingTop={hasTranscriptContent ? 1 : 0}
                        paddingBottom={transcriptBottomPadding}
                        viewportBottomInset={composerOverlayHeight}
                      />
                    </Box>
                    {showDebug ? <ProjectedTranscriptCompare leaves={projectedCompareLeaves} /> : null}
                  </Box>
                  {composerSlot ? (
                    <Box
                      position="absolute"
                      left={0}
                      right={0}
                      bottom={0}
                      paddingY={1}
                      flexDirection="column"
                      gap={1}
                      onLayout={(rect) => {
                        const height = Math.max(0, Math.round(rect.height))
                        setComposerHeight((previous) => (previous === height ? previous : height))
                      }}
                    >
                      <Chat.AgentsDrawer
                        sessions={drawerSessions}
                        selfSessionId={handle.id}
                        subagents={notificationBlock.agents}
                        diagnostics={currentSubagentActivityProjection.diagnostics}
                      />
                      <Chat.PlanDrawer plan={state.plan} />
                      <NotificationBlock
                        counts={notificationBlockCounts}
                        agents={[]}
                        shells={notificationBlock.shells}
                        backgroundTasks={backgroundTasks}
                        onCancelBackgroundTask={(taskId) => controller?.cancelBackgroundTask(handle.id, taskId)}
                        onForegroundBackgroundTask={(taskId) => controller?.foregroundTask(handle.id, taskId)}
                      />
                      <Chat.Composer>
                        <Box flexDirection="column" width="100%" minWidth={0} backgroundColor="$bg-surface-raised">
                          {composerSlot}
                        </Box>
                      </Chat.Composer>
                    </Box>
                  ) : null}
                </Box>
              </Chat.Transcript>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}

function useAllSessionStates(sessions: ReadonlyArray<SessionHandle>): ReadonlyMap<string, SessionState> {
  const [states, setStates] = React.useState<ReadonlyMap<string, SessionState>>(
    () => new Map(sessions.map((session) => [session.id, session.store.state.get()])),
  )
  const sessionKey = sessions.map((session) => session.id).join("\0")
  React.useEffect(() => {
    let next = new Map(sessions.map((session) => [session.id, session.store.state.get()]))
    setStates(next)
    const unsubs = sessions.map((session) =>
      session.store.state.subscribe((state) => {
        next = new Map(next)
        next.set(session.id, state)
        setStates(next)
      }),
    )
    return () => {
      for (const unsub of unsubs) unsub()
    }
  }, [sessionKey, sessions])
  return states
}

function elapsedMsSince(start: number | undefined, end: number | undefined): number | undefined {
  if (typeof start !== "number") return undefined
  const to = typeof end === "number" ? end : Date.now()
  if (to < start) return undefined
  return to - start
}
