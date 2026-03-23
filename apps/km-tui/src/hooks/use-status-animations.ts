/**
 * Shared animation hooks for status indicators.
 *
 * Used by CommandBox and BottomBar for flash-on-change counters,
 * log toast notifications, and spinner frame animation.
 */
import React, { useState, useEffect } from "react"
import { useInterval } from "@silvery/ag-react"
import type { ToastQueue } from "@km/core"

// Spinner frames (braille unicode dots animation)
const SPINNER_FRAMES = [
  "\u280B",
  "\u2819",
  "\u2839",
  "\u2838",
  "\u283C",
  "\u2834",
  "\u2826",
  "\u2827",
  "\u2807",
  "\u280F",
]
const SPINNER_INTERVAL = 80

const FLASH_DURATION = 3000

/** Hook for 3-second flash when a value changes */
export function useFlashOnChange(value: number): boolean {
  const [flash, setFlash] = useState(false)
  const prevRef = React.useRef(value)

  useEffect(() => {
    if (value === prevRef.current) return
    prevRef.current = value
    if (value === 0) return
    setFlash(true)
    // @ts-expect-error - React internal flag set by silvery test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) return
    const timer = setTimeout(() => setFlash(false), FLASH_DURATION)
    return () => clearTimeout(timer)
  }, [value])

  return flash
}

/** Hook to fire a one-time toast when first console log arrives */
export function useLogToast(total: number, toastQueue?: ToastQueue): void {
  const firedRef = React.useRef(false)

  useEffect(() => {
    if (firedRef.current || total === 0 || !toastQueue) return
    // @ts-expect-error - React internal flag set by silvery test renderer
    if (globalThis.IS_REACT_ACT_ENVIRONMENT) return
    firedRef.current = true
    toastQueue.info(`${total} log messages \u2014 press \` to see`)
  }, [total, toastQueue])
}

/** Hook for animated spinner frame - uses silvery useInterval (Dan Abramov's ref pattern) */
export function useSpinnerFrame(enabled: boolean): string {
  const [frameIndex, setFrameIndex] = useState(0)

  useInterval(() => setFrameIndex((i) => (i + 1) % SPINNER_FRAMES.length), SPINNER_INTERVAL, enabled)

  return SPINNER_FRAMES[frameIndex] ?? "\u280B"
}
