import React from "react"
import { Box, H3, Muted, Small } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { MessageList } from "./MessageList.tsx"

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

  const statusText =
    state.status === "spawning"
      ? "spawning…"
      : state.status === "thinking"
        ? "thinking…"
        : state.status === "tool-running"
          ? "running tool…"
          : state.status === "awaiting-permission"
            ? `awaiting permission (${state.permissions.length})`
            : state.status === "ended"
              ? "ended"
              : "idle"

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      borderStyle={isFocused ? "round" : "single"}
      borderColor={isFocused ? "$primary" : "$border"}
      onClick={onFocus}
    >
      {/* Card header */}
      <Box flexDirection="row" paddingX={1} gap={1}>
        <H3>{handle.name}</H3>
        <Muted>
          ({state.model || "…"} / {state.mode || "…"})
        </Muted>
        <Box flexGrow={1} />
        <Small>{statusText}</Small>
      </Box>

      {/* Messages (scrollable body) */}
      <Box
        flexGrow={1}
        overflow="scroll"
        paddingX={1}
        scrollTo={Math.max(0, state.messages.length - 1)}
      >
        <MessageList
          messages={state.messages}
          onApprove={onApprove}
          onDeny={onDeny}
          sessionId={handle.id}
        />
      </Box>
    </Box>
  )
}
