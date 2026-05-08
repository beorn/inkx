/**
 * useResponsiveDisclosure — disclosure state (open/closed) with a
 * width-driven default plus a manual override.
 *
 * Built on `useResponsiveValue` (`silvery`). The auto-default is computed
 * from `defaultOpen(bp)`; manual `toggle()` calls set an override that the
 * derived `open` value prefers.
 *
 * Override policy (`resetOn`):
 *   - `'never'` (default): override sticks for the rest of the session.
 *     Matches the user's stated preference: once they Ctrl+O / /panel, that
 *     choice persists until the next manual toggle.
 *   - `'breakpoint-change'`: override evaporates when the breakpoint
 *     resolves to a different value, restoring the auto-default. Useful
 *     when the override would no longer make visual sense after a resize
 *     (e.g. a panel pinned-open on a desktop terminal that gets re-sized
 *     to phone-width).
 *
 * @example
 * ```tsx
 * const panel = useResponsiveDisclosure({
 *   defaultOpen: (bp) => bp !== "default", // open at sm and above
 * })
 * panel.open      // boolean
 * panel.toggle()  // pin via override
 * panel.reset()   // clear override → follow auto
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { type Breakpoint, useResponsiveValue } from "silvery"
import { createScope } from "@silvery/scope"

/**
 * Bucket the resolved breakpoint into a `Breakpoint | "default"` tag we can
 * pass to caller-provided policy functions. `useResponsiveValue` collapses
 * defined values; we just need a label per zone here.
 */
type Zone = Breakpoint | "default"

export interface UseResponsiveDisclosureOptions {
  /**
   * Compute the auto-default for a given zone. Receives the resolved zone
   * label ("default" | "sm" | "md" | "lg") and returns whether the panel
   * should be open by default at that zone.
   */
  defaultOpen: (zone: Zone) => boolean
  /**
   * When to clear the manual override.
   *   - `'never'` (default): override pins until next manual toggle.
   *   - `'breakpoint-change'`: override clears when zone changes.
   */
  resetOn?: "never" | "breakpoint-change"
}

export interface ResponsiveDisclosureHandle {
  /** Currently open? Derived from override (if set) else `defaultOpen(zone)`. */
  open: boolean
  /** The resolved zone label. */
  zone: Zone
  /** Flip the override. Pins the new value until next toggle / reset / breakpoint-change. */
  toggle: () => void
  /** Set the override explicitly (true/false). */
  setOpen: (open: boolean) => void
  /** Clear the override; revert to auto-default. */
  reset: () => void
}

/**
 * Default debounce window for zone changes. cmux workspace switches send
 * a burst of SIGWINCH events at the TTY level (e.g. 81→113→126→94 in ~300
 * ms). Without debounce, every intermediate zone crossing flips
 * `defaultOpen` and remounts/relays the disclosed subtree — see
 * `@km/silvercode/post-resize-ui-stability`. 250 ms is well above the
 * cmux burst duration but still imperceptible for genuine user resizes.
 */
const ZONE_HYSTERESIS_MS = 250

export function useResponsiveDisclosure(opts: UseResponsiveDisclosureOptions): ResponsiveDisclosureHandle {
  const { defaultOpen, resetOn = "never" } = opts
  // Resolve zone via useResponsiveValue's tag values — this updates on
  // every signal tick (incl. SIGWINCH bursts).
  const zone = useResponsiveValue<Zone>({
    default: "default",
    sm: "sm",
    md: "md",
    lg: "lg",
  })

  // Debounced "stable" zone — only updates after the live zone has been
  // unchanged for ZONE_HYSTERESIS_MS. The disclosure default reads from
  // this, so transient SIGWINCH-burst zone flips don't drive the panel
  // open/closed mid-cascade.
  const [stableZone, setStableZone] = useState<Zone>(zone)
  const pendingTimer = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (zone === stableZone) {
      // No transition — clear any pending settle.
      if (pendingTimer.current !== null) {
        pendingTimer.current()
        pendingTimer.current = null
      }
      return
    }
    const scope = createScope("responsive-disclosure")
    pendingTimer.current?.()
    pendingTimer.current = scope.timeout(() => {
      pendingTimer.current = null
      setStableZone(zone)
    }, ZONE_HYSTERESIS_MS)
    return () => {
      if (pendingTimer.current !== null) {
        pendingTimer.current()
        pendingTimer.current = null
      }
      void scope[Symbol.asyncDispose]()
    }
  }, [zone, stableZone])

  const [override, setOverride] = useState<boolean | null>(null)

  // Optional: clear override when *stable* zone changes — same hysteresis
  // applies, so a burst of zone flips doesn't reset the user's manual
  // toggle.
  useEffect(() => {
    if (resetOn === "breakpoint-change") {
      setOverride(null)
    }
  }, [stableZone, resetOn])

  const open = override ?? defaultOpen(stableZone)

  const toggle = useCallback(() => {
    setOverride((curr) => !(curr ?? defaultOpen(stableZone)))
  }, [defaultOpen, stableZone])

  const setOpen = useCallback((v: boolean) => setOverride(v), [])
  const reset = useCallback(() => setOverride(null), [])

  return { open, zone: stableZone, toggle, setOpen, reset }
}
