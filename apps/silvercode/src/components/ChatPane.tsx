import React from "react"
import { Box, Text, type ListViewHandle } from "silvery"
import { useSignal } from "@silvery/ag-react"
import type { Controller, SessionHandle } from "../controller.ts"
import { useNotificationStream } from "../hooks/use-notification-stream.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { SessionUpdateList } from "./SessionUpdateList.tsx"
import { Welcome } from "./Welcome.tsx"
import type { MessageEntry } from "@km/agent-harness"
import { Chat } from "./Chat.tsx"
import { NotificationBlock, notificationBlockSnapshotFromMessages } from "./NotificationBlock.tsx"
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
}): React.ReactElement {
  const state = useStoreSignal(handle.store)
  const activeAgents = useSignal(controller?.crossAgentState.activeSessions ?? null) ?? []
  const backgroundTasks = useBackgroundTasks(controller, handle.id)
  const notificationBlock = notificationBlockSnapshotFromMessages(state.messages, backgroundTasks)
  // Notification stream — pre-filtered through the mute set so muted source
  // rows never reach `SessionUpdateList`. The hook handles a null
  // controller internally (returns []), keeping rules-of-hooks intact.
  const notificationEntries = useNotificationStream(controller ?? null, handle.id)
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
      const m = state.messages[i]!
      for (let j = m.toolCalls.length - 1; j >= 0; j--) {
        const c = m.toolCalls[j]!
        const hasResult = m.toolResults.some((r) => r.id === c.id)
        if (!hasResult) return c.name
      }
    }
    return null
  })()

  // Elapsed time is anchored to the latest MessageEntry's `ts` (most
  // recent turn, user or assistant); if there are no messages yet we
  // pass null and the indicator omits the elapsed segment.
  const turnStartedAt = state.messages.length > 0 ? state.messages[state.messages.length - 1]!.ts : null
  const hasTranscriptContent = hasVisibleTranscriptContent(state.messages)
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
                  <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} overflow="hidden">
                    <SessionUpdateList
                      ref={scrollListRefCb}
                      messages={state.messages}
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
                  {composerSlot ? (
                    <Box
                      position="absolute"
                      left={0}
                      right={1}
                      bottom={0}
                      paddingY={1}
                      flexDirection="column"
                      gap={1}
                      onLayout={(rect) => {
                        const height = Math.max(0, Math.round(rect.height))
                        setComposerHeight((previous) => (previous === height ? previous : height))
                      }}
                    >
                      <Chat.AgentsDrawer sessions={activeAgents} selfSessionId={handle.id} />
                      <Chat.PlanDrawer plan={state.plan} />
                      <NotificationBlock
                        counts={notificationBlock.counts}
                        agents={notificationBlock.agents}
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
