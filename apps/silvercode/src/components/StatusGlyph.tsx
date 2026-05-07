import React from "react"
import { Text } from "silvery"

const DEFAULT_PERIOD_MS = 1800
const PULSE_TICK_MS = 100

const pulseSubscribers = new Set<() => void>()
let pulseTimer: ReturnType<typeof setInterval> | null = null
let pulseEpoch: number | null = null

function subscribePulse(listener: () => void): () => void {
  pulseSubscribers.add(listener)
  pulseEpoch ??= Date.now()
  if (pulseTimer === null) {
    const timer = setInterval(() => {
      for (const subscriber of pulseSubscribers) subscriber()
    }, PULSE_TICK_MS)
    const maybeUnref = timer as { unref?: () => void }
    maybeUnref.unref?.()
    pulseTimer = timer
  }
  return () => {
    pulseSubscribers.delete(listener)
    if (pulseSubscribers.size === 0 && pulseTimer !== null) {
      clearInterval(pulseTimer)
      pulseTimer = null
      pulseEpoch = null
    }
  }
}

function pulseIsHigh(now: number, period: number): boolean {
  const safePeriod = Math.max(1, period)
  const phase = ((now % safePeriod) + safePeriod) % safePeriod
  return phase >= safePeriod / 2
}

function useSynchronizedPulse(active: boolean, period: number): boolean {
  const [, setTick] = React.useState(0)
  React.useEffect(() => {
    if (!active) return undefined
    return subscribePulse(() => setTick(Date.now()))
  }, [active])
  const epoch = pulseEpoch
  return active && epoch !== null && pulseIsHigh(Date.now() - epoch, period)
}

export function StatusGlyph({
  glyph,
  active = false,
  color = "$muted",
  lowColor,
  period = DEFAULT_PERIOD_MS,
  backgroundColor,
}: {
  glyph: string
  active?: boolean
  color?: string
  lowColor?: string
  period?: number
  backgroundColor?: string
}): React.ReactElement {
  const high = useSynchronizedPulse(active, period)
  if (active) {
    return (
      <Text color={high ? color : (lowColor ?? backgroundColor ?? "$bg")} backgroundColor={backgroundColor}>
        {glyph}
      </Text>
    )
  }
  return (
    <Text color={color} backgroundColor={backgroundColor}>
      {glyph}
    </Text>
  )
}
