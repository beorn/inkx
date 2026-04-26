import React from "react"
import { Box, Text, type ListViewHandle } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { SessionUpdateList } from "./SessionUpdateList.tsx"
import { Welcome } from "./Welcome.tsx"

/**
 * One session's visible card: scrollable message list + inline activity
 * indicator (delegated to SessionUpdateList's tail slot when status is active).
 *
 * The card owns overflow clipping — `overflow="hidden"` here + in App.tsx's
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
export function SessionCard({
  handle,
  isFocused,
  isDimmed = false,
  onFocus,
  onApprove,
  onDeny,
  onRegisterScrollList,
  showRaw = false,
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
  showRaw?: boolean
}): React.ReactElement {
  const state = useStoreSignal(handle.store)
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

  return (
    // `userSelect="contain"` scopes mouse-drag selection to this card —
    // drags that start here can't extend into neighboring cards or the
    // side panel (silvery's findContainBoundary walks up to this ancestor
    // and clips the drag to its scrollRect). Without it, drag selects
    // across the whole screen, which is messy when multiple sessions
    // are laid out side-by-side.
    <Box
      flexDirection="row"
      flexGrow={1}
      flexShrink={1}
      minWidth={0}
      minHeight={0}
      overflow="hidden"
      userSelect="contain"
      backgroundColor={isDimmed ? "$bg-surface-subtle" : undefined}
      onClick={onFocus}
    >
      {/* Left-edge accent bar = active-pane indicator. 1 col wide; visible
          only when this pane is focused. Inactive panes render a same-width
          blank column so the content origin (and any text-wrap math
          downstream) stays stable across focus changes.
          `overflow="hidden"` is load-bearing: without it, the 200-char wrap
          text's max-content width inflates the column, pushing Welcome /
          SessionUpdateList content right off the visible viewport (verified in
          `tests/welcome-card-hidden.test.tsx`). flexBasis/width=1 alone
          don't clamp — flex needs an overflow boundary on the wrap-content
          item itself. */}
      <Box flexShrink={0} flexGrow={0} flexBasis={1} width={1} flexDirection="column" overflow="hidden">
        {isFocused ? (
          <Text color="$accent" wrap="wrap">
            {"▎".repeat(200)}
          </Text>
        ) : null}
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        flexShrink={1}
        minWidth={0}
        minHeight={0}
        paddingLeft={1}
        paddingRight={2}
      >
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1} paddingTop={1}>
          {state.messages.length === 0 ? (
            <Welcome handle={handle} />
          ) : (
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
              showRaw={showRaw}
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}
