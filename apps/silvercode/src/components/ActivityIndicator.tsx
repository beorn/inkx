import React from "react"
import { Box, Spinner, Text } from "silvery"

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
  pendingPermissions,
  inFlightTool,
  turnStartedAt,
  inputTokens,
  outputTokens,
}: {
  status: ActivityStatus
  pendingPermissions: number
  inFlightTool: string | null
  /** Epoch ms at which the current turn started; null if no messages yet. */
  turnStartedAt: number | null
  inputTokens: number
  outputTokens: number
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

  return (
    <Box flexDirection="row" gap={1} paddingX={1}>
      <Spinner type="dots" />
      <Text color={color}>{label}</Text>
      {tail ? <Text color="$muted">{tail}</Text> : null}
    </Box>
  )
}
