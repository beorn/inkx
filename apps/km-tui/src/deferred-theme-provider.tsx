/**
 * DeferredThemeProvider — renders with a fallback theme immediately, then
 * swaps to the probed theme once OSC 4/10/11 detection resolves.
 *
 * Why: the terminal palette probe takes ~400-500ms (OSC 4/10/11 roundtrips
 * with a 150ms-per-query timeout). Blocking first paint on it pushes cold
 * start from <100ms to ~500ms. Most users on dark-terminal defaults never
 * notice the swap because the fallback picks the correct light/dark polarity
 * from `heuristics.darkBackground` (synchronous kernel/env detection). By the time
 * the probe resolves, we re-render with the accurate scheme — usually
 * imperceptible because the first frame is already on screen.
 *
 * Flash avoidance: if a previous session cached a detected theme, we load it
 * synchronously on mount for a zero-flash startup.
 *
 * Cache-hit shortcut: when the cache already holds a theme for the
 * (program, dark) pair, we skip the OSC probe entirely. probeColors issues
 * 18 OSC 4/10/11 roundtrips serially (~400ms, 150ms timeout each) and holds
 * the stdin raw-mode toggle for that window — pure waste when we already
 * have a theme that matches the pair. The probe only runs on first-ever
 * launch or when the cache misses. Set `KM_FORCE_THEME_PROBE=1` in the env
 * to force a re-probe (e.g. debugging palette drift after a terminal-side
 * theme change — next run will backfill the cache).
 */

import React, { useEffect, useRef, useState } from "react"
import { ThemeProvider, ansi16DarkTheme, ansi16LightTheme, type Theme } from "@silvery/ag-react"
import type { ColorTier } from "@silvery/ansi"
import { detectTheme } from "./theme.ts"
import { loadCachedTheme, saveCachedTheme, type ThemeCacheKey } from "./theme-cache.ts"
import { createLogger } from "@km/core"

const log = createLogger("km:tui:theme")

interface DeferredThemeProviderProps {
  caps: {
    // Silvery canonicalized the TYPE to `ColorTier` (2026-04-23) but kept
    // the field name `colorTier` on TerminalCaps for source compatibility.
    colorTier?: ColorTier
  }
  /** Terminal identity — post Phase 7 (caps-restructure), program / version /
   * termName live on the profile's identity layer, not on caps. */
  identity?: { program?: string }
  /** Subjective heuristics — post Phase 7 (caps-restructure), darkBackground /
   * nerdfont / textEmojiWide live on the profile's heuristics layer. */
  heuristics?: { darkBackground?: boolean }
  cacheKey?: ThemeCacheKey
  children: React.ReactNode
}

/**
 * Pick a synchronous fallback theme based on the probed capabilities.
 *
 * - `colorTier === "mono" | "ansi16"` → the ANSI 16 theme (matches what
 *   `detectTheme` would have returned synchronously anyway).
 * - Otherwise → ANSI 16 dark/light depending on `heuristics.darkBackground`.
 *   ANSI 16 themes use hex values but only 16 colors, which paint on any
 *   terminal without looking wrong; truecolor terminals still render them
 *   literally. The real palette swap happens when the probe completes.
 */
function pickFallbackTheme(heuristics: DeferredThemeProviderProps["heuristics"]): Theme {
  const isDark = heuristics?.darkBackground ?? true
  return isDark ? ansi16DarkTheme : ansi16LightTheme
}

export function DeferredThemeProvider({
  caps,
  identity,
  heuristics,
  cacheKey,
  children,
}: DeferredThemeProviderProps): React.ReactElement {
  // Start with cached theme if available, else the synchronous fallback.
  // The cache survives across runs keyed by terminal program + mode so
  // repeat launches see zero theme flash. The cached theme is already
  // matched to this (program, dark) pair, so the 18-OSC-roundtrip probe on
  // useEffect would just redo work and pay ~400ms of stdin contention for
  // no user-visible change — `cacheHit` gates the probe off in that case.
  //
  // One disk read: the ref is set inside the lazy useState initialiser, and
  // both the initial theme choice and the probe gate read it. Using a ref
  // (not state) keeps the useEffect dep list at [] so the effect runs once.
  const cacheHit = useRef<boolean>(false)
  const [theme, setTheme] = useState<Theme>(() => {
    if (cacheKey) {
      const cached = loadCachedTheme(cacheKey)
      if (cached) {
        cacheHit.current = true
        log.debug?.(
          `theme: loaded cached theme ${cached.name} for ${cacheKey.program}/${cacheKey.dark ? "dark" : "light"} — skipping probe`,
        )
        return cached
      }
    }
    return pickFallbackTheme(heuristics)
  })

  // Kick off the OSC probe after first paint. useEffect runs AFTER the first
  // render commits, so the board is already on screen by the time this fires.
  //
  // Skip the probe when: (a) we had a cache hit (the cached theme is already
  // matched to this (program, dark) pair — re-probing is waste), unless
  // (b) KM_FORCE_THEME_PROBE=1 in env forces a re-probe (debug escape hatch
  // for palette drift after a terminal-side theme swap).
  useEffect(() => {
    const forceProbe = process.env.KM_FORCE_THEME_PROBE === "1"
    if (cacheHit.current && !forceProbe) {
      log.debug?.("theme: cache hit — probe skipped (set KM_FORCE_THEME_PROBE=1 to force)")
      return
    }
    let cancelled = false
    // detectTheme accepts a structural `{ colorTier?, darkBackground? }` — the
    // darkBackground heuristic moved to `heuristics` in Phase 7, so we flatten
    // the two layers back into the one-shot argument detectTheme expects.
    detectTheme({ caps: { colorTier: caps.colorTier, darkBackground: heuristics?.darkBackground } })
      .then((detected) => {
        if (cancelled) return
        setTheme(detected)
        if (cacheKey) saveCachedTheme(cacheKey, detected)
        log.debug?.(`theme: probe resolved → ${detected.name}`)
        return
      })
      .catch((err: unknown) => {
        log.debug?.(`theme: probe failed — ${err instanceof Error ? err.message : String(err)}`)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caps/cacheKey are stable for the lifetime of runBoard
  }, [])

  return <ThemeProvider theme={theme}>{children}</ThemeProvider>
}
