import React from "react"
import { Box } from "silvery"
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
 */
export function SessionCard({
  handle,
  onFocus,
  onApprove,
  onDeny,
}: {
  handle: SessionHandle
  isFocused: boolean
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
    <Box flexDirection="column" flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} overflow="hidden" paddingX={1} onClick={onFocus}>
      <Box flexGrow={1} flexShrink={1} minWidth={0} minHeight={0} paddingX={1}>
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
  )
}
