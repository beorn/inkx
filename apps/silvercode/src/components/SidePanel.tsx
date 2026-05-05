import React, { Suspense, use, useMemo, useState } from "react"
import { Box, Muted, ProgressBar, Small, Text, useHover, usePopover, usePopoverHandlers } from "silvery"
import { BackgroundPane } from "./BackgroundPane.tsx"
import type { Controller, SessionHandle } from "../controller.ts"
import { planLabel, type QuotaWindow, windowShortLabel } from "../claude-account.ts"
import { getClaudeVersion } from "../claude-version.ts"
import type { AgentCapabilities, CapabilityContext, CapabilityOption } from "../agent-capabilities.ts"
import {
  contextUtilizationColor,
  contextUtilizationLevel,
  contextUtilizationPercent,
  contextWindowFor,
  modelLabel,
} from "../context-windows.ts"
import { gitBranchFor } from "../git-branch.ts"
import { useAmbientMuteState } from "../hooks/use-ambient-stream.ts"
import { useAllAccounts } from "../hooks/use-all-accounts.ts"
import { useBackgroundTasks } from "../hooks/use-background-tasks.ts"
import { useClaudeAccount } from "../hooks/use-claude-account.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { isTransientAccountError, type AccountSummary } from "../account-status.ts"

/**
 * Claude CLI version suffix — Suspense-aware. The async probe runs once
 * per process; the first render of this component suspends on it so the
 * rest of the side-panel mounts immediately. `<Suspense>` parent supplies
 * the placeholder ("v…") until the spawn settles.
 *
 * `override` is `state.claudeCodeVersion` from the live session-init
 * event — when non-empty, it wins and no probe is awaited. Useful when
 * resume / restart hands us a session-init before the probe finishes.
 */
function ClaudeVersionSuffix({ override }: { override: string }): React.ReactElement {
  // Live session-init wins. Skip the probe entirely when it's available.
  if (override.length > 0) return <Text>{` v${override}`}</Text>
  const probed = use(getClaudeVersion())
  return <Text>{probed ? ` v${probed}` : ""}</Text>
}

/**
 * Per-agent display identity for the bottom-of-side-panel branding row.
 * `icon` is the leading glyph (✻ for Claude, etc.), `label` is the
 * vendor-name shown next to it. Versions are agent-specific:
 * - claude: probed via `claude --version` + session-init.
 * - everything else: not yet plumbed through ACP session-init events,
 *   so the row reads "<icon> <Label>" without a version suffix until
 *   ACP `_meta.agentVersion` adoption lands.
 */
const AGENT_DISPLAY: Readonly<Record<string, { icon: string; label: string }>> = {
  claude: { icon: "✻", label: "Claude Code" },
  "claude-code": { icon: "✻", label: "Claude Code" },
  "claude-code-spawn": { icon: "✻", label: "Claude Code" },
  "claude-code-sdk": { icon: "✻", label: "Claude Code" },
  codex: { icon: "○", label: "Codex" },
  "codex-spawn": { icon: "○", label: "Codex" },
  gemini: { icon: "✦", label: "Gemini" },
  "github-copilot-cli": { icon: "⊕", label: "Copilot" },
}

function agentDisplayFor(agent: string | undefined): { icon: string; label: string } {
  if (!agent) return AGENT_DISPLAY["claude"]!
  const known = AGENT_DISPLAY[agent]
  if (known) return known
  // Custom / free-form agent id — show the bare id with a neutral glyph.
  return { icon: "◆", label: agent }
}

/**
 * Right-side panel. Layout per user spec:
 *
 *   Sessions                          ← hover for help; heading has armed bg
 *     ▸ session 1                     ← click to focus, hover highlights row
 *       session 2
 *
 *   Todos   0                         ← hover for help popover
 *
 *   Agents  0/0                       ← hover for help popover
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

/**
 * Permission-mode colors. `ask` is `$muted` (grey) because it's the most
 * conservative mode — every tool prompts, so the label shouldn't demand
 * attention the way `warning`/`error` modes do. `auto` is `$success`
 * (green) because it's the silvercode default for unattended operation.
 */
export const MODE_COLORS: Record<string, string> = {
  ask: "$muted",
  plan: "$info",
  "accept-edits": "$purple",
  auto: "$warning",
  bypass: "$error",
}

/**
 * Permission-mode icons. Icon sits in the left margin (col 0) matching
 * the Silver Code / Claude Code rows; label aligns with the other text
 * after a one-col gap.
 *
 * Glyphs:
 * - `?` ask (uncertain — every tool prompts)
 * - `‖` plan (double vertical bar — stylized "paused", text-rendered,
 *        never emoji-styled; U+23F8 ⏸ gets rendered as an orange emoji
 *        button by many terminal fonts)
 * - `»` permissive modes (skip prompts: accept-edits, auto)
 * - `!` bypass (attention / danger — skips ALL approvals)
 */
export const MODE_ICONS: Record<string, string> = {
  ask: "?",
  plan: "⏸︎", // VS15 text-variant selector forces non-emoji rendering
  "accept-edits": "»",
  auto: "»",
  bypass: "!",
}
/**
 * Permission-mode labels. `ask` reads as `always ask` (matching Claude
 * Code's default-mode wording). `bypass` is `dangerously bypass on` —
 * the wording is intentionally strong because bypass skips ALL
 * approvals, including destructive ops.
 */
export const MODE_LABELS: Record<string, string> = {
  ask: "always ask",
  plan: "plan mode on",
  "accept-edits": "accept edits on",
  auto: "auto mode on",
  bypass: "dangerously bypass on",
}

/**
 * Thinking-mode icons + labels. Always shown — the default tier is
 * `normal` (Claude's unboosted baseline budget), NOT "off". Intensity
 * climbs via a filled-circle progression: empty → quarter → half → full,
 * with the token budget shown in parens so the user sees what they're
 * buying. Colors are neutral grey in the version block.
 */
export const THINKING_ICONS: Record<string, string> = {
  normal: "○",
  think: "◔",
  think_hard: "◐",
  ultrathink: "●",
}
export const THINKING_LABELS: Record<string, string> = {
  normal: "think normal",
  think: "think med (4K)",
  think_hard: "think hard (16K)",
  ultrathink: "think ultra (32K)",
}

