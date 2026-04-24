import React from "react"
import { Box, H3, Muted, Small, Text } from "silvery"
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
      borderStyle={isFocused ? "round" : "single"}
      borderColor={isFocused ? "$primary" : "$border"}
      padding={0}
      flexGrow={1}
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
      <Box flexGrow={1} overflow="scroll" paddingX={1}>
        <MessageList
          messages={state.messages}
          onApprove={onApprove}
          onDeny={onDeny}
          sessionId={handle.id}
        />
      </Box>

      {/* Permission requests for this session land here; inbox (overlay) shows cross-session */}
      {state.permissions.length > 0 && (
        <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="$warning">
          <Text bold color="$warning">
            {state.permissions.length} permission{state.permissions.length === 1 ? "" : "s"} pending
          </Text>
          {state.permissions.slice(0, 3).map((p) => (
            <Box key={p.requestId} flexDirection="row" gap={1}>
              <Text>{p.tool}</Text>
              <Muted>(Ctrl+I to triage)</Muted>
            </Box>
          ))}
        </Box>
      )}

      {/* Error line */}
      {state.lastError && (
        <Box paddingX={1}>
          <Text color="$error">{state.lastError}</Text>
        </Box>
      )}
    </Box>
  )
}
