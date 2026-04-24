import React, { useMemo } from "react"
import { Box, Muted, Small, Text, useHover, usePopoverHandlers } from "silvery"
import type { SessionHandle } from "../controller.ts"
import {
  contextUtilizationColor,
  contextUtilizationLevel,
  contextUtilizationPercent,
  contextWindowFor,
} from "../context-windows.ts"
import { gitBranchFor } from "../git-branch.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

/**
 * Right-side panel. Layout per user spec:
 *
 *   Sessions                          ← hover for help; heading has armed bg
 *     ▸ session 1                     ← click to focus, hover highlights row
 *       session 2
 *
 *   Todos   0                         ← hover for help popover
 *
 *   Agents  0 / 0                     ← hover for help popover
 *
 *   ─────────                         (flex spacer)
 *
 *   Mode: accept-edits                ← click cycles, hover shows help
 *
 *   ◈ silvercode v0.1.0
 *   ✻ Claude Code v2.1.119
 *
 *   0K / 200K (0%) · $0.0001          ← hover shows details
 *
 *   ~/Code/pim/km:main                ← cwd + git branch (opencode style)
 *
 * All clickable regions show a hover-armed background (`$bg-surface-hover`)
 * so the user sees they're interactive before clicking.
 */

const MODE_COLORS: Record<string, string> = {
  plan: "$info",
  "accept-edits": "$warning",
  auto: "$success",
  bypass: "$error",
}

const SILVERCODE_VERSION = "0.1.0" // bump when apps/silvercode/package.json changes

/** Shorten an absolute path using `~` for display. */
function shortCwd(cwd: string): string {
  const home = process.env.HOME ?? ""
  if (home && cwd.startsWith(home)) return `~${cwd.slice(home.length)}`
  return cwd
}

function SectionHeading({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <Text bold color="$primary">
      {children}
    </Text>
  )
}

/**
 * SessionRow — one row in the Sessions list. Its own component so each row
 * can track its own hover state independently (useHover per-row).
 */
function SessionRow({
  handle,
  isFocused,
  onClick,
}: {
  handle: SessionHandle
  isFocused: boolean
  onClick: () => void
}): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  return (
    <Box
      flexDirection="row"
      gap={1}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      backgroundColor={isHovered ? "$bg-surface-hover" : undefined}
    >
      <Text color={isFocused ? "$accent" : "$muted"}>{isFocused ? "▸" : " "}</Text>
      <Text color={isFocused ? undefined : "$muted"}>{handle.name}</Text>
    </Box>
  )
}

