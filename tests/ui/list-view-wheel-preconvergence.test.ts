/**
 * @failure  wheel/scroll intent arriving in ListView's layout-bootstrap window
 *           (maxScrollRow 0 because pixel measurement hasn't landed) is silently
 *           dropped — the silvercode post-resume "first trackpad flick does
 *           nothing" report — OR the defer gate keys on the WRONG height
 *           authority and becomes dead code (the parked first cut gated on
 *           followEndContentRows, whose count-space bootstrap fallback is
 *           positive for every populated list).
 * @level    l1
 * @consumer @km/code/trackpad-wheel-not-scrolling/21184-listview-wheel-preconv
 */

import { describe, expect, test } from "vitest"
import {
  EMPTY_PRECONVERGENCE,
  enqueuePreconvergenceWheel,
  PRECONVERGENCE_REPLAY_WINDOW_MS,
  PRECONVERGENCE_WHEEL_QUEUE_MAX,
  recordPreconvergenceFracIntent,
  shouldDeferPreconvergence,
  takePreconvergenceReplay,
  type PreconvergenceState,
} from "../../packages/ag-react/src/ui/components/list-view/wheel-preconvergence.ts"

describe("shouldDeferPreconvergence — THE 21184 discriminator", () => {
  test("defers during the layout-bootstrap window: unscrollable AND unmeasured", () => {
    expect(shouldDeferPreconvergence({ maxScrollRow: 0, layoutContentRows: 0 })).toBe(true)
  })

  test("a MEASURED list that genuinely fits drops the intent (real no-op, not a transient)", () => {
    expect(shouldDeferPreconvergence({ maxScrollRow: 0, layoutContentRows: 8 })).toBe(false)
  })

  test("a scrollable list never defers — the normal wheel path owns it", () => {
    expect(shouldDeferPreconvergence({ maxScrollRow: 12, layoutContentRows: 40 })).toBe(false)
    // Count-space estimates can make maxScrollRow positive before measurement
    // lands; that path scrolls normally and must not detour through the queue.
    expect(shouldDeferPreconvergence({ maxScrollRow: 12, layoutContentRows: 0 })).toBe(false)
  })

  test("PERMANENT REGRESSION (the parked first cut's false discriminator): a populated-but-unmeasured list MUST defer", () => {
    // The parked WIP gated on `followEndContentRows <= 0`. That authority falls
    // back to COUNT-SPACE rows at bootstrap, so for the canonical 40-item probe
    // fixture it read ~40 (> 0) while pixel measurement was still pending — the
    // gate refused, the queue was dead code for every populated list, and only
    // a zero-height-items probe (items that NEVER measure, so nothing is ever
    // replayable) appeared to pass against pristine code. The corrected gate
    // keys on the pixel-space authority alone: for that exact fixture state —
    // estimate-positive, measurement-pending, maxScrollRow 0 (estimate
    // undershoot: count-space says fits) — deferral MUST engage.
    const populatedUnmeasured = { maxScrollRow: 0, layoutContentRows: 0 }
    const wrongDiscriminatorWouldRefuse = 40 // followEndContentRows' count-space fallback for 40 items
    expect(wrongDiscriminatorWouldRefuse).toBeGreaterThan(0)
    expect(shouldDeferPreconvergence(populatedUnmeasured)).toBe(true)
  })
})

describe("enqueue — bounded, expiring, timer-free", () => {
  test("keeps at most the newest QUEUE_MAX packets (oldest out)", () => {
    let state: PreconvergenceState = EMPTY_PRECONVERGENCE
    for (let i = 0; i < PRECONVERGENCE_WHEEL_QUEUE_MAX + 3; i++) {
      state = enqueuePreconvergenceWheel(state, { deltaY: i }, 1_000 + i)
    }
    expect(state.queue).toHaveLength(PRECONVERGENCE_WHEEL_QUEUE_MAX)
    expect(state.queue[0]?.deltaY).toBe(3)
    expect(state.queue.at(-1)?.deltaY).toBe(PRECONVERGENCE_WHEEL_QUEUE_MAX + 2)
  })

  test("packets past the replay window are dropped at enqueue time", () => {
    let state = enqueuePreconvergenceWheel(EMPTY_PRECONVERGENCE, { deltaY: 1 }, 1_000)
    state = enqueuePreconvergenceWheel(
      state,
      { deltaY: 2 },
      1_000 + PRECONVERGENCE_REPLAY_WINDOW_MS + 1,
    )
    expect(state.queue.map((p) => p.deltaY)).toEqual([2])
  })
})

describe("frac intent — absolute takeover, latest wins", () => {
  test("a newer frac intent replaces an older one", () => {
    let state = recordPreconvergenceFracIntent(
      EMPTY_PRECONVERGENCE,
      { frac: 0.2, rearmFollowAtEnd: true },
      1_000,
    )
    state = recordPreconvergenceFracIntent(state, { frac: 0.9, rearmFollowAtEnd: false }, 1_100)
    expect(state.fracIntent).toMatchObject({ frac: 0.9, rearmFollowAtEnd: false })
  })
})

describe("takeReplay — one-shot drain, stale intent never haunts the viewport", () => {
  test("fresh packets and a fresh frac intent replay in order; the state empties", () => {
    let state = enqueuePreconvergenceWheel(EMPTY_PRECONVERGENCE, { deltaY: 3 }, 1_000)
    state = enqueuePreconvergenceWheel(state, { deltaY: 5 }, 1_050)
    state = recordPreconvergenceFracIntent(state, { frac: 0.5, rearmFollowAtEnd: true }, 1_060)
    const replay = takePreconvergenceReplay(state, 1_200)
    expect(replay.packets.map((p) => p.deltaY)).toEqual([3, 5])
    expect(replay.fracIntent).toMatchObject({ frac: 0.5 })
    expect(replay.state).toEqual(EMPTY_PRECONVERGENCE)
    // One-shot: draining the drained state yields nothing.
    const again = takePreconvergenceReplay(replay.state, 1_201)
    expect(again.packets).toHaveLength(0)
    expect(again.fracIntent).toBeNull()
  })

  test("the zero-height-fixture conversion: intent that never becomes replayable expires instead of replaying late", () => {
    // The probe fixture whose items never measure (height-0 renderItem) keeps
    // BOTH authorities at 0 forever — deferral engages but convergence never
    // arrives. The queue must not hold that intent past the replay window: a
    // wheel replayed seconds later reads as a haunted viewport.
    let state = enqueuePreconvergenceWheel(EMPTY_PRECONVERGENCE, { deltaY: 5 }, 1_000)
    state = recordPreconvergenceFracIntent(state, { frac: 1, rearmFollowAtEnd: true }, 1_000)
    const replay = takePreconvergenceReplay(state, 1_000 + PRECONVERGENCE_REPLAY_WINDOW_MS + 1)
    expect(replay.packets).toHaveLength(0)
    expect(replay.fracIntent).toBeNull()
  })
})
