import React, { useMemo } from "react"
import { Box, Muted, ProgressBar, Small, Text, useHover, usePopoverHandlers } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { planLabel, type QuotaWindow, windowShortLabel } from "../claude-account.ts"
import { probeClaudeVersion } from "../claude-version.ts"
import {
  contextUtilizationColor,
  contextUtilizationLevel,
  contextUtilizationPercent,
  contextWindowFor,
} from "../context-windows.ts"
import { gitBranchFor } from "../git-branch.ts"
import { useClaudeAccount } from "../hooks/use-claude-account.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"

// Probed once at module load — the installed CLI version can't change
// mid-session. Used as a fallback until session-init arrives with the
// real version from the running subprocess.
const CLAUDE_VERSION_AT_STARTUP = probeClaudeVersion()

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

/**
 * Permission-mode display labels. Mirrors Claude Code's own status-line
 * convention (⏸ for plan, ⏵⏵ for modes that skip prompting). Bypass gets
 * ⚡ — visually distinct, signals "zap through approvals, dangerous".
 */
const MODE_LABELS: Record<string, string> = {
  plan: "⏸ plan mode on",
  "accept-edits": "⏵⏵ accept edits on",
  auto: "⏵⏵ auto mode on",
  bypass: "⚡ bypass mode on",
}

const SILVERCODE_VERSION = "0.1.0" // bump when apps/silvercode/package.json changes

/** Shorten an absolute path using `~` for display. */
function shortCwd(cwd: string): string {
  const home = process.env.HOME ?? ""
  if (home && cwd.startsWith(home)) return `~${cwd.slice(home.length)}`
  return cwd
}

/**
 * Does this window's utilization warrant a visible warning? Yellow (≥70%)
 * or red (≥90%). Used by the visibility filter for non-primary windows.
 */
function isWarningLevel(util: number): boolean {
  return util >= 70
}

/**
 * Color for a quota row. Extra usage is special: any presence of Extra
 * usage is worth flagging since it means the user is spending beyond the
 * base subscription — yellow when <90%, red at 90%+. Never grey.
 * Everything else: grey → yellow → red by threshold.
 */
function quotaColor(w: QuotaWindow): string {
  const isExtra = w.name === "Extra usage"
  if (w.utilization >= 90) return "$error"
  if (w.utilization >= 70) return "$warning"
  if (isExtra) return "$warning"
  return "$fg-muted"
}

/**
 * Decide which rows render inline in the side panel. Rules per user:
 * - 5-hour: always (primary gauge)
 * - 7-day variants: only when yellow (≥70%) or red
 * - Extra usage: only when the plan has an overage budget AND a primary
 *   window (5h / 7d) is about to run out (≥85%) — "danger of having to
 *   start using it". Lower thresholds just caused Xtra to permanently
 *   squat at the bottom of the panel regardless of whether the user was
 *   actually in danger of overage.
 * - Unknown windows: pass through (future-proof)
 *
 * The popover always renders ALL of them regardless.
 */
function filterVisibleQuotas(all: QuotaWindow[]): QuotaWindow[] {
  const primaryAboutToExhaust = all.some(
    (q) => (q.name === "5-hour" || q.name === "7-day") && q.utilization >= 85,
  )
  return all.filter((w) => {
    if (w.name === "5-hour") return true
    if (
      w.name === "7-day" ||
      w.name === "7-day (Sonnet)" ||
      w.name === "Sonnet 7-day" ||
      w.name === "7-day (Opus)" ||
      w.name === "Opus 7-day"
    ) {
      return isWarningLevel(w.utilization)
    }
    if (w.name === "Extra usage") {
      const hasBudget = typeof w.limit === "number" && w.limit > 0
      return hasBudget && primaryAboutToExhaust
    }
    return true
  })
}

/**
 * One quota row: 4-col label gutter + 20-col progress bar, so every row's
 * bar is left-aligned on the same column regardless of label width.
 * The "Xtra" label is rendered yellow (matching the bar color policy) so
 * the user notices the overage window when it shows up.
 */
