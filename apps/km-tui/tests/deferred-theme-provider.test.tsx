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
import type { KmThemeDetection } from "../src/theme.ts"
import * as cacheModule from "../src/theme-cache.ts"
import { ansi16DarkTheme, TermContext, useTheme, type Theme } from "@silvery/ag-react"

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

const fakeProbedDetection: KmThemeDetection = {
  theme: fakeProbedTheme,
  source: "probed",
  confidence: 1,
  probed: { fg: true, bg: true, ansiCount: 16 },
}

function CaptureTheme({ onTheme }: { onTheme: (theme: Theme) => void }) {
  onTheme(useTheme())
  return null
}

describe("DeferredThemeProvider", () => {
  let loadSpy: ReturnType<typeof vi.spyOn>
  let saveSpy: ReturnType<typeof vi.spyOn>
  let detectSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    loadSpy = vi.spyOn(cacheModule, "loadCachedTheme")
    saveSpy = vi.spyOn(cacheModule, "saveCachedTheme").mockImplementation(() => {})
    detectSpy = vi.spyOn(themeModule, "detectKmTheme").mockResolvedValue(fakeProbedDetection)
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
        caps={{ colorLevel: "truecolor", maybeDarkBackground: true }}
        emulator={{ program: "ghostty" }}
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
        caps={{ colorLevel: "truecolor", maybeDarkBackground: true }}
        emulator={{ program: "ghostty" }}
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

  test("first cache-miss frame uses the terminal default canvas background", () => {
    loadSpy.mockReturnValue(null)
    detectSpy.mockReturnValue(new Promise(() => {}) as never)
    const seen: { current?: Theme } = {}

    const render = createRenderer({ cols: 80, rows: 24 })
    render(
      <DeferredThemeProvider
        caps={{ colorLevel: "truecolor", maybeDarkBackground: true }}
        emulator={{ program: "ghostty" }}
        cacheKey={{ program: "ghostty", dark: true }}
      >
        <CaptureTheme
          onTheme={(theme) => {
            seen.current = theme
          }}
        />
      </DeferredThemeProvider>,
    )

    expect(seen.current?.bg).toBe("")
    expect((seen.current as unknown as Record<string, string> | undefined)?.["bg-surface-default"]).toBe("")
  })

  test("does not cache fallback-equivalent probe results", async () => {
    loadSpy.mockReturnValue(null)
    detectSpy.mockResolvedValueOnce({
      theme: themeModule.terminalDefaultCanvasTheme(ansi16DarkTheme),
      source: "fallback",
      confidence: 0,
      probed: { fg: false, bg: false, ansiCount: 0 },
    } satisfies KmThemeDetection)

    const render = createRenderer({ cols: 80, rows: 24 })
    render(
      <DeferredThemeProvider
        caps={{ colorLevel: "truecolor", maybeDarkBackground: true }}
        emulator={{ program: "ghostty" }}
        cacheKey={{ program: "ghostty", dark: true }}
      >
        <></>
      </DeferredThemeProvider>,
    )

    // Let the useEffect + async probe resolve.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(detectSpy).toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  test("does not cache partial probe results without a background", async () => {
    loadSpy.mockReturnValue(null)
    detectSpy.mockResolvedValueOnce({
      theme: themeModule.terminalDefaultCanvasTheme({
        ...ansi16DarkTheme,
        fg: "#eeeeee",
      }),
      source: "probed",
      confidence: 0.05,
      probed: { fg: true, bg: false, ansiCount: 0 },
    } satisfies KmThemeDetection)

    const render = createRenderer({ cols: 80, rows: 24 })
    render(
      <DeferredThemeProvider
        caps={{ colorLevel: "truecolor", maybeDarkBackground: true }}
        emulator={{ program: "ghostty" }}
        cacheKey={{ program: "ghostty", dark: true }}
      >
        <></>
      </DeferredThemeProvider>,
    )

    // Let the useEffect + async probe resolve.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(detectSpy).toHaveBeenCalled()
    expect(saveSpy).not.toHaveBeenCalled()
  })

  test("routes cache-miss probe through the active term input owner", async () => {
    loadSpy.mockReturnValue(null)
    const fakeInput = { probe: vi.fn() }

    const render = createRenderer({ cols: 80, rows: 24 })
    render(
      <TermContext.Provider value={{ input: fakeInput } as never}>
        <DeferredThemeProvider
          caps={{ colorLevel: "truecolor", maybeDarkBackground: true }}
          emulator={{ program: "ghostty" }}
          cacheKey={{ program: "ghostty", dark: true }}
        >
          <></>
        </DeferredThemeProvider>
      </TermContext.Provider>,
    )

    // Let the useEffect + async probe resolve.
    await new Promise((r) => setTimeout(r, 0))
    await new Promise((r) => setTimeout(r, 0))

    expect(detectSpy).toHaveBeenCalledWith({
      caps: { colorLevel: "truecolor", darkBackground: true },
      input: fakeInput,
    })
  })

  test("KM_FORCE_THEME_PROBE=1 runs probe even on cache hit", async () => {
    process.env.KM_FORCE_THEME_PROBE = "1"
    loadSpy.mockReturnValue(fakeCachedTheme)
    detectSpy.mockReturnValue(new Promise(() => {}) as never)
    const seen: { current?: Theme } = {}

    const render = createRenderer({ cols: 80, rows: 24 })
    render(
      <DeferredThemeProvider
        caps={{ colorLevel: "truecolor", maybeDarkBackground: true }}
        emulator={{ program: "ghostty" }}
        cacheKey={{ program: "ghostty", dark: true }}
      >
        <CaptureTheme
          onTheme={(theme) => {
            seen.current = theme
          }}
        />
      </DeferredThemeProvider>,
    )

    await new Promise((r) => setTimeout(r, 0))

    expect(loadSpy).not.toHaveBeenCalled()
    expect(seen.current?.bg).toBe("")
    expect((seen.current as unknown as Record<string, string> | undefined)?.["bg-surface-default"]).toBe("")
    expect(detectSpy).toHaveBeenCalled()
  })
})
