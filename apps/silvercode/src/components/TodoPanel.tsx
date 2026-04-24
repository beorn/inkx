import React from "react"
import { Box, Muted, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

export function TodoPanel({ handle }: { handle: SessionHandle }): React.ReactElement {
  const state = useStoreSignal(handle.store)
  const done = state.todos.filter((t) => t.status === "completed").length
  return (
    <Box flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text bold color="$accent">
          Todos
        </Text>
        <Muted>
          ({done}/{state.todos.length})
        </Muted>
      </Box>
      {state.todos.length === 0 ? (
        <Muted>
          No todos yet — Claude populates this via the TodoWrite tool when planning multi-step work.
        </Muted>
      ) : (
        state.todos.map((t, i) => (
          <Box key={i} flexDirection="row" gap={1}>
            <Text color={t.status === "completed" ? "$success" : t.status === "in_progress" ? "$accent" : "$muted"}>
              {t.status === "completed" ? "✓" : t.status === "in_progress" ? "▸" : "○"}
            </Text>
            <Text strikethrough={t.status === "completed"} color={t.status === "completed" ? "$muted" : undefined}>
              {t.status === "in_progress" && t.activeForm ? t.activeForm : t.content}
            </Text>
          </Box>
        ))
      )}
    </Box>
  )
}