const SILVERCODE_VERSION = "0.1.0" // bump when apps/silvercode/package.json changes

// ---------------------------------------------------------------------------
// Capability cycler helpers — descriptor-driven thinking + planning rows.
// ---------------------------------------------------------------------------

/**
 * Bullet-list row for popover option menus (Mode, Thinking).
 * Icon column is fixed-width so the description hangs under the label,
 * not under the icon, when text wraps.
 */
function PopoverOption({
  icon,
  iconColor,
  name,
  children,
}: {
  icon: string | undefined
  iconColor?: string
  name: string
  children: React.ReactNode
}): React.ReactElement {
  return (
    <Box flexDirection="row" gap={1}>
      <Box width={2} flexShrink={0}>
        <Text color={iconColor ?? "$muted"}>{icon ?? "?"}</Text>
      </Box>
      <Box flexDirection="column" flexGrow={1} minWidth={0}>
        <Text wrap="wrap">
          <Text bold color={iconColor ?? "$fg"}>
            {name}
          </Text>{" "}
          <Muted>— {children}</Muted>
        </Text>
      </Box>
    </Box>
  )
}

/** Find the descriptor whose `id` matches `selection`. Returns undefined if none. */
function findOptionFor(arr: ReadonlyArray<CapabilityOption>, selection: string): CapabilityOption | undefined {
  return arr.find((o) => o.id === selection)
}

/**
 * The "default" option per CapabilityOption convention — the one with
 * `default: true`, falling back to the first entry when no default is
 * marked. assertCapabilities() guarantees at most one default per array.
 */
function defaultOption(arr: ReadonlyArray<CapabilityOption>): CapabilityOption {
  const flagged = arr.find((o) => o.default === true)
  return flagged ?? arr[0]!
}

/** Advance to the next option by id, wrapping at the end. */
function nextOption(arr: ReadonlyArray<CapabilityOption>, currentId: string): CapabilityOption {
  const i = arr.findIndex((o) => o.id === currentId)
  if (i < 0) return arr[0]!
  return arr[(i + 1) % arr.length]!
}

/** Build the CapabilityContext that's handed to `option.activate(ctx)`. */
function makeCtx(
  controller: Controller,
  sessionId: string,
  setThinking: ((next: string) => void) | undefined,
  setMode: ((next: string) => void) | undefined,
): CapabilityContext {
  return {
    controller,
    sessionId,
    setThinking: setThinking ?? (() => {}),
    setMode: setMode ?? (() => {}),
  }
}

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

function isPrimaryQuotaWindow(name: string): boolean {
  return (
    name === "5-hour" ||
    name === "7-day" ||
    name === "7-day (Sonnet)" ||
    name === "Sonnet 7-day" ||
    name === "7-day (Opus)" ||
    name === "Opus 7-day"
  )
}

function isRateLimitWindow(name: string): boolean {
  return name === "RPM" || name === "TPM" || name === "Input TPM" || name === "Output TPM"
}

/**
 * Color for a quota row. Extra usage is special: any presence of Extra
 * usage is worth flagging since it means the user is spending beyond the
 * base subscription — yellow when <90%, red at 90%+. Never grey.
 * Everything else: grey → yellow → red by threshold.
 */
function quotaColor(w: QuotaWindow): string {
  const isExtra = w.name === "Xtra"
  if (w.utilization >= 90) return "$error"
  if (w.utilization >= 70) return "$warning"
  if (isExtra) return "$warning"
  return "$fg-muted"
}

/**
 * Decide which rows render inline in the side panel. Rules per user:
 * - 5-hour: always (primary gauge)
 * - 7-day variants: only when yellow (≥70%) or red
 * - API rate limits: only when yellow (≥70%) or red
 * - Extra usage: only when the plan has an overage budget AND a primary
 *   window (5h / 7d) is already yellow (≥70%) — "soon to be used". If
 *   nothing's yellow yet, Xtra stays hidden.
 * - Unknown windows: pass through (future-proof)
 *
 * The popover always renders ALL of them regardless.
 */
function filterVisibleQuotas(all: QuotaWindow[]): QuotaWindow[] {
  const primaryYellow = all.some((q) => isPrimaryQuotaWindow(q.name) && isWarningLevel(q.utilization))
  return all.filter((w) => {
    if (w.name === "5-hour") return true
    if (isPrimaryQuotaWindow(w.name)) {
      return isWarningLevel(w.utilization)
    }
    if (w.name === "Xtra") {
      const hasBudget = typeof w.limit === "number" && w.limit > 0
      return hasBudget && primaryYellow
    }
    if (isRateLimitWindow(w.name)) return isWarningLevel(w.utilization)
    return true
  })
}

/**
 * One quota row: 4-col label gutter + 20-col progress bar, so every row's
 * bar is left-aligned on the same column regardless of label width.
 * The "Xtra" label is rendered yellow (matching the bar color policy) so
 * the user notices the overage window when it shows up.
 */
function QuotaRow({ w, muted = false }: { w: QuotaWindow; muted?: boolean }): React.ReactElement {
  const isExtra = w.name === "Xtra"
  const color = muted ? "$muted" : quotaColor(w)
  return (
    <Box flexDirection="row" gap={1}>
      <Box flexBasis={4} minWidth={4}>
        {isExtra && !muted ? (
          <Text color="$warning">{windowShortLabel(w.name)}</Text>
        ) : (
          <Muted>{windowShortLabel(w.name)}</Muted>
        )}
      </Box>
      <ProgressBar value={Math.max(0, Math.min(1, w.utilization / 100))} width={20} color={color} showPercentage />
    </Box>
  )
}

function quotaAmount(w: QuotaWindow): string | null {
  if (typeof w.limit === "number" && typeof w.remaining === "number") {
    return `${w.remaining.toLocaleString()} / ${w.limit.toLocaleString()}`
  }
  if (typeof w.remaining === "number") return `${w.remaining.toLocaleString()} left`
  if (typeof w.limit === "number") return `${w.limit.toLocaleString()} limit`
  return null
}

