import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { StyleProps } from "@silvery/ag/types"
import { createScope, type Scope } from "@silvery/scope"
import { createRenderer } from "@silvery/test"
import { AppScopeContext, Pulse, ScopeProvider, Text, useSynchronizedPhase } from "silvery"

function withScope(scope: Scope, element: React.ReactElement): React.ReactElement {
  return (
    <ScopeProvider appScope={scope} scope={scope}>
      {element}
    </ScopeProvider>
  )
}

describe("contract: Pulse synchronization", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("contract: local and disabled pulses need only the current scope", async () => {
    const scope = createScope("scope-only-pulse-contract")
    const app = createRenderer({ cols: 40, rows: 4 })(
      <AppScopeContext.Provider value={null}>
        <ScopeProvider scope={scope}>
          <Pulse intervalMs={500}>active-local</Pulse>
          <Pulse active={false}>inactive-local</Pulse>
          <Pulse synchronized active={false}>
            inactive-synchronized
          </Pulse>
        </ScopeProvider>
      </AppScopeContext.Provider>,
    )

    expect(app.text).toContain("active-local")
    expect(app.text).toContain("inactive-local")
    expect(app.text).toContain("inactive-synchronized")
    expect(vi.getTimerCount()).toBe(1)

    app.unmount()
    for (let i = 0; i < 3; i++) await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)
    await scope[Symbol.asyncDispose]()
  })

  test("contract: an active synchronized pulse requires an app-root scope", async () => {
    const scope = createScope("scope-only-synchronized-pulse-contract")
    const render = createRenderer({ cols: 40, rows: 4 })

    expect(() =>
      render(
        <AppScopeContext.Provider value={null}>
          <ScopeProvider scope={scope}>
            <Pulse synchronized>active-synchronized</Pulse>
          </ScopeProvider>
        </AppScopeContext.Provider>,
      ),
    ).toThrow(/useSynchronizedPhase\(\).*app-root scope/u)

    await scope[Symbol.asyncDispose]()
  })

  test("contract: synchronized defaults to false and each pulse starts from its mount phase", async () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("pulse-defaults-contract")
    const tree = (showSecond: boolean) =>
      withScope(
        scope,
        <>
          <Pulse intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
            first
          </Pulse>
          {showSecond ? (
            <Pulse intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
              second
            </Pulse>
          ) : null}
        </>,
      )
    const colorOf = (app: ReturnType<ReturnType<typeof createRenderer>>, text: string): unknown =>
      (app.getByText(text).resolve()?.props as StyleProps | undefined)?.color

    const app = render(tree(false))
    await vi.advanceTimersByTimeAsync(250)
    app.rerender(tree(true))
    await vi.advanceTimersByTimeAsync(250)
    app.rerender(tree(true))

    expect(colorOf(app, "first")).toBe("$fg-muted")
    expect(colorOf(app, "second")).toBe("$fg-error")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test("contract: omitted reducedMotion follows the host preference", async () => {
    const original = globalThis.matchMedia
    const reducedMotionList: MediaQueryList = {
      matches: true,
      media: "(prefers-reduced-motion: reduce)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    }
    Object.defineProperty(globalThis, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn(() => reducedMotionList),
    })

    try {
      function PhaseProbe(): React.ReactElement {
        const phase = useSynchronizedPhase({ active: true, periodMs: 900, steps: 3 })
        return <Text>{`phase-${phase}`}</Text>
      }

      const scope = createScope("synchronized-phase-reduced-motion-default-contract")
      const app = createRenderer({ cols: 40, rows: 4 })(withScope(scope, <PhaseProbe />))

      expect(app.text).toContain("phase-0")
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(900)
      expect(app.text).toContain("phase-0")

      app.unmount()
      await scope[Symbol.asyncDispose]()
    } finally {
      Object.defineProperty(globalThis, "matchMedia", {
        configurable: true,
        writable: true,
        value: original,
      })
    }
  })
})