export function SidePanel({
  focused,
  sessions,
  focusedSessionId,
  onFocusSession,
  mode,
  onCycleMode,
  cwd,
}: {
  focused: SessionHandle
  sessions: SessionHandle[]
  focusedSessionId: string
  onFocusSession: (id: string) => void
  mode: string
  onCycleMode: () => void
  cwd: string
}): React.ReactElement | null {
  if (!focused) return null
  const state = useStoreSignal(focused.store)
  const modeColor = MODE_COLORS[mode] ?? "$muted"
  const totalTokens = state.cost.inputTokens + state.cost.outputTokens
  const window = contextWindowFor(state.model)
  const pct = contextUtilizationPercent(totalTokens, window)
  const ctxColor = contextUtilizationColor(contextUtilizationLevel(pct))
  const ctxLabel = `${Math.round(totalTokens / 1000)}K / ${Math.round(window / 1000)}K (${pct}%)`

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

  const branch = useMemo(() => gitBranchFor(cwd), [cwd])
  const cwdLabel = `${shortCwd(cwd)}${branch ? `:${branch}` : ""}`

  // Popover bodies + hover handlers for each interactive section. The
  // returned `isHovered` drives the armed bg so every clickable area signals
  // interactivity before the dwell popover shows.
  const sessionsHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column">
        <Text bold>Sessions</Text>
        <Muted>
          Each row is an independent Claude Code subprocess with its own transcript, permissions, and cost. Click a row
          to focus it.
        </Muted>
        <Muted>New sessions:</Muted>
        <Text>
          <Muted>• </Muted>
          <Text>/spawn [name]</Text>
          <Muted> — open another session alongside</Muted>
        </Text>
        <Text>
          <Muted>• </Muted>
          <Text>/fork</Text>
          <Muted> — clone current session state</Muted>
        </Text>
        <Text>
          <Muted>• </Muted>
          <Text>/handoff &lt;prompt&gt;</Text>
          <Muted> — move task + context</Muted>
        </Text>
        <Text>
          <Muted>• </Muted>
          <Text>Ctrl+N</Text>
          <Muted> — cycle focus</Muted>
        </Text>
        <Muted>Resume with: silvercode --resume &lt;sessionId&gt;</Muted>
      </Box>
    ),
    maxWidth: 52,
  })
  const todosHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column">
        <Text bold>Todos</Text>
        <Muted>
          Claude writes todos via the TodoWrite tool when planning multi-step work. They appear here as the plan is
          executed.
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
      </Box>
    ),
    maxWidth: 52,
  })
  const agentsHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column">
        <Text bold>Agents</Text>
        <Muted>
          Claude uses the Task tool to delegate research or parallel work to sub-agents. Running / total count reflects
          Task invocations in this session.
        </Muted>
      </Box>
    ),
    maxWidth: 52,
  })
  const modeHover = usePopoverHandlers({
    body: (
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
      </Box>
    ),
    maxWidth: 56,
  })
  const ctxHover = usePopoverHandlers({
    body: (
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
          Color shifts at 70% (warning) and 90% (error). Run /compact to summarize older turns when approaching the
          window.
        </Muted>
      </Box>
    ),
    maxWidth: 52,
  })

  const hoveredBg = (h: boolean): string | undefined => (h ? "$bg-surface-hover" : undefined)

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      {/* Sessions section — heading is a hover target with help. */}
      <Box flexDirection="column" flexShrink={0}>
        <Box
          flexDirection="row"
          onMouseEnter={sessionsHover.onMouseEnter}
          onMouseLeave={sessionsHover.onMouseLeave}
          backgroundColor={hoveredBg(sessionsHover.isHovered)}
        >
          <SectionHeading>Sessions</SectionHeading>
        </Box>
        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            handle={s}
            isFocused={s.id === focusedSessionId}
            onClick={() => onFocusSession(s.id)}
          />
        ))}
      </Box>

      {/* Todos */}
      <Box flexShrink={0} height={1} />
      <Box
        flexDirection="row"
        gap={1}
        flexShrink={0}
        onMouseEnter={todosHover.onMouseEnter}
        onMouseLeave={todosHover.onMouseLeave}
        backgroundColor={hoveredBg(todosHover.isHovered)}
      >
        <SectionHeading>Todos</SectionHeading>
        <Text color="$muted">{todosCount}</Text>
      </Box>

      {/* Agents */}
      <Box flexShrink={0} height={1} />
      <Box
        flexDirection="row"
        gap={1}
        flexShrink={0}
        onMouseEnter={agentsHover.onMouseEnter}
        onMouseLeave={agentsHover.onMouseLeave}
        backgroundColor={hoveredBg(agentsHover.isHovered)}
      >
        <SectionHeading>Agents</SectionHeading>
        <Text color="$muted">
          {agentsRunning} / {agentsTotal}
        </Text>
      </Box>

      {/* Flex spacer pushes the bottom meta to the bottom of the panel. */}
      <Box flexGrow={1} />

      {/* Mode — clickable to cycle, hover shows help + armed bg. */}
      <Box
        flexDirection="row"
        gap={1}
        flexShrink={0}
        onClick={onCycleMode}
        onMouseEnter={modeHover.onMouseEnter}
        onMouseLeave={modeHover.onMouseLeave}
        backgroundColor={hoveredBg(modeHover.isHovered)}
      >
        <Muted>Mode:</Muted>
        <Text color={modeColor} bold>
          {mode}
        </Text>
      </Box>

      {/* Version block — not interactive, no hover state. */}
      <Box flexShrink={0} height={1} />
      <Box flexDirection="column" flexShrink={0}>
        <Box flexDirection="row" gap={1}>
          <Text color="$accent">◈</Text>
          <Small>silvercode v{SILVERCODE_VERSION}</Small>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="$accent">✻</Text>
          <Small>Claude Code v{state.claudeCodeVersion || "…"}</Small>
        </Box>
      </Box>

      {/* Context + cost — hover for details. */}
      <Box flexShrink={0} height={1} />
      <Box
        flexDirection="row"
        gap={1}
        flexShrink={0}
        onMouseEnter={ctxHover.onMouseEnter}
        onMouseLeave={ctxHover.onMouseLeave}
        backgroundColor={hoveredBg(ctxHover.isHovered)}
      >
        <Text color={ctxColor}>{ctxLabel}</Text>
        <Muted>·</Muted>
        <Muted>${state.cost.usd.toFixed(4)}</Muted>
      </Box>

      {/* Bottom — cwd + git branch, opencode style. Not interactive. */}
      <Box flexShrink={0} height={1} />
      <Box flexDirection="row" flexShrink={0}>
        <Small color="$success">{cwdLabel}</Small>
      </Box>
    </Box>
  )
}
