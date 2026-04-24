import React from "react"
import { Box, Muted, Small, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import {
  contextUtilizationColor,
  contextUtilizationLevel,
  contextUtilizationPercent,
  contextWindowFor,
} from "../context-windows.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { usePopover } from "./Popover.tsx"

/**
 * Right-side panel. Layout per user spec:
 *
 *   Sessions                          ← list of active sessions, click to focus
 *     ▸ session 1
 *       session 2
 *
 *   Todos: 0                          ← click for help popover
 *   Agents: 0 / 0                     ← click for help popover
 *
 *   ─────────                         (flex spacer)
 *
 *   Mode: accept-edits                ← clickable to cycle, popover = help
 *   ◈ silvercode v0.1.0
 *   ✻ Claude Code v2.1.119
 *   0K / 200K (0%) · $0.0001          ← click for details popover
 */

const MODE_COLORS: Record<string, string> = {
  plan: "$info",
  "accept-edits": "$warning",
  auto: "$success",
  bypass: "$error",
}

const SILVERCODE_VERSION = "0.1.0" // bump when apps/silvercode/package.json changes

export function SidePanel({
  focused,
  sessions,
  focusedSessionId,
  onFocusSession,
  mode,
  onCycleMode,
}: {
  focused: SessionHandle
  sessions: SessionHandle[]
  focusedSessionId: string
  onFocusSession: (id: string) => void
  mode: string
  onCycleMode: () => void
}): React.ReactElement | null {
  // Defensive guard — App.tsx already conditions on focused, but if an
  // error-recovery path or stale closure passes undefined we'd crash on
  // focused.store. Return null instead of throwing.
  if (!focused) return null
  const state = useStoreSignal(focused.store)
  const popover = usePopover()
  const modeColor = MODE_COLORS[mode] ?? "$muted"
  const totalTokens = state.cost.inputTokens + state.cost.outputTokens
  const window = contextWindowFor(state.model)
  const pct = contextUtilizationPercent(totalTokens, window)
  const ctxColor = contextUtilizationColor(contextUtilizationLevel(pct))
  const ctxLabel = `${Math.round(totalTokens / 1000)}K / ${Math.round(window / 1000)}K (${pct}%)`

  // One useStoreSignal call; derive todos + agents counts from the same state.
  const todosCount = state.todos.length
  const agentsTotal = state.messages.reduce(
    (n, m) => n + m.toolCalls.filter((c) => c.name === "Task" || c.name === "Agent").length,
    0,
  )
  const agentsRunning = state.messages.reduce(
    (n, m) =>
      n +
      m.toolCalls.filter((c) => (c.name === "Task" || c.name === "Agent") && !m.toolResults.some((r) => r.id === c.id))
        .length,
    0,
  )

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      {/* Sessions */}
      <Box flexDirection="column" flexShrink={0}>
        <Text bold color="$primary">
          Sessions
        </Text>
        {sessions.map((s) => (
          <Box key={s.id} flexDirection="row" gap={1} onClick={() => onFocusSession(s.id)}>
            <Text color={s.id === focusedSessionId ? "$accent" : "$muted"}>
              {s.id === focusedSessionId ? "▸" : " "}
            </Text>
            <Text color={s.id === focusedSessionId ? undefined : "$muted"}>{s.name}</Text>
          </Box>
        ))}
      </Box>

      {/* Todos + Agents counters */}
      <Box flexDirection="column" flexShrink={0} paddingTop={1}>
        <Box
          flexDirection="row"
          gap={1}
          onClick={() =>
            popover.show(
              <Box flexDirection="column">
                <Text bold>Todos</Text>
                <Muted>
                  Claude writes todos via the TodoWrite tool when planning multi-step work. They appear here as the
                  plan is executed.
                </Muted>
                {state.todos.length > 0 ? (
                  state.todos.map((t, i) => (
                    <Text key={i} color={t.status === "completed" ? "$success" : "$muted"}>
                      {t.status === "completed" ? "✓" : t.status === "in_progress" ? "▸" : "○"} {t.content}
                    </Text>
                  ))
                ) : (
                  <Muted>No todos yet.</Muted>
                )}
              </Box>,
              { x: 0, y: 0 },
            )
          }
        >
          <Text bold>Todos</Text>
          <Text color="$muted">{todosCount}</Text>
        </Box>
        <Box
          flexDirection="row"
          gap={1}
          onClick={() =>
            popover.show(
              <Box flexDirection="column">
                <Text bold>Agents</Text>
                <Muted>
                  Claude uses the Task tool to delegate research or parallel work to sub-agents. Running / total
                  count reflects Task invocations in this session.
                </Muted>
              </Box>,
              { x: 0, y: 0 },
            )
          }
        >
          <Text bold>Agents</Text>
          <Text color="$muted">
            {agentsRunning} / {agentsTotal}
          </Text>
        </Box>
      </Box>

      {/* Flex spacer pushes the bottom meta to the bottom */}
      <Box flexGrow={1} />

      {/* Bottom meta — Mode / version lines / ctx summary */}
      <Box flexDirection="column" flexShrink={0} gap={0}>
        <Box
          flexDirection="row"
          gap={1}
          onClick={() => {
            onCycleMode()
            popover.show(
              <Box flexDirection="column">
                <Text bold>Mode</Text>
                <Muted>Controls what Claude is allowed to do without asking first. Click the label to cycle.</Muted>
                <Text>
                  <Text color="$info">plan</Text> — plans but doesn't write
                </Text>
                <Text>
                  <Text color="$warning">accept-edits</Text> — edits auto-apply; tools still prompt
                </Text>
                <Text>
                  <Text color="$success">auto</Text> — default; all Claude tools unattended
                </Text>
                <Text>
                  <Text color="$error">bypass</Text> — skip all approvals (sandboxes only)
                </Text>
              </Box>,
              { x: 0, y: 0 },
            )
          }}
        >
          <Muted>Mode:</Muted>
          <Text color={modeColor} bold>
            {mode}
          </Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="$accent">◈</Text>
          <Small>silvercode v{SILVERCODE_VERSION}</Small>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="$accent">✻</Text>
          <Small>Claude Code v{state.claudeCodeVersion || "…"}</Small>
        </Box>
        <Box
          flexDirection="row"
          gap={1}
          onClick={() =>
            popover.show(
              <Box flexDirection="column">
                <Text bold>Context + Cost</Text>
                <Box flexDirection="row" gap={1}>
                  <Muted>input:</Muted>
                  <Text>{state.cost.inputTokens.toLocaleString()} tok</Text>
                </Box>
                <Box flexDirection="row" gap={1}>
                  <Muted>output:</Muted>
                  <Text>{state.cost.outputTokens.toLocaleString()} tok</Text>
                </Box>
                <Box flexDirection="row" gap={1}>
                  <Muted>window:</Muted>
                  <Text>{window.toLocaleString()} tok</Text>
                </Box>
                <Box flexDirection="row" gap={1}>
                  <Muted>cost:</Muted>
                  <Text>${state.cost.usd.toFixed(4)}</Text>
                </Box>
                <Muted>
                  Color shifts at 70% (warning) and 90% (error). Run /compact to summarize older turns when approaching
                  the window.
                </Muted>
              </Box>,
              { x: 0, y: 0 },
            )
          }
        >
          <Text color={ctxColor}>{ctxLabel}</Text>
          <Muted>·</Muted>
          <Muted>${state.cost.usd.toFixed(4)}</Muted>
        </Box>
      </Box>
    </Box>
  )
}
