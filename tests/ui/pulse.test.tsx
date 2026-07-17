import React from "react"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import type { StyleProps } from "@silvery/ag/types"
import { createScope, type Scope } from "@silvery/scope"
import { createRenderer } from "@silvery/test"
import { Pulse, ScopeProvider, Text, usePulse, useSynchronizedPhase } from "silvery"

function withScope(scope: Scope, element: React.ReactElement): React.ReactElement {
  return (
    <ScopeProvider appScope={scope} scope={scope}>
      {element}
    </ScopeProvider>
  )
}

function colorOf(
  app: ReturnType<ReturnType<typeof createRenderer>>,
  text: string,
): string | undefined {
  const node = app.getByText(text).resolve()
  return (node?.props as StyleProps | undefined)?.color as string | undefined
}

function PulseProbe(props: Parameters<typeof usePulse>[0]): React.ReactElement {
  const on = usePulse(props)
  return <Text>{on ? "pulse-on" : "pulse-off"}</Text>
}

function PhaseProbe(): React.ReactElement {
  const phase = useSynchronizedPhase({ active: true, periodMs: 900, steps: 3 })
  return <Text>{`phase-${phase}`}</Text>
}

function MixedPhaseProbe(): React.ReactElement {
  const fourStep = useSynchronizedPhase({ active: true, periodMs: 1200, steps: 4 })
  const twoStep = useSynchronizedPhase({ active: true, periodMs: 1000, steps: 2 })
  return <Text>{`${fourStep}/${twoStep}`}</Text>
}

