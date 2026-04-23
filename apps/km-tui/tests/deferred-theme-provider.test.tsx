/**
 * DeferredThemeProvider — cache-hit probe skip.
 *
 * Probes cost ~400ms (18 OSC 4/10/11 roundtrips, 150ms timeout each). When
 * the theme cache already holds an entry for the (program, dark) pair, the
 * probe is pure waste — the cached theme IS the correct theme for that
 * pair. This test asserts the probe function is not invoked when the cache
 * is pre-populated, and IS invoked on a cache miss.
 *
 * Regression: bead `km-tui.evaluate-probe-autoprobing`.
 */
import { describe, expect, test, vi, beforeEach, afterEach } from "vitest"
import React from "react"
import { createRenderer } from "@silvery/test"
import { DeferredThemeProvider } from "../src/deferred-theme-provider.tsx"
import * as themeModule from "../src/theme.ts"
import * as cacheModule from "../src/theme-cache.ts"
import type { Theme } from "@silvery/ag-react"

const fakeCachedTheme: Theme = {
  name: "test-cached",
  bg: "#111111",
  fg: "#eeeeee",
} as unknown as Theme

const fakeProbedTheme: Theme = {
  name: "test-probed",
  bg: "#222222",
  fg: "#dddddd",
} as unknown as Theme

describe("DeferredThemeProvider", () => {
  let loadSpy: ReturnType<typeof vi.spyOn>
  let saveSpy: ReturnType<typeof vi.spyOn>
  let detectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    loadSpy = vi.spyOn(cacheModule, "loadCachedTheme")
    saveSpy = vi.spyOn(cacheModule, "saveCachedTheme").mockImplementation(() => {})
    detectSpy = vi.spyOn(themeModule, "detectTheme").mockResolvedValue(fakeProbedTheme)
  })

  afterEach(() => {
    loadSpy.mockRestore()
    saveSpy.mockRestore()
    detectSpy.mockRestore()
    delete process.env.KM_FORCE_THEME_PROBE
  })

  test("skips probe on cache hit", async () => {
    loadSpy.mockReturnValue(fakeCachedTheme)

    const render = createRenderer({ cols: 80, rows: 24 })
    render(
      <DeferredThemeProvider
        caps={{ colorTier: "truecolor" }}
        identity={{ program: "ghostty" }}
        heuristics={{ darkBackground: true }}
        cacheKey={{ program: "ghostty", dark: true }}
      >
        <></>
      </DeferredThemeProvider>,
    )

    // Let the useEffect fire.
    await new Promise((r) => setTimeout(r, 0))

    expect(loadSpy).toHaveBeenCalled()
    expect(detectSpy).not.toHaveBeenCalled()
  })

  test("runs probe on cache miss", async () => {
    loadSpy.mockReturnValue(null)

    const render = createRenderer({ cols: 80, rows: 24 })
    render(
      <DeferredThemeProvider
        caps={{ colorTier: "truecolor" }}
        identity={{ program: "ghostty" }}
        heuristics={{ darkBackground: true }}
        cacheKey={{ program: "ghostty", dark: true }}
      >
        <></>
      </DeferredThemeProvider>,
    )

    // Let the useEffect + async probe resolve.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(loadSpy).toHaveBeenCalled()
    expect(detectSpy).toHaveBeenCalled()
    expect(saveSpy).toHaveBeenCalledWith({ program: "ghostty", dark: true }, fakeProbedTheme)
  })

  test("KM_FORCE_THEME_PROBE=1 runs probe even on cache hit", async () => {
    process.env.KM_FORCE_THEME_PROBE = "1"
    loadSpy.mockReturnValue(fakeCachedTheme)

    const render = createRenderer({ cols: 80, rows: 24 })
    render(
      <DeferredThemeProvider
        caps={{ colorTier: "truecolor" }}
        identity={{ program: "ghostty" }}
        heuristics={{ darkBackground: true }}
        cacheKey={{ program: "ghostty", dark: true }}
      >
        <></>
      </DeferredThemeProvider>,
    )

    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(detectSpy).toHaveBeenCalled()
  })
})
