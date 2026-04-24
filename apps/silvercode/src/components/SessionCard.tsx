import React from "react"
import { Box, Spinner, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { MessageList } from "./MessageList.tsx"
import { Welcome } from "./Welcome.tsx"

/**
 * Live activity line — pinned to the bottom of the card body, shown whenever
 * the session isn't idle. Gives the user per-frame feedback that something IS
 * happening, even before any text-delta arrives on the wire (Claude's
 * "thinking…" gap can be 500ms-several seconds on Opus). Without this, the
 * card looks frozen.
 */
function ActivityIndicator({
  status,
  pendingPermissions,
  inFlightTool,
}: {
  status: "spawning" | "idle" | "thinking" | "tool-running" | "awaiting-permission" | "ended"
  pendingPermissions: number
  inFlightTool: string | null
}): React.ReactElement | null {
  if (status === "idle" || status === "ended") return null
  const label =
    status === "thinking"
      ? "thinking…"
      : status === "tool-running"
        ? inFlightTool
          ? `running ${inFlightTool}…`
          : "running tool…"
        : status === "awaiting-permission"
          ? `awaiting permission (${pendingPermissions})`
          : status === "spawning"
            ? "spawning claude…"
            : null
  if (!label) return null
  const color =
    status === "awaiting-permission" ? "$warning" : status === "tool-running" ? "$accent" : "$info"
  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Spinner type="dots" />
      <Text color={color}>{label}</Text>
    </Box>
  )
}

export function SessionCard({
  handle,
  isFocused,
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

  // The most recent tool call that doesn't yet have a matching result is the
  // one currently in flight. Used in the activity indicator label.
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

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      minWidth={0}
      paddingX={1}
      onClick={onFocus}
    >
      {/* No header — name is implicit (one session), model/mode/status all
          live in the side panel. Card header was noise duplicating side
          panel info. */}

      {/* Body — empty state renders the Welcome card; otherwise the virtualized
          message list (silvery ListView owns scroll + wheel + keys). */}
      <Box flexGrow={1} minHeight={0} minWidth={0} paddingX={1}>
        {state.messages.length === 0 ? (
          <Welcome handle={handle} />
        ) : (
          <MessageList messages={state.messages} onApprove={onApprove} onDeny={onDeny} sessionId={handle.id} />
        )}
      </Box>

      {/* Activity indicator — bottom-pinned when the session is doing something */}
      <ActivityIndicator
        status={state.status}
        pendingPermissions={state.permissions.length}
        inFlightTool={inFlightTool}
      />
    </Box>
  )
}