function resetLabel(raw: string | undefined): string | null {
  if (!raw) return null
  const date = new Date(raw)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
}

function accountDisplayName(account: AccountSummary): string {
  return account.email ?? account.name
}

function accountDetailLines(account: AccountSummary, exclude: ReadonlySet<string> = new Set()): string[] {
  const details: string[] = []
  const add = (detail: string | undefined): void => {
    if (detail && !exclude.has(detail)) details.push(detail)
  }
  add(account.email && account.email !== account.name ? account.email : undefined)
  add(account.sourceEnvVar)
  add(account.credentialHint)
  add(account.metadata?.apiKeyName ? `key ${account.metadata.apiKeyName}` : undefined)
  add(account.metadata?.createdAt ? `created ${new Date(account.metadata.createdAt).toLocaleDateString()}` : undefined)
  add(account.dir)
  add(account.current ? "current" : undefined)
  add(account.default ? "default" : undefined)
  add(account.stock ? "stock" : undefined)
  add(account.authenticated === false ? "missing login" : undefined)
  return details
}

function hasAccountPopoverDetails(account: AccountSummary): boolean {
  return account.quotas.length > 0 || accountDetailLines(account, inlineAccountDetails(account)).length > 0
}

function inlineAccountDetails(account: AccountSummary): ReadonlySet<string> {
  const inline = new Set<string>()
  if (account.kind === "api-key") {
    if (account.sourceEnvVar) inline.add(account.sourceEnvVar)
    if (account.credentialHint) inline.add(account.credentialHint)
  }
  return inline
}

function groupAccountsByPlan(accounts: AccountSummary[]): Array<{ label: string; accounts: AccountSummary[] }> {
  const groups: Array<{ label: string; accounts: AccountSummary[] }> = []
  for (const account of accounts) {
    const label = account.kind === "api-key" ? account.label : planLabel(account.plan)
    const existing = groups.find((g) => g.label === label)
    if (existing) existing.accounts.push(account)
    else groups.push({ label, accounts: [account] })
  }
  return groups
}

function selectedAccountForAgent(accounts: AccountSummary[], agent: string | undefined): AccountSummary | null {
  if (accounts.length === 0) return null
  const id = agent ?? "claude"
  if (id === "codex" || id === "codex-spawn") {
    return accounts.find((a) => a.provider === "openai" || a.label === "Codex") ?? accounts.find((a) => a.current) ?? accounts[0]!
  }
  if (id === "github-copilot-cli") {
    return accounts.find((a) => /copilot/i.test(a.label) || /copilot/i.test(String(a.provider))) ?? accounts[0]!
  }
  if (id === "gemini") {
    return accounts.find((a) => /gemini/i.test(a.label) || /google/i.test(String(a.provider))) ?? accounts[0]!
  }
  return (
    accounts.find((a) => a.current && a.provider === "claude-oauth") ??
    accounts.find((a) => a.provider === "claude-oauth") ??
    accounts.find((a) => a.current) ??
    accounts[0]!
  )
}

type ActiveAccountProbe = ReturnType<typeof useClaudeAccount>

function accountSummaryFromActiveProbe(account: ActiveAccountProbe): AccountSummary | null {
  if (account.email === null && account.quotas.length === 0 && !account.loading && !account.error) return null
  return {
    kind: "claude-profile",
    name: account.email ?? "active",
    label: "Claude Code",
    provider: "claude-oauth",
    email: account.email,
    plan: account.plan,
    quotas: account.quotas,
    error: account.error,
    current: true,
    isActive: true,
    loading: account.loading,
  }
}

function shouldUseActiveProbeForAllAccountsRow(row: AccountSummary, active: AccountSummary): boolean {
  if (row.provider !== "claude-oauth" || !row.current) return false
  if (active.provider !== "claude-oauth" || !active.current) return false
  if (active.error !== null || active.quotas.length === 0) return false
  return row.quotas.length === 0 && isTransientAccountError(row.error)
}

function mergeActiveProbeIntoAccounts(allAccounts: AccountSummary[], active: AccountSummary | null): AccountSummary[] {
  if (!active) return allAccounts
  if (allAccounts.length === 0) return [active]
  let sawCurrentClaude = false
  const merged = allAccounts.map((row) => {
    if (row.provider === "claude-oauth" && row.current) {
      sawCurrentClaude = true
      if (shouldUseActiveProbeForAllAccountsRow(row, active)) {
        return {
          ...active,
          name: row.name,
          dir: row.dir,
          default: row.default,
          stock: row.stock,
          authenticated: row.authenticated,
          available: active.available ?? row.available,
        }
      }
    }
    return row
  })
  return sawCurrentClaude ? merged : [active, ...merged]
}

function AccountPanel({
  account,
  onShowAllAccounts,
}: {
  account: AccountSummary
  onShowAllAccounts?: () => void
}): React.ReactElement {
  const active = account.isActive
  const visibleQuotas = filterVisibleQuotas(account.quotas)
  const hasPopover = hasAccountPopoverDetails(account)
  const popover = usePopoverHandlers({
    body: <AccountPopover account={account} onShowAllAccounts={onShowAllAccounts} />,
    maxWidth: 64,
  })
  return (
    <Box
      flexDirection="column"
      flexShrink={0}
      onMouseEnter={hasPopover ? popover.onMouseEnter : undefined}
      onMouseLeave={hasPopover ? popover.onMouseLeave : undefined}
      backgroundColor={hasPopover && popover.isHovered ? "$bg-surface-hover" : undefined}
    >
      <Text bold={active} color={active ? "$fg" : "$muted"}>
        {accountDisplayName(account)}
      </Text>
      {account.loading ? (
        <Muted>Loading quota...</Muted>
      ) : account.error ? (
        <Muted>{account.error}</Muted>
      ) : account.kind === "api-key" ? (
        <Muted>{[account.sourceEnvVar, account.credentialHint].filter(Boolean).join(" ")}</Muted>
      ) : null}
      {visibleQuotas.length > 0 ? (
        <Box flexDirection="column">
          {visibleQuotas.map((w) => (
            <QuotaRow key={w.name} w={w} muted={!active} />
          ))}
        </Box>
      ) : null}
    </Box>
  )
}

