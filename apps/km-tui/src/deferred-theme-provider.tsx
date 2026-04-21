/**
 * DeferredThemeProvider — renders with a fallback theme immediately, then
 * swaps to the probed theme once OSC 4/10/11 detection resolves.
 *
 * Why: the terminal palette probe takes ~400-500ms (OSC 4/10/11 roundtrips
 * with a 150ms-per-query timeout). Blocking first paint on it pushes cold
 * start from <100ms to ~500ms. Most users on dark-terminal defaults never
 * notice the swap because the fallback picks the correct light/dark polarity
 * from `caps.darkBackground` (synchronous kernel/env detection). By the time
 * the probe resolves, we re-render with the accurate scheme — usually
 * imperceptible because the first frame is already on screen.
 *
 * Flash avoidance: if a previous session cached a detected theme, we load it
 * synchronously on mount for a zero-flash startup.
 */

import React, { useEffect, useState } from "react"
import { ThemeProvider, ansi16DarkTheme, ansi16LightTheme, type Theme } from "@silvery/ag-react"
import { detectTheme } from "./theme.ts"
import { loadCachedTheme, saveCachedTheme, type ThemeCacheKey } from "./theme-cache.ts"
import { createLogger } from "@km/core"

const log = createLogger("km:tui:theme")

interface DeferredThemeProviderProps {
  caps: {
    colorLevel?: string
    darkBackground?: boolean
    program?: string
  }
  cacheKey?: ThemeCacheKey
  children: React.ReactNode
}

/**
 * Pick a synchronous fallback theme based on the probed capabilities.
 *
 * - `colorLevel === "none" | "basic"` → the ANSI 16 theme (matches what
 *   `detectTheme` would have returned synchronously anyway).
 * - Otherwise → ANSI 16 dark/light depending on `caps.darkBackground`.
 *   ANSI 16 themes use hex values but only 16 colors, which paint on any
 *   terminal without looking wrong; truecolor terminals still render them
 *   literally. The real palette swap happens when the probe completes.
 */
function pickFallbackTheme(caps: DeferredThemeProviderProps["caps"]): Theme {
  const isDark = caps.darkBackground ?? true
  return isDark ? ansi16DarkTheme : ansi16LightTheme
}

export function DeferredThemeProvider({ caps, cacheKey, children }: DeferredThemeProviderProps): React.ReactElement {
  // Start with cached theme if available, else the synchronous fallback.
  // The cache survives across runs keyed by terminal program + mode so
  // repeat launches see zero theme flash.
  const [theme, setTheme] = useState<Theme>(() => {
    if (cacheKey) {
      const cached = loadCachedTheme(cacheKey)
      if (cached) {
        log.debug?.(
          `theme: loaded cached theme ${cached.name} for ${cacheKey.program}/${cacheKey.dark ? "dark" : "light"}`,
        )
        return cached
      }
    }
    return pickFallbackTheme(caps)
  })

  // Kick off the OSC probe after first paint. useEffect runs AFTER the first
  // render commits, so the board is already on screen by the time this fires.
  useEffect(() => {
    let cancelled = false
    detectTheme({ caps })
      .then((detected) => {
        if (cancelled) return
        setTheme(detected)
        if (cacheKey) saveCachedTheme(cacheKey, detected)
        log.debug?.(`theme: probe resolved → ${detected.name}`)
      })
      .catch((err) => {
        log.debug?.(`theme: probe failed — ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caps/cacheKey are stable for the lifetime of runBoard
  }, [])

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
