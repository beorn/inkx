/**
 * UI driver for silvercode L4 tests — keystrokes + fake clock + scroll.
 *
 * Wraps `renderScenario` (apps/silvercode/src/test/render-harness.tsx) with
 * silvercode-aware conveniences that previously lived as ad-hoc helpers in
 * individual test files (raw ANSI byte feeds in keyboard-scroll, manual
 * `setTimeout` settle waits in tool-call, hand-rolled `vi.advanceTimersByTime`
 * + `app.rerender` chains in activity-indicator-style tests).
 *
 * The underlying `app` from `@silvery/test` already exposes `press`, `type`,
 * `click`, `wheel`, `resize`, etc. This driver adds the silvercode-specific
 * wiring on top:
 *
 * - `scroll(direction, lines?)` — Shift+Arrow / PageUp/Down / Home/End,
 *   the App-level intercept that routes from the focused
 *   SessionPromptComposer to ChatBlockList.scrollBy. See
 *   `apps/silvercode/tests/keyboard-scroll.test.tsx` for the underlying
 *   contract.
 *
 * - `advanceTime(ms)` — vi.advanceTimersByTime + flush React commits +
 *   rerender. Caller is responsible for `vi.useFakeTimers()` (typically
 *   AFTER `renderScenario` returns, since the harness uses real-timer
 *   `setTimeout` internally for its initial settle).
 *
 * - `settle(extraMs?)` — drain microtasks + rerender. Idempotent re-export
 *   of the harness's internal settle so tests can wait for state updates
 *   triggered by `emit()`.
 *
 * Layer 4 tests (tests/visual/, tests/inline-*, tests/keyboard-*) should
 * adopt this driver. L3 controller tests stay on `createFakeSession`
 * directly. L2 component tests use `createRenderer` from `@silvery/test`.
 *
 * Bead: @km/silvercode/test-ui-driver
 */

import { vi } from "vitest"
import type { RenderedScenarioWithDispose } from "./render-harness.tsx"

export type ScrollDirection = "up" | "down" | "pageUp" | "pageDown" | "home" | "end"

const SCROLL_KEY: Record<ScrollDirection, string> = {
  up: "Shift+ArrowUp",
  down: "Shift+ArrowDown",
  pageUp: "Shift+PageUp",
  pageDown: "Shift+PageDown",
  home: "Shift+Home",
  end: "Shift+End",
}

/**
 * Kitty keyboard protocol "Left Super (Cmd) press" / "release" byte
 * sequences. CSI u format with codepoint 57444 (left super) and modifier
 * byte 9 (super=8 + 1 implicit press); event-type `:1` = press, `:3` =
 * release.
 *
 * Held-modifier-during-dwell scenarios (the Cmd-hover popover that opens
 * after a 650 ms dwell) need these raw bytes — dwell is driven by
 * `useModifierKeys` reading the input store, not the mouse-event
 * modifier flags. For immediate-event modifier scenarios (Shift-hover,
 * Ctrl-wheel, single-event Cmd-hover assertions) prefer
 * `app.hover(x, y, { shift: true })` etc. — silvery 65282cd3 added the
 * modifier-options bag to hover/wheel for parity with click/doubleClick.
 */
export const KITTY_LEFT_SUPER_PRESS = "\x1b[57444;9:1u"
export const KITTY_LEFT_SUPER_RELEASE = "\x1b[57444;9:3u"

