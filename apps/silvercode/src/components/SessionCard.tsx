import React from "react"
import { Box, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { MessageList } from "./MessageList.tsx"
import { Welcome } from "./Welcome.tsx"

/**
 * One session's visible card: scrollable message list + inline activity
 * indicator (delegated to MessageList's tail slot when status is active).
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
}: {
  handle: SessionHandle
  isFocused: boolean
  /** When true, the pane content renders dimmed — used as the "ghost"
   * effect for the source pane during a drag-move operation. */
  isDimmed?: boolean
  onFocus: () => void
  onApprove: (requestId: string) => void
  onDeny: (requestId: string) => void
}): React.ReactElement {
  const state = useStoreSignal(handle.store)

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
          downstream) stays stable across focus changes. */}
      <Box flexShrink={0} flexGrow={0} flexBasis={1} width={1} flexDirection="column">
        {isFocused ? (
          <Text color="$accent" wrap="wrap">
            {"▎".repeat(200)}
          </Text>
        ) : null}
      </Box>
      <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1}>
        <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1} paddingTop={1}>
          {state.messages.length === 0 ? (
            <Welcome handle={handle} />
          ) : (
            <MessageList
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
            />
          )}
        </Box>
      </Box>
    </Box>
  )
}