async function advanceTimersByTime(ms: number): Promise<void> {
  await React.act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe("usePulse", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("alternates phase across the interval boundary", async () => {
    const render = createRenderer({ cols: 40, rows: 4, autoRender: true })
    const scope = createScope("pulse-test")
    const app = render(withScope(scope, <PulseProbe intervalMs={500} />))

    expect(app.text).toContain("pulse-on")
    await vi.advanceTimersByTimeAsync(499)
    app.rerender(withScope(scope, <PulseProbe intervalMs={500} />))
    expect(app.text).toContain("pulse-on")

    await vi.advanceTimersByTimeAsync(1)
    app.rerender(withScope(scope, <PulseProbe intervalMs={500} />))
    expect(app.text).toContain("pulse-off")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test("unmount cancels the owned interval", async () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("pulse-cleanup-test")
    const app = render(withScope(scope, <PulseProbe intervalMs={500} />))

    expect(vi.getTimerCount()).toBe(1)
    app.unmount()
    for (let i = 0; i < 3; i++) await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)

    await scope[Symbol.asyncDispose]()
  })

  test("prefers-reduced-motion: reduce disables the interval and keeps the first phase", async () => {
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
      const render = createRenderer({ cols: 40, rows: 4 })
      const scope = createScope("pulse-reduced-motion-test")
      const app = render(withScope(scope, <PulseProbe intervalMs={500} />))

      expect(app.text).toContain("pulse-on")
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(1_500)
      app.rerender(withScope(scope, <PulseProbe intervalMs={500} />))
      expect(app.text).toContain("pulse-on")

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

  test("partitions one synchronized period into the requested phases", async () => {
    const render = createRenderer({ cols: 40, rows: 4, autoRender: true })
    const scope = createScope("synchronized-phase-test")
    const tree = () => withScope(scope, <PhaseProbe />)
    const app = render(tree())

    expect(app.text).toContain("phase-0")
    await advanceTimersByTime(299)
    expect(app.text).toContain("phase-0")

    await advanceTimersByTime(1)
    expect(app.text).toContain("phase-1")

    await advanceTimersByTime(300)
    expect(app.text).toContain("phase-2")

    await advanceTimersByTime(300)
    expect(app.text).toContain("phase-0")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test("schedules the nearest boundary across different shared periods", async () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("mixed-synchronized-phase-test")
    const tree = () => withScope(scope, <MixedPhaseProbe />)
    const app = render(tree())

    expect(app.text).toContain("0/0")
    await vi.advanceTimersByTimeAsync(300)
    app.rerender(tree())
    expect(app.text).toContain("1/0")

    await vi.advanceTimersByTimeAsync(200)
    app.rerender(tree())
    expect(app.text).toContain("1/1")

    await vi.advanceTimersByTimeAsync(100)
    app.rerender(tree())
    expect(app.text).toContain("2/1")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test("reduced motion keeps synchronized phases at zero without a timer", async () => {
    function ReducedMotionProbe(): React.ReactElement {
      const phase = useSynchronizedPhase({
        active: true,
        periodMs: 900,
        steps: 3,
        reducedMotion: true,
      })
      return <Text>{`phase-${phase}`}</Text>
    }

    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("reduced-motion-synchronized-phase-test")
    const app = render(withScope(scope, <ReducedMotionProbe />))

    expect(app.text).toContain("phase-0")
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(900)
    expect(app.text).toContain("phase-0")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test("inactive synchronized phases stay at zero without a timer", async () => {
    function InactivePhaseProbe(): React.ReactElement {
      const phase = useSynchronizedPhase({
        active: false,
        periodMs: 900,
        steps: 3,
      })
      return <Text>{`phase-${phase}`}</Text>
    }

    const scope = createScope("inactive-synchronized-phase-test")
    const app = createRenderer({ cols: 40, rows: 4 })(withScope(scope, <InactivePhaseProbe />))

    expect(app.text).toContain("phase-0")
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(900)
    expect(app.text).toContain("phase-0")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test("a single synchronized step stays static without a timer", async () => {
    function StaticPhaseProbe(): React.ReactElement {
      const phase = useSynchronizedPhase({ active: true, periodMs: 900, steps: 1 })
      return <Text>{`phase-${phase}`}</Text>
    }

    const scope = createScope("single-step-synchronized-phase-test")
    const app = createRenderer({ cols: 40, rows: 4 })(withScope(scope, <StaticPhaseProbe />))

    expect(app.text).toContain("phase-0")
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(900)
    expect(app.text).toContain("phase-0")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test.each([
    [
      "non-finite periodMs",
      "periodMs",
      { active: true, periodMs: Number.POSITIVE_INFINITY, steps: 2 },
    ],
    ["sub-millisecond periodMs", "periodMs", { active: true, periodMs: 0.5, steps: 2 }],
    ["non-integer steps", "steps", { active: true, periodMs: 900, steps: Number.NaN }],
  ])("fails loud for invalid synchronized %s", async (_case, field, options) => {
    function InvalidPhaseProbe(): React.ReactElement {
      useSynchronizedPhase(options)
      return <Text>unreachable</Text>
    }

    const scope = createScope(`invalid-synchronized-${field}-test`)
    const render = createRenderer({ cols: 40, rows: 4 })
    expect(() => render(withScope(scope, <InvalidPhaseProbe />))).toThrow(
      new RegExp(`${field} must be`),
    )
    await scope[Symbol.asyncDispose]()
  })
})

describe("<Pulse>", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test("alternates color tokens with the pulse phase", async () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("pulse-component-test")
    const tree = () =>
      withScope(
        scope,
        <Pulse intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
          rec-dot
        </Pulse>,
      )

    const app = render(tree())
    expect(colorOf(app, "rec-dot")).toBe("$fg-error")

    await advanceTimersByTime(500)
    app.rerender(tree())
    expect(colorOf(app, "rec-dot")).toBe("$fg-muted")

    app.unmount()
    await scope[Symbol.asyncDispose]()
  })

  test("keeps late-mounted synchronized pulses on the shared phase", async () => {
    const render = createRenderer({ cols: 40, rows: 4 })
    const scope = createScope("synchronized-pulse-component-test")
    const tree = (showFirst: boolean, showSecond: boolean) =>
      withScope(
        scope,
        <>
          {showFirst ? (
            <Pulse synchronized intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
              first
            </Pulse>
          ) : null}
          {showSecond ? (
            <Pulse synchronized intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
              second
            </Pulse>
          ) : null}
        </>,
      )

    const app = render(tree(true, false))
    await vi.advanceTimersByTimeAsync(250)
    app.rerender(tree(true, true))
    expect(colorOf(app, "first")).toBe("$fg-error")
    expect(colorOf(app, "second")).toBe("$fg-error")

    await vi.advanceTimersByTimeAsync(250)
    app.rerender(tree(true, true))
    expect(colorOf(app, "first")).toBe("$fg-muted")
    expect(colorOf(app, "second")).toBe("$fg-muted")

    app.rerender(tree(false, true))
    await vi.advanceTimersByTimeAsync(499)
    app.rerender(tree(false, true))
    expect(colorOf(app, "second")).toBe("$fg-muted")

    await vi.advanceTimersByTimeAsync(1)
    app.rerender(tree(false, true))
    expect(colorOf(app, "second")).toBe("$fg-error")

    app.unmount()
    for (let i = 0; i < 3; i++) await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)
    await scope[Symbol.asyncDispose]()
  })

  test("keeps synchronized phases isolated between app scopes", async () => {
    const firstScope = createScope("first-synchronized-pulse-app")
    const firstTree = () =>
      withScope(
        firstScope,
        <Pulse synchronized intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
          first-app
        </Pulse>,
      )
    const firstApp = createRenderer({ cols: 40, rows: 4 })(firstTree())

    await vi.advanceTimersByTimeAsync(250)

    const secondScope = createScope("second-synchronized-pulse-app")
    const secondTree = () =>
      withScope(
        secondScope,
        <Pulse synchronized intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
          second-app
        </Pulse>,
      )
    const secondApp = createRenderer({ cols: 40, rows: 4 })(secondTree())

    await vi.advanceTimersByTimeAsync(250)
    firstApp.rerender(firstTree())
    secondApp.rerender(secondTree())
    expect(colorOf(firstApp, "first-app")).toBe("$fg-muted")
    expect(colorOf(secondApp, "second-app")).toBe("$fg-error")

    firstApp.unmount()
    secondApp.unmount()
    await firstScope[Symbol.asyncDispose]()
    await secondScope[Symbol.asyncDispose]()
  })

  test("owns one synchronized clock through StrictMode effect replay", async () => {
    const scope = createScope("strict-mode-synchronized-pulse-app")
    const tree = () =>
      withScope(
        scope,
        <React.StrictMode>
          <Pulse synchronized intervalMs={500} colors={["$fg-error", "$fg-muted"]}>
            strict-pulse
          </Pulse>
        </React.StrictMode>,
      )
    const app = createRenderer({ cols: 40, rows: 4, autoRender: true })(tree())

    expect(vi.getTimerCount()).toBe(1)
    await advanceTimersByTime(500)
    expect(colorOf(app, "strict-pulse")).toBe("$fg-muted")

    app.unmount()
    for (let i = 0; i < 3; i++) await Promise.resolve()
    expect(vi.getTimerCount()).toBe(0)
    await scope[Symbol.asyncDispose]()
  })
})