function AccountNavButton({ label, onClick }: { label: string; onClick: () => void }): React.ReactElement {
  const hover = useHover()
  const popover = usePopover()
  const armed = hover.isHovered
  return (
    <Box
      flexDirection="row"
      alignSelf="flex-start"
      backgroundColor={armed ? "$warning" : "$bg-inverse"}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
      onClick={() => {
        popover?.hide({ immediate: true })
        onClick()
      }}
    >
      <Text color={armed ? "$bg" : "$fg-on-inverse"}> {label} </Text>
    </Box>
  )
}

function AccountDetailLines({
  account,
  exclude = new Set(),
}: {
  account: AccountSummary
  exclude?: ReadonlySet<string>
}): React.ReactElement {
  const details = accountDetailLines(account, exclude)
  return (
    <Box flexDirection="column">
      {details.map((detail) => (
        <Muted key={detail}>{detail}</Muted>
      ))}
    </Box>
  )
}

function AccountPopover({
  account,
  onShowAllAccounts,
}: {
  account: AccountSummary
  onShowAllAccounts?: () => void
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Text bold>{accountDisplayName(account)}</Text>
      <AccountDetailLines account={account} exclude={inlineAccountDetails(account)} />
      {account.quotas.length > 0 ? (
        <Box flexDirection="column">
          {account.quotas.map((w) => (
            <Box key={w.name} flexDirection="column">
              <QuotaPopoverRow w={w} />
            </Box>
          ))}
        </Box>
      ) : account.loading || account.error ? (
        <Muted>{account.loading ? "Loading quota..." : account.error}</Muted>
      ) : null}
      {onShowAllAccounts ? (
        <>
          <Box flexShrink={0} height={1} />
          <AccountNavButton label="All Accounts" onClick={onShowAllAccounts} />
          <Box flexShrink={0} height={1} />
        </>
      ) : null}
    </Box>
  )
}

function AccountGroup({
  label,
  accounts,
  onShowAllAccounts,
}: {
  label: string
  accounts: AccountSummary[]
  onShowAllAccounts?: () => void
}): React.ReactElement {
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Text bold color="$fg">
        {label}
      </Text>
      {accounts.map((account, i) => (
        <React.Fragment key={account.name}>
          <AccountPanel account={account} onShowAllAccounts={onShowAllAccounts} />
          {i < accounts.length - 1 ? <Box flexShrink={0} height={1} /> : null}
        </React.Fragment>
      ))}
    </Box>
  )
}

/**
 * Popover-only quota row: full quota name as primary label, progress bar
 * underneath, optional reset / remaining annotations beside the bar. Used
 * in the account-quota popover where horizontal space allows the full
 * name (`5-hour`, `Sonnet 7-day`, `Xtra`) instead of the abbreviated form
 * (`5hr` / `7ds`) used in the compact inline panel.
 */
function QuotaPopoverRow({ w }: { w: QuotaWindow }): React.ReactElement {
  const isExtra = w.name === "Xtra"
  const amount = quotaAmount(w)
  const reset = resetLabel(w.resetsAt)
  return (
    <Box flexDirection="row" gap={1}>
      <Box width={4} flexShrink={0}>
        {isExtra ? <Text color="$warning">{windowShortLabel(w.name)}</Text> : <Muted>{windowShortLabel(w.name)}</Muted>}
      </Box>
      <ProgressBar
        value={Math.max(0, Math.min(1, w.utilization / 100))}
        width={14}
        color={quotaColor(w)}
        showPercentage
      />
      <Box flexDirection="column" flexGrow={1} minWidth={0}>
        {amount ? <Small>{amount}</Small> : null}
        {reset ? <Small>resets {reset}</Small> : null}
      </Box>
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
 * Known ambient sources surfaced in the side panel. Mirrors the design
 * doc's source taxonomy. Sources beyond this list still get muted via
 * `controller.ambientMuteState.toggle(...)` if a future bead surfaces
 * them programmatically; this constant just controls what the side
 * panel offers as toggle rows.
 */
const AMBIENT_SOURCES: ReadonlyArray<{ id: string; label: string }> = [
  { id: "tribe", label: "tribe" },
  { id: "ci", label: "CI" },
  { id: "recall", label: "recall" },
  { id: "sub-agent", label: "sub-agent" },
  { id: "filewatch", label: "file-watch" },
  { id: "telegram", label: "telegram" },
]

/**
 * AmbientMuteRow — one toggle row for a single ambient source. Shows a
 * `☐` / `☑︎` checkbox marker plus the source label. Hover arms a brighter
 * background and surfaces a help popover; click toggles the mute.
 */
function AmbientMuteRow({
  source,
  label,
  isMuted,
  onToggle,
}: {
  source: string
  label: string
  isMuted: boolean
  onToggle: () => void
}): React.ReactElement {
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  const popover = usePopoverHandlers({
    body: (
      <Box flexDirection="column" gap={1}>
        <Text bold>Mute {label}</Text>
        <Muted>
          Hides {label} ambient rows from this chat scrollback. The agent still receives the events — this is a visual
          filter only.
        </Muted>
      </Box>
    ),
    maxWidth: 56,
  })
  return (
    <Box
      flexDirection="row"
      gap={1}
      flexShrink={0}
      onClick={onToggle}
      onMouseEnter={(e) => {
        onMouseEnter(e)
        popover.onMouseEnter(e)
      }}
      onMouseLeave={(e) => {
        onMouseLeave(e)
        popover.onMouseLeave(e)
      }}
      backgroundColor={isHovered ? "$bg-surface-hover" : undefined}
    >
      <Text color={isMuted ? "$muted" : "$fg"}>{isMuted ? "☐" : "☑︎"}</Text>
      <Text color={isMuted ? "$muted" : "$fg"}>{label}</Text>
      {/* Use the source key as a hidden accessibility hint via popover only;
          the visible label is the human-readable form. */}
      <Box flexBasis={0} minWidth={0}>
        <Small>{source === label ? "" : ""}</Small>
      </Box>
    </Box>
  )
}

/**
 * AmbientMuteSection — heading + per-source mute rows. Heading hover
 * popover spells out the structural guarantee that mute is UI-only.
 */
function AmbientMuteSection({ controller }: { controller: Controller }): React.ReactElement {
  const muted = useAmbientMuteState(controller)
  const headingHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column" gap={1}>
        <Text bold>Ambient</Text>
        <Muted>
          Ambient observations (tribe broadcasts, CI status, recall hits, sub-agent updates, file changes, telegram
          messages) flow into the agent's context automatically and render inline in the chat scrollback.
        </Muted>
        <Muted>
          Toggling a source mutes its inline rows for this view only. The agent still receives every event regardless of
          mute state.
        </Muted>
      </Box>
    ),
    maxWidth: 60,
  })
  const { isHovered, onMouseEnter, onMouseLeave } = useHover()
  return (
    <Box flexDirection="column" flexShrink={0}>
      <Box
        flexDirection="row"
        flexShrink={0}
        onMouseEnter={(e) => {
          onMouseEnter(e)
          headingHover.onMouseEnter(e)
        }}
        onMouseLeave={(e) => {
          onMouseLeave(e)
          headingHover.onMouseLeave(e)
        }}
        backgroundColor={isHovered ? "$bg-surface-hover" : undefined}
      >
        <SectionHeading>Ambient</SectionHeading>
      </Box>
      {AMBIENT_SOURCES.map((s) => (
        <AmbientMuteRow
          key={s.id}
          source={s.id}
          label={s.label}
          isMuted={muted.has(s.id)}
          onToggle={() => controller.ambientMuteState.toggle(s.id)}
        />
      ))}
    </Box>
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
  const sid = handle.session.sessionId
  // The session id IS the row identifier — no name/label/arrow chrome.
  // Pre-resolve sessions show "pending" until the spawn microtask lands the id.
  const label = typeof sid === "string" && sid !== "pending" ? sid : "pending"
  return (
    <Box
      flexDirection="row"
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      backgroundColor={isHovered ? "$bg-surface-hover" : undefined}
    >
      <Text color={isFocused ? undefined : "$muted"}>{label}</Text>
    </Box>
  )
}