function QuotaRow({ w }: { w: QuotaWindow }): React.ReactElement {
  const isExtra = w.name === "Extra usage"
  return (
    <Box flexDirection="row" gap={1}>
      <Box flexBasis={4} minWidth={4}>
        {isExtra ? (
          <Text color="$warning">{windowShortLabel(w.name)}</Text>
        ) : (
          <Muted>{windowShortLabel(w.name)}</Muted>
        )}
      </Box>
      <ProgressBar
        value={Math.max(0, Math.min(1, w.utilization / 100))}
        width={20}
        color={quotaColor(w)}
        showPercentage
      />
    </Box>
  )
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
  const ctxValue = Math.max(0, Math.min(1, totalTokens / window))

  // Account + quota probe. Email resolves synchronously from CLAUDE_CONFIG_DIR;
  // plan + per-window utilization arrive async from Anthropic's /api/usage
  // via accountly. Refreshes every 2 min.
  const account = useClaudeAccount()
  const hasAccount = account.email !== null || account.quotas.length > 0

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

  // Background shells: Bash tool calls invoked with `run_in_background: true`
  // that don't yet have a matching tool-result. Matches Claude Code's own
  // "N shells" indicator — long-running processes the user spawned and
  // didn't await.
  const shellsRunning = state.messages.reduce((n, m) => {
    const live = m.toolCalls.filter((c) => {
      if (c.name !== "Bash") return false
      const input = (c.input ?? {}) as Record<string, unknown>
      if (input.run_in_background !== true) return false
      return !m.toolResults.some((r) => r.id === c.id)
    })
    return n + live.length
  }, 0)
  const shellsTotal = state.messages.reduce((n, m) => {
    const bg = m.toolCalls.filter((c) => {
      if (c.name !== "Bash") return false
      const input = (c.input ?? {}) as Record<string, unknown>
      return input.run_in_background === true
    })
    return n + bg.length
  }, 0)

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
          <Text>ctrl-n</Text>
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
  const shellsHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column">
        <Text bold>Background shells</Text>
        <Muted>
          Bash tool calls invoked with run_in_background:true keep running after the tool call returns. Running / total
          in this session. Claude reads their output via BashOutput and kills them with KillBash.
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
  // Single hover popover for the whole quota block — plan + email at top,
  // then every window (unfiltered) with a tiny reset/credits caption per
  // row, then a session-totals footer. Compact layout: no per-row padding,
  // reset info sits next to each bar as Small text so the rows stay one
  // logical group rather than fragmented sub-blocks.
  const quotaHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column">
        <Text bold>{planLabel(account.plan)}</Text>
        {account.email && <Muted>{account.email}</Muted>}

        {account.quotas.length > 0 ? (
          <Box flexDirection="column" paddingTop={1}>
            {account.quotas.map((w) => (
              <Box key={w.name} flexDirection="column">
                <QuotaRow w={w} />
                <Box flexDirection="row" paddingLeft={5} gap={1}>
                  <Small>{w.name}</Small>
                  {w.resetsAt && (
                    <Small>
                      · resets{" "}
                      {new Date(w.resetsAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </Small>
                  )}
                  {typeof w.limit === "number" && typeof w.remaining === "number" && (
                    <Small>
                      · {w.remaining.toLocaleString()} / {w.limit.toLocaleString()}
                    </Small>
                  )}
                </Box>
              </Box>
            ))}
          </Box>
        ) : (
          <Muted>{account.loading ? "Loading quota…" : (account.error ?? "No quota data available.")}</Muted>
        )}

        <Box flexShrink={0} height={1} />
        <Text bold>This session</Text>
        <Box flexDirection="row" gap={1}>
          <Muted>context</Muted>
          <Text>
            {totalTokens.toLocaleString()} / {window.toLocaleString()} ({pct}%)
          </Text>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Muted>cost</Muted>
          <Text>${state.cost.usd.toFixed(4)}</Text>
          <Muted>
            ({state.cost.inputTokens.toLocaleString()} in / {state.cost.outputTokens.toLocaleString()} out)
          </Muted>
        </Box>
      </Box>
    ),
    maxWidth: 58,
  })

  const hoveredBg = (h: boolean): string | undefined => (h ? "$bg-surface-hover" : undefined)

  return (
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1}>
      {/* Sessions section — heading is a hover target with help. Keybinding
          hint (Ctrl+O) sits top-right as a dim reminder of how to toggle
          the panel, opencode-style. */}
      <Box flexDirection="column" flexShrink={0}>
        <Box flexDirection="row">
          <Box
            flexDirection="row"
            flexGrow={1}
            onMouseEnter={sessionsHover.onMouseEnter}
            onMouseLeave={sessionsHover.onMouseLeave}
            backgroundColor={hoveredBg(sessionsHover.isHovered)}
          >
            <SectionHeading>Sessions</SectionHeading>
          </Box>
          <Small color="$muted">ctrl-o</Small>
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

      {/* Shells — only show when there's at least one background shell
          in this session. Claude Code's own "N shells" indicator; tracks
          Bash tool calls invoked with run_in_background:true. */}
      {shellsTotal > 0 && (
        <>
          <Box flexShrink={0} height={1} />
          <Box
            flexDirection="row"
            gap={1}
            flexShrink={0}
            onMouseEnter={shellsHover.onMouseEnter}
            onMouseLeave={shellsHover.onMouseLeave}
            backgroundColor={hoveredBg(shellsHover.isHovered)}
          >
            <SectionHeading>Shells</SectionHeading>
            <Text color="$muted">
              {shellsRunning} / {shellsTotal}
            </Text>
          </Box>
        </>
      )}

      {/* Flex spacer pushes the bottom meta to the bottom of the panel. */}
      <Box flexGrow={1} />

      {/* ───── bottom meta, top to bottom ─────
          1) cwd + git branch (km:main bold)
          2) Mode (clickable, hover help, armed bg)
          3) Tokens + cost (hover details)
          4) Version block — Silver Code on / Claude Code (brand colors) */}

      {/* cwd + git branch. Full row in $fg (not muted) with `km:main` bold
          so the project + branch pop while the preceding path reads as
          normal text. Opencode-style "where am I" anchor. */}
      <Box flexDirection="row" flexShrink={0}>
        <Text color="$fg">{shortCwd(cwd).replace(/\/[^/]+$/, "/")}</Text>
        <Text bold color="$fg">
          {shortCwd(cwd).split("/").pop()}
          {branch ? `:${branch}` : ""}
        </Text>
      </Box>

      {/* Mode — clickable to cycle, hover shows help + armed bg. Renders
          the descriptive label ("Auto permissions") instead of the raw
          mode slug with a "Mode:" prefix. */}
      <Box flexShrink={0} height={1} />
      <Box
        flexDirection="row"
        flexShrink={0}
        onClick={onCycleMode}
        onMouseEnter={modeHover.onMouseEnter}
        onMouseLeave={modeHover.onMouseLeave}
        backgroundColor={hoveredBg(modeHover.isHovered)}
      >
        <Text color={modeColor} bold>
          {MODE_LABELS[mode] ?? mode}
        </Text>
      </Box>

      {/* Quota + cost block — plan (bold) then email (muted), then a
          per-window progress bar for each subscription quota.
          Visibility rules (skip rows that aren't relevant):
          - 5-hour: always shown (primary gauge)
          - 7-day / 7-day (Sonnet) / 7-day (Opus): only when yellow (≥70%)
          - Extra usage: only when the plan has an overage budget AND a
            primary window (5h / 7d) is already yellow; when shown, always
            yellow or red — never grey — because Extra usage at any level
            means the user is spending beyond the base subscription.
          Color policy for the rest: $fg-muted (neutral grey) normally,
          $warning at ≥70%, $error at ≥90%. No green — healthy bars don't
          demand attention. */}
      <Box flexShrink={0} height={1} />
      <Box
        flexDirection="column"
        flexShrink={0}
        onMouseEnter={quotaHover.onMouseEnter}
        onMouseLeave={quotaHover.onMouseLeave}
        backgroundColor={hoveredBg(quotaHover.isHovered)}
      >
        {hasAccount && (
          <Text bold color="$fg">
            {planLabel(account.plan)}
          </Text>
        )}
        {account.email && <Muted>{account.email}</Muted>}
        {account.quotas.length > 0
          ? filterVisibleQuotas(account.quotas).map((w) => <QuotaRow key={w.name} w={w} />)
          : (
              <Box flexDirection="row" gap={1}>
                <Box flexBasis={4}>
                  <Muted>ctx</Muted>
                </Box>
                <ProgressBar
                  value={ctxValue}
                  width={20}
                  color={
                    pct >= 90 ? "$error" : pct >= 70 ? "$warning" : "$fg-muted"
                  }
                  showPercentage
                />
                <Muted>${state.cost.usd.toFixed(4)}</Muted>
              </Box>
            )}
      </Box>

      {/* Version block — absolute bottom. Iconography + brand styling:
          - ◈ white diamond, "Silver" bold white, " Code" regular white,
            version white, "on" in Small (smaller typography).
          - ✻ Anthropic orange, "Claude" bold orange, " Code v…" orange. */}
      <Box flexShrink={0} height={1} />
      <Box flexDirection="column" flexShrink={0}>
        <Box flexDirection="row" gap={1}>
          <Text color="$fg">◈</Text>
          <Box flexDirection="row">
            <Text bold color="$fg">
              Silver
            </Text>
            <Text color="$fg"> Code v{SILVERCODE_VERSION} </Text>
            <Small>on</Small>
          </Box>
        </Box>
        <Box flexDirection="row" gap={1}>
          <Text color="#d97757">✻</Text>
          <Box flexDirection="row">
            <Text bold color="#d97757">
              Claude
            </Text>
            <Text color="#d97757"> Code v{state.claudeCodeVersion || CLAUDE_VERSION_AT_STARTUP || "…"}</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
