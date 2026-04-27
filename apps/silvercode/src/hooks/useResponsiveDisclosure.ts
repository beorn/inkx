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

import { useCallback, useEffect, useState } from "react"
import { type Breakpoint, useResponsiveValue } from "silvery"

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

export function useResponsiveDisclosure(opts: UseResponsiveDisclosureOptions): ResponsiveDisclosureHandle {
  const { defaultOpen, resetOn = "never" } = opts
  // Resolve zone via useResponsiveValue's tag values.
  const zone = useResponsiveValue<Zone>({
    default: "default",
    sm: "sm",
    md: "md",
    lg: "lg",
  })
  const [override, setOverride] = useState<boolean | null>(null)

  // Optional: clear override when zone changes.
  useEffect(() => {
    if (resetOn === "breakpoint-change") {
      setOverride(null)
    }
  }, [zone, resetOn])

  const open = override ?? defaultOpen(zone)

  const toggle = useCallback(() => {
    setOverride((curr) => !(curr ?? defaultOpen(zone)))
  }, [defaultOpen, zone])

  const setOpen = useCallback((v: boolean) => setOverride(v), [])
  const reset = useCallback(() => setOverride(null), [])

  return { open, zone, toggle, setOpen, reset }
}