/**
 * SidePanel — public entry point. Renders even before the first session
 * spawns (focused === undefined) so the user sees structure immediately
 * instead of a blank screen during the spawn microtask. The two paths share
 * an identical visual contract; FocusedSidePanel layers session-derived
 * signals (model, cost, todos, agents, shells, background) on top of the
 * EmptySidePanel skeleton.
 *
 * Bead: km-silvercode.sidepanel-skeleton-mount.
 */
export function SidePanel(props: SidePanelProps): React.ReactElement {
  if (props.focused) {
    return <FocusedSidePanel {...props} focused={props.focused} />
  }
  return <EmptySidePanel {...props} />
}

type SidePanelProps = {
  /**
   * The session whose state drives the per-session signals. Undefined
   * during the brief startup window before the initial spawn microtask
   * lands the first SessionHandle — SidePanel renders skeleton chrome
   * (sessions list, branding, account, mode, cwd) in that case.
   */
  focused: SessionHandle | undefined
  sessions: SessionHandle[]
  focusedSessionId: string
  onFocusSession: (id: string) => void
  mode: string
  onCycleMode: () => void
  cwd: string
  controller: Controller
  /** Current thinking mode ("" = normal). Set by App.tsx intercepting /think family. */
  thinking?: string
  /** Cycle thinking: normal → think → think_hard → ultrathink → normal. */
  onCycleThinking?: () => void
  /**
   * Active agent id — drives the bottom branding row (icon + label).
   * Undefined falls back to claude-code defaults. Set from
   * `App.props.agent` which originates in `--agent` / config / built-in
   * fallback (`claude-code`).
   */
  agent?: string
  /**
   * Per-agent capability descriptors. When set, the thinking + planning
   * rows render from these arrays (icon / color / name / description /
   * activate from the descriptor) instead of the hard-coded Claude
   * vocabulary. Agents without a given capability hide that row.
   */
  capabilities?: AgentCapabilities
  /** Set the thinking selection — wired through option.activate(ctx). */
  setThinking?: (next: string) => void
  /** Set the planning / permission-mode selection — wired through option.activate(ctx). */
  setMode?: (next: string) => void
  /**
   * Fallback model id to show under the agent label when session-init
   * hasn't (yet) populated `state.model`. Sourced from
   * BUILTIN_AGENTS[agent].defaultModel by App.tsx — safe stand-in for
   * agents whose ACP session-init lifecycle doesn't carry a model field.
   */
  defaultModel?: string
}

/**
 * Skeleton variant. Mounted before the first SessionHandle exists so the
 * user sees the panel's structure immediately. Identical chrome to the
 * focused variant but per-session counters render as 0 / pending and the
 * sessions list is empty.
 */
function EmptySidePanel({
  sessions,
  focusedSessionId,
  onFocusSession,
  mode,
  onCycleMode,
  cwd,
  controller,
  thinking,
  onCycleThinking,
  agent,
  capabilities,
  setThinking,
  setMode,
  defaultModel,
}: SidePanelProps): React.ReactElement {
  return (
    <SidePanelChrome
      focusedId=""
      state={null}
      sessions={sessions}
      focusedSessionId={focusedSessionId}
      onFocusSession={onFocusSession}
      mode={mode}
      onCycleMode={onCycleMode}
      cwd={cwd}
      controller={controller}
      thinking={thinking}
      onCycleThinking={onCycleThinking}
      agent={agent}
      capabilities={capabilities}
      setThinking={setThinking}
      setMode={setMode}
      defaultModel={defaultModel}
      backgroundTasks={EMPTY_BACKGROUND_TASKS}
    />
  )
}

const EMPTY_BACKGROUND_TASKS: ReadonlyArray<never> = []

/**
 * Focused variant — wires per-session signals (state + background tasks)
 * and delegates to SidePanelChrome. The hooks live here so they only run
 * when there's an actual session to subscribe to.
 */
