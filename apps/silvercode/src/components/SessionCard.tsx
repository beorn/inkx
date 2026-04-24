import React from "react"
import { Box, Spinner, Text } from "silvery"
import type { SessionHandle } from "../controller.ts"
import { useStoreSignal } from "../hooks/use-store-signal.ts"
import { MessageList } from "./MessageList.tsx"
import { Welcome } from "./Welcome.tsx"

/**
 * Playful verb pool — all drawn from metallurgy, blacksmithing, jewellery,
 * and high tea so the indicator fits the "Silver Code" motif. Rotated every
 * 3s so the UI feels alive during long thinks.
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

/**
 * Live activity line — pinned to the bottom of the card body, shown whenever
 * the session isn't idle. Gives the user per-frame feedback that something IS
 * happening, even before any text-delta arrives on the wire (Claude's
 * "thinking…" gap can be 500ms-several seconds on Opus). Without this, the
 * card looks frozen.
 *
 * Mirrors Claude Code's own status line: `<spinner> <verb>… (Xm Ys · ↑ in ·
 * ↓ out)`. The verb rotates through a playful pool every 3s; elapsed ticks
 * every 1s. Both timers live locally so parent components don't re-render
 * on each tick.
 */
function ActivityIndicator({
  status,
  pendingPermissions,
  inFlightTool,
  turnStartedAt,
  inputTokens,
  outputTokens,
}: {
  status: "spawning" | "idle" | "thinking" | "tool-running" | "awaiting-permission" | "ended"
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

  // Elapsed string — only meaningful when we have a turn anchor.
  const elapsedStr = turnStartedAt != null ? formatElapsed(now - turnStartedAt) : null

  // Build the verb/label + its color. Awaiting-permission and tool-running
  // get their own static labels; thinking / spawning rotate through the
  // playful pool.
  let label: string
  let color: string
  if (status === "awaiting-permission") {
    label = `awaiting permission (${pendingPermissions})`
    color = "$warning"
  } else if (status === "tool-running") {
    label = inFlightTool ? `running ${inFlightTool}…` : "running tool…"
    color = "$info"
  } else {
    // thinking | spawning — rotating playful verb
    const verb = VERB_POOL[verbIdx % VERB_POOL.length]!
    label = `${verb}…`
    color = "$accent"
  }

  // Token section — omit entirely when nothing has been counted yet so the
  // early moments stay uncluttered.
  const hasTokens = inputTokens > 0 || outputTokens > 0

  // Stats tail: `(elapsed · ↑ in · ↓ out)` — parts joined with ` · ` and
  // only included when they have content.
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

  // The most recent tool call that doesn't yet have a matching result is the
  // one currently in flight. Used in the activity indicator label.
  const inFlightTool = (() => {
    for (let i = state.messages.length - 1; i >= 0; i--) {
      const m = state.messages[i]!
      for (let j = m.toolCalls.length - 1; j >= 0; j--) {
        const c = m.toolCalls[j]!
        const hasResult = m.toolResults.some((r) => r.id === c.id)
        if (!hasResult) return c.name
      }
    }
    return null
  })()

  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      minHeight={0}
      minWidth={0}
      paddingX={1}
      onClick={onFocus}
    >
      {/* No header — name is implicit (one session), model/mode/status all
          live in the side panel. Card header was noise duplicating side
          panel info. */}

      {/* Body — empty state renders the Welcome card; otherwise the virtualized
          message list (silvery ListView owns scroll + wheel + keys). */}
      <Box flexGrow={1} minHeight={0} minWidth={0} paddingX={1}>
        {state.messages.length === 0 ? (
          <Welcome handle={handle} />
        ) : (
          <MessageList messages={state.messages} onApprove={onApprove} onDeny={onDeny} sessionId={handle.id} />
        )}
      </Box>

      {/* Activity indicator — bottom-pinned when the session is doing something.
          Elapsed time is anchored to the latest MessageEntry's `ts` (most
          recent turn, user or assistant); if there are no messages yet we
          pass null and the indicator omits the elapsed segment. */}
      <ActivityIndicator
        status={state.status}
        pendingPermissions={state.permissions.length}
        inFlightTool={inFlightTool}
        turnStartedAt={state.messages.length > 0 ? state.messages[state.messages.length - 1]!.ts : null}
        inputTokens={state.cost.inputTokens}
        outputTokens={state.cost.outputTokens}
      />
    </Box>
  )
}
