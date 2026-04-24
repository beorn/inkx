import React from "react"
import { Box, Muted, Small, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

export function TodoPanel({ handle }: { handle: SessionHandle }): React.ReactElement | null {
  const state = useStoreSignal(handle.store)
  if (state.todos.length === 0) return null
  return (
    <Box flexDirection="column" paddingX={1} borderStyle="single" borderColor="$accent">
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          Todos
        </Text>
        <Muted>
          ({state.todos.filter((t) => t.status === "completed").length}/{state.todos.length})
        </Muted>
      </Box>
      {state.todos.map((t, i) => (
        <Box key={i} flexDirection="row" gap={1}>
          <Text color={t.status === "completed" ? "$success" : t.status === "in_progress" ? "$accent" : "$muted"}>
            {t.status === "completed" ? "✓" : t.status === "in_progress" ? "▸" : "○"}
          </Text>
          <Text strikethrough={t.status === "completed"} color={t.status === "completed" ? "$muted" : undefined}>
            {t.status === "in_progress" && t.activeForm ? t.activeForm : t.content}
          </Text>
        </Box>
      ))}
    </Box>
  )
}