function FocusedSidePanel({ focused, ...rest }: SidePanelProps & { focused: SessionHandle }): React.ReactElement {
  const state = useStoreSignal(focused.store)
  const backgroundTasks = useBackgroundTasks(rest.controller, focused.id)
  return <SidePanelChrome {...rest} focusedId={focused.id} state={state} backgroundTasks={backgroundTasks} />
}

type SidePanelChromeProps = Omit<SidePanelProps, "focused"> & {
  /** Empty string when no focused session — disables click-to-cycle ctx. */
  focusedId: string
  /** Null when no focused session. */
  state: import("@km/agent-harness").SessionState | null
  backgroundTasks: ReadonlyArray<import("../controller.ts").BackgroundTask>
}

function SidePanelChrome({
  focusedId,
  state,
  backgroundTasks,
  sessions,
  focusedSessionId,
  onFocusSession,
  mode,
  onCycleMode,
  cwd,
  controller,
  thinking,
  onCycleThinking,
  agent,
  capabilities,
  setThinking,
  setMode,
  defaultModel,
}: SidePanelChromeProps): React.ReactElement {
  const [accountView, setAccountView] = useState<"selected" | "all">("selected")
  const modeColor = MODE_COLORS[mode] ?? "$muted"
  const modeIcon = MODE_ICONS[mode] ?? "?"
  const modeLabel = MODE_LABELS[mode] ?? mode
  // Per-session signals collapse to neutral defaults when no focused session
  // exists yet (initial-spawn window). The skeleton render shows 0 / pending
  // for everything, identical to a fresh session at status="idle".
  const cost = state?.cost ?? { inputTokens: 0, outputTokens: 0, usd: 0 }
  const totalTokens = cost.inputTokens + cost.outputTokens
  const model = state?.model ?? ""
  const window = contextWindowFor(model)
  const pct = contextUtilizationPercent(totalTokens, window)
  const ctxColor = contextUtilizationColor(contextUtilizationLevel(pct))
  const ctxValue = Math.max(0, Math.min(1, totalTokens / window))
  const claudeCodeVersion = state?.claudeCodeVersion ?? ""
  const todos = state?.todos ?? []
  const messages = state?.messages ?? []

  // Account + quota probe. Email resolves synchronously from CLAUDE_CONFIG_DIR;
  // plan + per-window utilization arrive async from Anthropic's /api/usage
  // via accountly. Refreshes every 2 min.
  const account = useClaudeAccount()
  const allAccounts = useAllAccounts()
  const activeAccount = accountSummaryFromActiveProbe(account)
  const accounts: AccountSummary[] = mergeActiveProbeIntoAccounts(allAccounts, activeAccount)
  const hasAccount = accounts.length > 0
  const selectedAccount = selectedAccountForAgent(accounts, agent)
  const selectedAccountGroups = selectedAccount ? groupAccountsByPlan([selectedAccount]) : []
  const accountGroups = groupAccountsByPlan(accounts)

  const todosCount = todos.length
  const agentsTotal = messages.reduce(
    (n, m) => n + m.toolCalls.filter((c) => c.name === "Task" || c.name === "Agent").length,
    0,
  )
  const agentsRunning = messages.reduce(
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
  const shellsRunning = messages.reduce((n, m) => {
    const live = m.toolCalls.filter((c) => {
      if (c.name !== "Bash") return false
      const input = (c.input ?? {}) as Record<string, unknown>
      if (input.run_in_background !== true) return false
      return !m.toolResults.some((r) => r.id === c.id)
    })
    return n + live.length
  }, 0)
  const shellsTotal = messages.reduce((n, m) => {
    const bg = m.toolCalls.filter((c) => {
      if (c.name !== "Bash") return false
      const input = (c.input ?? {}) as Record<string, unknown>
      return input.run_in_background === true
    })
    return n + bg.length
  }, 0)

  // Background tasks (Ctrl-B): backgrounded turns for this session. Total =
  // every task in the session's history (running + terminal); running =
  // those still streaming. The Background row only renders when total > 0.
  const bgRunning = backgroundTasks.filter((t) => t.status === "running").length
  const bgTotal = backgroundTasks.length

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
        {todos.length > 0 ? (
          todos.map((t, i) => (
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
  // Background tasks (Ctrl-B). The popover shows the live BackgroundPane so
  // the user can cancel / foreground without leaving the SidePanel hover.
  const backgroundHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column" gap={1}>
        <Text bold>Background tasks</Text>
        <Muted>
          Press <Text>Ctrl-B</Text> during a running turn to push it into the background. The turn keeps streaming; when
          it completes, the result lands in the conversation as a system message.
        </Muted>
        <BackgroundPane
          tasks={backgroundTasks}
          onCancel={(id) => focusedId && controller.cancelBackgroundTask(focusedId, id)}
          onForeground={(id) => focusedId && controller.foregroundTask(focusedId, id)}
        />
      </Box>
    ),
    maxWidth: 64,
  })
  // Mode popover body — descriptor-driven when capabilities are set,
  // legacy Claude-mode help otherwise. Lists every option with its
  // icon/color/description so the user sees the full menu the agent
  // exposes (codex has plan/normal; Claude has ask/plan/accept-edits/auto/bypass).
  const modeHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column" gap={1}>
        <Text bold>Mode</Text>
        <Muted>Controls what the agent is allowed to do without asking. Click the label to cycle.</Muted>
        <Box flexDirection="column" gap={1}>
          {capabilities?.planning && capabilities.planning.length > 0 ? (
            capabilities.planning.map((opt) => (
              <Box key={opt.id} flexDirection="row" gap={1}>
                <Box width={2} flexShrink={0}>
                  <Text color={opt.color ?? "$muted"}>{opt.icon}</Text>
                </Box>
                <Box flexDirection="column" flexGrow={1} minWidth={0}>
                  <Text wrap="wrap">
                    <Text bold color={opt.color ?? "$fg"}>
                      {opt.name}
                    </Text>{" "}
                    <Muted>— {opt.description}</Muted>
                  </Text>
                </Box>
              </Box>
            ))
          ) : (
            <>
              <PopoverOption icon={MODE_ICONS.ask} iconColor={MODE_COLORS.ask} name="ask">
                every tool prompts for approval
              </PopoverOption>
              <PopoverOption icon={MODE_ICONS.plan} iconColor={MODE_COLORS.plan} name="plan">
                plans but doesn't write
              </PopoverOption>
              <PopoverOption
                icon={MODE_ICONS["accept-edits"]}
                iconColor={MODE_COLORS["accept-edits"]}
                name="accept-edits"
              >
                edits auto-apply; tools still prompt
              </PopoverOption>
              <PopoverOption icon={MODE_ICONS.auto} iconColor={MODE_COLORS.auto} name="auto">
                default; all Claude tools unattended
              </PopoverOption>
              <PopoverOption icon={MODE_ICONS.bypass} iconColor={MODE_COLORS.bypass} name="bypass">
                skip all approvals (sandboxes only)
              </PopoverOption>
            </>
          )}
        </Box>
      </Box>
    ),
    maxWidth: 72,
  })
  const thinkingHover = usePopoverHandlers({
    body: (
      <Box flexDirection="column" gap={1}>
        <Text bold>Thinking</Text>
        <Muted>
          Reasoning intensity for the agent. Higher = more thorough answers, more tokens spent. Click to cycle.
        </Muted>
        <Box flexDirection="column" gap={1}>
          {capabilities?.thinking && capabilities.thinking.length > 0 ? (
            capabilities.thinking.map((opt) => (
              <Box key={opt.id} flexDirection="row" gap={1}>
                <Box width={2} flexShrink={0}>
                  <Text color={opt.color ?? "$muted"}>{opt.icon}</Text>
                </Box>
                <Box flexDirection="column" flexGrow={1} minWidth={0}>
                  <Text wrap="wrap">
                    <Text bold color={opt.color ?? "$fg"}>
                      {opt.name}
                    </Text>{" "}
                    <Muted>— {opt.description}</Muted>
                  </Text>
                </Box>
              </Box>
            ))
          ) : (
            <>
              <PopoverOption icon={THINKING_ICONS.normal} name="normal">
                agent baseline (no extended thinking)
              </PopoverOption>
              <PopoverOption icon={THINKING_ICONS.think} name="think (4K)">
                moderate reasoning budget
              </PopoverOption>
              <PopoverOption icon={THINKING_ICONS.think_hard} name="hard (16K)">
                deep reasoning
              </PopoverOption>
              <PopoverOption icon={THINKING_ICONS.ultrathink} name="ultra (32K)">
                max budget
              </PopoverOption>
            </>
          )}
        </Box>
      </Box>
    ),
    maxWidth: 72,
  })
  const hoveredBg = (h: boolean): string | undefined => (h ? "$bg-surface-hover" : undefined)

  return (
    // `userSelect="contain"` scopes drag-selection to the side panel —
    // drags starting here can't extend into the card area.
    <Box flexDirection="column" flexGrow={1} paddingX={2} paddingY={1} userSelect="contain">
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
          {agentsRunning}/{agentsTotal}
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
              {shellsRunning}/{shellsTotal}
            </Text>
          </Box>
        </>
      )}

      {/* Ambient — per-source mute toggles for the inline observation
          rows in the chat scrollback. Mute hides matching rows from the
          inline view but does NOT prevent the agent from receiving the
          events. The agent still sees every ambient observation; this
          is a visual filter only. See
          hub/silvercode/design/ambient-inline-display.md. */}
      <Box flexShrink={0} height={1} />
      <AmbientMuteSection controller={controller} />

      {/* Background tasks — Ctrl-B during a running turn pushes the in-flight
          turn into the background so the user can keep typing. The row only
          shows once at least one task exists in this session. The "running /
          total" pattern matches Agents/Shells above. */}
      {bgTotal > 0 && (
        <>
          <Box flexShrink={0} height={1} />
          <Box
            flexDirection="row"
            gap={1}
            flexShrink={0}
            onMouseEnter={backgroundHover.onMouseEnter}
            onMouseLeave={backgroundHover.onMouseLeave}
            backgroundColor={hoveredBg(backgroundHover.isHovered)}
          >
            <SectionHeading>Background</SectionHeading>
            <Text color="$muted">
              {bgRunning}/{bgTotal}
            </Text>
          </Box>
        </>
      )}

      {/* Flex spacer pushes the bottom meta to the bottom of the panel. */}
      <Box flexGrow={1} />

      {/* ───── bottom meta, top to bottom ─────
          1) accounts + quotas
          2) cwd + git branch (km:main bold)
          3) Version block — Silver Code on / active agent
          4) Thinking + mode controls */}

      {/* Account quota block — plan (bold) then email (muted), then a
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
      <Box flexDirection="column" flexShrink={0}>
        {hasAccount && accountView === "all" ? (
          <>
            {accountGroups.map((group, i) => (
              <React.Fragment key={group.label}>
                {i > 0 ? <Box flexShrink={0} height={1} /> : null}
                <AccountGroup label={group.label} accounts={group.accounts} />
              </React.Fragment>
            ))}
            <Box flexShrink={0} height={1} />
            <AccountNavButton label="< Back" onClick={() => setAccountView("selected")} />
            <Box flexShrink={0} height={1} />
          </>
        ) : hasAccount && selectedAccountGroups.length > 0 ? (
          selectedAccountGroups.map((group, i) => (
            <React.Fragment key={group.label}>
              {i > 0 ? <Box flexShrink={0} height={1} /> : null}
              <AccountGroup
                label={group.label}
                accounts={group.accounts}
                onShowAllAccounts={accounts.length > 1 ? () => setAccountView("all") : undefined}
              />
            </React.Fragment>
          ))
        ) : totalTokens > 0 || cost.usd > 0 ? (
          // Only show the local ctx fallback bar when we have actual data to
          // display. An empty 0% / $0.0000 bar is worse than no bar — it
          // makes the user think the account is misconfigured.
          <Box flexDirection="row" gap={1}>
            <Box flexBasis={4}>
              <Muted>ctx</Muted>
            </Box>
            <ProgressBar
              value={ctxValue}
              width={20}
              color={pct >= 90 ? "$error" : pct >= 70 ? "$warning" : "$fg-muted"}
              showPercentage
            />
            <Muted>${cost.usd.toFixed(4)}</Muted>
          </Box>
        ) : null}
      </Box>

      {/* cwd + git branch. Path in $fg, project name bold, `:branch`
          portion muted so the branch reads as a secondary annotation
          rather than competing with the project name for emphasis.
          Opencode-style "where am I" anchor. */}
      <Box flexShrink={0} height={1} />
      <Box flexDirection="row" flexShrink={0}>
        <Text color="$fg">{shortCwd(cwd).replace(/\/[^/]+$/, "/")}</Text>
        <Text bold color="$fg">
          {shortCwd(cwd).split("/").pop()}
        </Text>
        {branch ? <Text color="$muted">:{branch}</Text> : null}
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
        {(() => {
          const id = agent ?? "claude"
          const { icon, label } = agentDisplayFor(id)
          // Version suffix is claude-code-only until other agents surface
          // their version via ACP session-init `_meta.agentVersion`. The
          // probe + session-init values are both Claude-CLI-shaped so
          // gating on the agent id keeps the row honest for codex /
          // gemini / copilot rather than showing a stale Claude version.
          const isClaudeAgent = id === "claude" || id === "claude-code" || id === "claude-code-spawn"
          // Model + agent share one wrappable row: model stays inline if it
          // fits, wraps to next line aligned under the label otherwise. The
          // model name is one Text node so flex treats it as an indivisible
          // unit and won't break it mid-token. paddingLeft={2} on the inner
          // Box puts the wrap point at column 2 — same column as the label,
          // so the wrapped model lines up with "Codex" rather than the icon.
          const displayModel = model || defaultModel || ""
          return (
            <Box flexDirection="row" gap={1}>
              <Text color="$fg">{icon}</Text>
              <Box flexDirection="row" flexWrap="wrap" gap={1}>
                <Text bold color="$fg">
                  {label}
                  {isClaudeAgent ? (
                    <Suspense fallback={<Text>{" v…"}</Text>}>
                      <ClaudeVersionSuffix override={claudeCodeVersion} />
                    </Suspense>
                  ) : null}
                </Text>
                {displayModel ? <Text color="$fg">{modelLabel(displayModel)}</Text> : null}
              </Box>
            </Box>
          )
        })()}
        {/* Thinking row — descriptor-driven. Hidden when the active agent
            doesn't expose a thinking capability (e.g. copilot today).
            Falls back to the legacy Claude-only THINKING_ICONS path
            when descriptors aren't passed (tests + transition). */}
        {(() => {
          const arr = capabilities?.thinking
          if (arr && arr.length > 0) {
            const current = findOptionFor(arr, thinking ?? "") ?? defaultOption(arr)
            const onClick = (): void => {
              const next = nextOption(arr, current.id)
              const ctx = makeCtx(controller, focusedId, setThinking, setMode)
              void next.activate(ctx)
            }
            return (
              <Box
                flexDirection="row"
                gap={1}
                flexShrink={0}
                onClick={onClick}
                onMouseEnter={thinkingHover.onMouseEnter}
                onMouseLeave={thinkingHover.onMouseLeave}
                backgroundColor={hoveredBg(thinkingHover.isHovered)}
              >
                <Text color={current.color ?? "$muted"}>{current.icon}</Text>
                <Text color={current.color ?? "$muted"}>{current.name}</Text>
              </Box>
            )
          }
          // Legacy fallback (kept for tests + agents not yet on descriptors).
          const key = thinking && THINKING_ICONS[thinking] ? thinking : "normal"
          return (
            <Box
              flexDirection="row"
              gap={1}
              flexShrink={0}
              onClick={onCycleThinking}
              onMouseEnter={thinkingHover.onMouseEnter}
              onMouseLeave={thinkingHover.onMouseLeave}
              backgroundColor={hoveredBg(thinkingHover.isHovered)}
            >
              <Text color="$muted">{THINKING_ICONS[key]}</Text>
              <Text color="$muted">{THINKING_LABELS[key]}</Text>
            </Box>
          )
        })()}
        {/* Mode row — descriptor-driven. Hidden when the active agent
            doesn't expose a planning capability. Legacy fallback for
            transition/tests. */}
        {(() => {
          const arr = capabilities?.planning
          if (arr && arr.length > 0) {
            const current = findOptionFor(arr, mode) ?? defaultOption(arr)
            const onClick = (): void => {
              const next = nextOption(arr, current.id)
              const ctx = makeCtx(controller, focusedId, setThinking, setMode)
              void next.activate(ctx)
            }
            const color = current.color ?? "$muted"
            return (
              <Box
                flexDirection="row"
                gap={1}
                flexShrink={0}
                onClick={onClick}
                onMouseEnter={modeHover.onMouseEnter}
                onMouseLeave={modeHover.onMouseLeave}
                backgroundColor={hoveredBg(modeHover.isHovered)}
              >
                <Text color={color} bold>
                  {current.icon}
                </Text>
                <Text color={color} bold>
                  {current.name}
                </Text>
              </Box>
            )
          }
          // Legacy fallback — uses MODE_COLORS / MODE_ICONS / MODE_LABELS.
          return (
            <Box
              flexDirection="row"
              gap={1}
              flexShrink={0}
              onClick={onCycleMode}
              onMouseEnter={modeHover.onMouseEnter}
              onMouseLeave={modeHover.onMouseLeave}
              backgroundColor={hoveredBg(modeHover.isHovered)}
            >
              <Text color={modeColor} bold>
                {modeIcon}
              </Text>
              <Text color={modeColor} bold>
                {modeLabel}
              </Text>
            </Box>
          )
        })()}
      </Box>
      {/* Trailing blank row at the bottom of the side panel. paddingY={1} on
          the outer Box only contributes 1 row; this Spacer adds one more so
          there's visible breathing room below the mode line. */}
      <Box flexShrink={0} height={1} />
    </Box>
  )
}
