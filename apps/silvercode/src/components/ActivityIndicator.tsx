import React from "react"
import { Box, Text } from "silvery"

/**
 * Playful verb pool — metallurgy / blacksmithing / jewellery / high tea
 * themed to fit the "Silver Code" motif. Rotated every 3s so the indicator
 * feels alive during long thinks.
 */
const VERB_POOL = [
  // Metallurgy
  "Smelting",
  "Refining",
  "Annealing",
  "Tempering",
  "Casting",
  "Alloying",
  "Quenching",
  "Forging",
  // Blacksmithing
  "Hammering",
  "Welding",
  "Drawing",
  "Upsetting",
  "Swaging",
  "Bellowing",
  // Jewellery
  "Filigreeing",
  "Polishing",
  "Setting",
  "Engraving",
  "Chasing",
  "Soldering",
  "Burnishing",
  // High tea
  "Steeping",
  "Pouring",
  "Infusing",
  "Whisking",
  "Stirring",
  "Simmering",
] as const

const VERB_ROTATE_MS = 3000
const ELAPSED_TICK_MS = 1000

function formatElapsed(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000))
  if (totalSec < 60) return `${totalSec}s`
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}m ${s}s`
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  // 1.2k style — one decimal for readability, strip trailing `.0`
  const k = n / 1000
  return k >= 100 ? `${Math.round(k)}k` : `${k.toFixed(1).replace(/\.0$/, "")}k`
}

export type ActivityStatus = "spawning" | "idle" | "thinking" | "tool-running" | "awaiting-permission" | "ended"

/**
 * Live activity line — rendered inline in the message stream after the
 * last message, not as bottom-pinned chrome. Mirrors Claude Code's own
 * `<spinner> <verb>… (Xm Ys · ↑ in · ↓ out)` status line, giving the
 * user per-frame feedback that something IS happening even before any
 * text-delta arrives on the wire.
 *
 * The verb rotates through the silver-themed pool every 3s; elapsed ticks
 * every 1s. Both timers live locally so parent components don't re-render
 * on each tick.
 */
export function ActivityIndicator({
  status,
  pendingPermissions = 0,
  inFlightTool = null,
  turnStartedAt = null,
  inputTokens = 0,
  outputTokens = 0,
  agentLabel = null,
  agentVersion = null,
}: {
  status: ActivityStatus
  /** @default 0 */
  pendingPermissions?: number
  /** @default null */
  inFlightTool?: string | null
  /** Epoch ms at which the current turn started; null if no messages yet. @default null */
  turnStartedAt?: number | null
  /** @default 0 */
  inputTokens?: number
  /** @default 0 */
  outputTokens?: number
  /** Display name for the running agent (e.g. "Claude Code"). Drives the
   *  spawning-state label "Spawning Claude Code v<X>…". `null` falls back
   *  to bare "Spawning…". Bead: km-cr94. @default null */
  agentLabel?: string | null
  /** CLI version string from session-init (e.g. "2.1.119"). Appended as
   *  `v<version>` when present in the spawning label. `null` (and during
   *  the pre-session-init window) renders the label without a version
   *  suffix — `Spawning Claude Code…` rather than a placeholder version.
   *  @default null */
  agentVersion?: string | null
}): React.ReactElement | null {
  const isActive = status !== "idle" && status !== "ended"

  // Local verb index — advance every 3s while active. Hooks must run
  // unconditionally, so the early-return for inactive status happens AFTER
  // the hooks below.
  const [verbIdx, setVerbIdx] = React.useState(0)
  React.useEffect(() => {
    if (!isActive) return
    const id = setInterval(() => {
      setVerbIdx((i) => (i + 1) % VERB_POOL.length)
    }, VERB_ROTATE_MS)
    return () => {
      clearInterval(id)
    }
  }, [isActive])

  // Local tick for elapsed-time re-render. We store `now` rather than the
  // elapsed value directly so the component stays correct if turnStartedAt
  // changes between ticks (new turn starting).
  const [now, setNow] = React.useState(() => Date.now())
  React.useEffect(() => {
    if (!isActive) return
    setNow(Date.now())
    const id = setInterval(() => {
      setNow(Date.now())
    }, ELAPSED_TICK_MS)
    return () => {
      clearInterval(id)
    }
  }, [isActive, turnStartedAt])

  if (!isActive) return null

  const elapsedStr = turnStartedAt != null ? formatElapsed(now - turnStartedAt) : null

  let label: string
  let color: string
  if (status === "awaiting-permission") {
    label = `awaiting permission (${pendingPermissions})`
    color = "$warning"
  } else if (status === "tool-running") {
    label = inFlightTool ? `running ${inFlightTool}…` : "running tool…"
    color = "$info"
  } else if (status === "spawning") {
    // Pre-init phase. The user just submitted a prompt from the Welcome
    // card (or sent a turn that arrived before session-init resolved) and
    // the agent subprocess is still booting — "thinking…" would lie
    // (claude isn't reading anything yet). The label reads "Spawning
    // <agent> v<version>…" once session-init has populated `agentVersion`,
    // and "Spawning <agent>…" before that. The version is non-strict —
    // missing version (SDK adapter, codex, fake fixtures) drops the
    // suffix without erroring. Stays muted-info color so it reads as
    // system status, not thinking. This row is also the assistant-side
    // placeholder rendered when the user's first prompt has been written
    // to the store but claude hasn't responded yet (see
    // SessionUpdateList — the activity row is appended via `__activity`
    // when status !== "idle"). Bead: km-cr94.
    const who = agentLabel ?? "session"
    const versionSuffix = agentVersion ? ` v${agentVersion}` : ""
    label = `Spawning ${who}${versionSuffix}…`
    color = "$info"
  } else {
    const verb = VERB_POOL[verbIdx % VERB_POOL.length]!
    label = `${verb}…`
    color = "$accent"
  }

  const hasTokens = inputTokens > 0 || outputTokens > 0
  const tailParts: string[] = []
  if (elapsedStr) tailParts.push(elapsedStr)
  if (hasTokens) {
    tailParts.push(`↑ ${formatTokens(inputTokens)}`)
    tailParts.push(`↓ ${formatTokens(outputTokens)}`)
  }
  const tail = tailParts.length > 0 ? ` (${tailParts.join(" · ")})` : ""

  // Pulse the ◈ silvery diamond by alternating bold↔regular on the same
  // 1s tick as the elapsed updater — zero extra timers, visible "alive"
  // rhythm. No spinner character; the diamond echoes silvercode's own
  // brand glyph (◈ Silver Code) at the leading slot.
  const pulse = Math.floor(now / 1000) % 2 === 0

  return (
    <Box flexDirection="row" gap={1}>
      <Text bold={pulse} color={color}>
        ◈
      </Text>
      <Text color={color}>{label}</Text>
      {tail ? <Text color="$muted">{tail}</Text> : null}
    </Box>
  )
}