export type UiDriver = RenderedScenarioWithDispose & {
  /**
   * Send a Shift+Arrow / Shift+PageUp/Down / Shift+Home/End scroll. Repeats
   * `lines` times. silvercode binds these at App-level `useInput` to scroll
   * the focused ChatBlockList — see `tests/keyboard-scroll.test.tsx`.
   */
  scroll(direction: ScrollDirection, lines?: number): Promise<void>

  /**
   * Advance fake timers and flush React commits.
   *
   * Caller must have invoked `vi.useFakeTimers()` AFTER the
   * `renderScenario` call returned — the harness's initial settle uses
   * real-timer `setTimeout` and will deadlock under fake timers.
   *
   * Restoration is the caller's responsibility (`vi.useRealTimers()` in
   * `afterEach`).
   */
  advanceTime(ms: number): Promise<void>

  /**
   * Drain pending microtasks and rerender so state updates triggered by
   * `emit()` or other async paths commit before assertions.
   *
   * Mirrors the bounded settle in `render-harness.tsx`: one task tick +
   * 5 microtask drains. Higher counts mask real bugs behind extra slack.
   */
  settle(): Promise<void>

  /**
   * Cmd-hover at terminal coords (x, y) with held-modifier dwell — the
   * popover-opening recipe. Sends the Kitty Left-Super press sequence
   * via `app.stdin.write` (so `useModifierKeys` updates), hovers,
   * optionally waits for the popover delay, then settles. Caller must
   * have rendered with `kittyMode: true` — without Kitty encoding the
   * modifier press is a no-op (legacy ANSI cannot represent Cmd alone)
   * and the popover will never open.
   *
   * Cmd state remains held after `cmdHover` returns. Call `cmdRelease()`
   * before any subsequent plain hover, or before disposing the scenario
   * if the test asserts on hover-out behavior.
   *
   * The default `delayMs: 650` matches silvercode's
   * `HOVER_POPOVER_OPEN_DELAY_MS` — the threshold ToolCall waits before
   * opening the image-preview popover. Tests asserting popover content
   * should keep this default; tests asserting hover-but-no-popover (e.g.
   * partial wait) can pass a smaller value.
   *
   * For IMMEDIATE-event Cmd-hover assertions (no dwell, no
   * `useModifierKeys` involved — only `MouseEvent.metaKey` at hover
   * time) prefer `driver.app.hover(x, y, { cmd: true })` directly —
   * silvery 65282cd3 added the modifier-options bag to hover/wheel for
   * parity with click. The held-state path here exists specifically
   * because dwell-based popovers read the input store, not the
   * mouseState bag.
   */
  cmdHover(x: number, y: number, opts?: { delayMs?: number }): Promise<void>

  /**
   * Drop Cmd state by sending the Kitty Left-Super release sequence,
   * then settle. Use after a `cmdHover` assertion when the test continues
   * to drive plain hover/click events that should not be Cmd-modified.
   */
  cmdRelease(): Promise<void>
}

/**
 * Wrap a `RenderedScenarioWithDispose` (returned by `renderScenario`) in
 * the silvercode UI driver. Returns the same scenario object spread with
 * driver methods — existing tests can adopt the driver incrementally
 * without losing access to `app`, `controller`, `fake`, `emit`, etc.
 */
export function createUiDriver(scenario: RenderedScenarioWithDispose): UiDriver {
  const settle = async (): Promise<void> => {
    if (vi.isFakeTimers()) {
      await vi.advanceTimersByTimeAsync(0)
    } else {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
      })
    }
    for (let i = 0; i < 5; i++) await Promise.resolve()
    scenario.resample()
  }

  return {
    ...scenario,

    async scroll(direction: ScrollDirection, lines = 1): Promise<void> {
      const key = SCROLL_KEY[direction]
      for (let i = 0; i < lines; i++) {
        await scenario.app.press(key)
      }
      await settle()
    },

    async advanceTime(ms: number): Promise<void> {
      await vi.advanceTimersByTimeAsync(ms)
      for (let i = 0; i < 5; i++) await Promise.resolve()
      scenario.resample()
    },

    settle,

    async cmdHover(x: number, y: number, opts?: { delayMs?: number }): Promise<void> {
      const delayMs = opts?.delayMs ?? 650
      scenario.app.stdin.write(KITTY_LEFT_SUPER_PRESS)
      await scenario.app.hover(x, y)
      if (vi.isFakeTimers()) {
        await vi.advanceTimersByTimeAsync(delayMs)
      } else {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs)
        })
      }
      for (let i = 0; i < 5; i++) await Promise.resolve()
      scenario.resample()
    },

    async cmdRelease(): Promise<void> {
      scenario.app.stdin.write(KITTY_LEFT_SUPER_RELEASE)
      await settle()
    },
  }
}
