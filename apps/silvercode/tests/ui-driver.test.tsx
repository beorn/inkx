/**
 * Smoke tests for the UI driver — verifies the keystrokes / scroll / fake-clock
 * facade composes correctly with `renderScenario` and behaves as documented.
 *
 * The driver itself is mostly proxying to silvery's `app.press()` /
 * `app.type()` plus `vi.advanceTimersByTime` plus a settle helper; these
 * tests exist to ensure the wiring stays correct under refactors and that
 * the documented API is exercised at least once.
 *
 * Bead: @km/silvercode/test-ui-driver
 */

import React from "react"
import { afterEach, describe, expect, test, vi } from "vitest"
import { renderScenario } from "../src/test/render-harness.tsx"
import { createUiDriver } from "../src/test/ui-driver.ts"
import { helloWorld } from "../src/test/scripts/helloWorld.ts"
import { welcome } from "../src/test/scripts/welcome.ts"

describe("createUiDriver", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  test("exposes the scenario surface plus driver methods", async () => {
    const scenario = await renderScenario({ script: welcome })
    const driver = createUiDriver(scenario)

    expect(typeof driver.app).toBe("object")
    expect(typeof driver.controller).toBe("object")
    expect(typeof driver.emit).toBe("function")
    expect(typeof driver.scroll).toBe("function")
    expect(typeof driver.advanceTime).toBe("function")
    expect(typeof driver.settle).toBe("function")
    expect(typeof driver.dispose).toBe("function")

    driver.dispose()
  })

  test("settle drains microtasks and resamples the frame", async () => {
    const scenario = await renderScenario({ script: helloWorld })
    const driver = createUiDriver(scenario)

    // After the scripted helloWorld events, the rendered text should
    // contain the assistant's "Hi!". helloWorld already settles via the
    // harness's autoEmit path; this verifies driver.settle() is a
    // no-op on already-quiescent state.
    await driver.settle()
    expect(driver.text).toContain("Hi")

    driver.dispose()
  })

  test("scroll repeats Shift+ArrowUp the requested number of times", async () => {
    const scenario = await renderScenario({ script: welcome })
    const driver = createUiDriver(scenario)

    // We can't observe scroll wiring without enough chat content to
    // overflow the viewport (that's the keyboard-scroll.test.tsx job).
    // What we CAN verify here is that scroll() doesn't throw on a quiet
    // scenario — i.e. the key dispatch reaches the App without an
    // unhandled exception, and settle completes.
    await driver.scroll("up", 3)
    await driver.scroll("pageDown")
    await driver.scroll("home")

    driver.dispose()
  })

  test("advanceTime drives setTimeout-driven UX deterministically", async () => {
    const scenario = await renderScenario({ script: welcome })
    const driver = createUiDriver(scenario)

    // Switch to fake timers AFTER renderScenario settles. The harness's
    // initial settle uses real-timer setTimeout — under fake timers it
    // would deadlock waiting for an advance that never comes.
    vi.useFakeTimers()

    let fired = false
    setTimeout(() => {
      fired = true
    }, 250)

    await driver.advanceTime(100)
    expect(fired).toBe(false)

    await driver.advanceTime(200)
    expect(fired).toBe(true)

    driver.dispose()
  })
})
