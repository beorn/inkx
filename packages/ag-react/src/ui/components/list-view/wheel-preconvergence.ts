/**
 * Pre-convergence wheel defer-and-replay — pure state for ListView's
 * layout-bootstrap window (@km/code/trackpad-wheel-not-scrolling/21184).
 *
 * The failure: a wheel/scroll intent that arrives while `maxScrollRow` still
 * reads 0 was silently dropped. For a list whose layout has genuinely
 * converged that is a real no-op (content fits). But during the LAYOUT
 * BOOTSTRAP WINDOW — the first commits before pixel measurement lands, when
 * `useScrollState().contentHeight` is still 0 — the drop throws away real
 * user intent (the silvercode post-resume "first trackpad flick does
 * nothing" report).
 *
 * THE DISCRIMINATOR is `layoutContentRows <= 0` (pixel-space measurement has
 * not landed), never `followEndContentRows`: the follow-end authority falls
 * back to COUNT-SPACE estimates at bootstrap, so it reads positive for any
 * populated list and can also read positive-but-fitting on estimate
 * UNDERSHOOT (few tall items — count-space says fits while measurement will
 * say overflows). The first cut of this feature gated on
 * `followEndContentRows <= 0` and was therefore dead code for every real
 * flow — reachable only with `items: []`, where no wheel ever hit-tests the
 * list. A zero-height-items probe fixture "passed" against pristine code and
 * exposed the false discriminator; that finding is pinned as a permanent
 * regression test next to this module.
 *
 * Mechanics (unchanged from the reviewed design): a tiny bounded queue —
 * a trackpad burst from the few unmeasured commits — with expiry checked at
 * enqueue AND replay time instead of timers (timer state across re-renders
 * caused the stuck-flash class), plus a latest-wins absolute frac intent.
 * Replaying a wheel seconds later reads as a haunted viewport, so packets
 * older than the replay window are stale intent and drop.
 *
 * Pure module: no React, no refs, no clocks — callers pass `nowMs`. The
 * component owns one ref holding `PreconvergenceState` and calls these
 * transitions; every branch is unit-testable without a render.
 */

export const PRECONVERGENCE_WHEEL_QUEUE_MAX = 8
export const PRECONVERGENCE_REPLAY_WINDOW_MS = 500

export interface PreconvergenceWheelPacket {
  readonly deltaY: number
  readonly timeStamp?: number
  /** Enqueue time (ms clock provided by the caller). */
  readonly at: number
}

export interface PreconvergenceFracIntent {
  readonly frac: number
  readonly rearmFollowAtEnd: boolean
  readonly at: number
}

export interface PreconvergenceState {
  readonly queue: readonly PreconvergenceWheelPacket[]
  readonly fracIntent: PreconvergenceFracIntent | null
}

export const EMPTY_PRECONVERGENCE: PreconvergenceState = { queue: [], fracIntent: null }

/**
 * True while a dropped-by-maxRow intent should be DEFERRED instead: the list
 * is not scrollable yet AND pixel measurement has not landed. Once
 * `layoutContentRows > 0` the list is measured — a 0 maxScrollRow then means
 * the content genuinely fits and the intent is a real no-op.
 */
export function shouldDeferPreconvergence(input: {
  readonly maxScrollRow: number
  readonly layoutContentRows: number
}): boolean {
  return input.maxScrollRow <= 0 && input.layoutContentRows <= 0
}

function freshOnly(
  packets: readonly PreconvergenceWheelPacket[],
  nowMs: number,
): PreconvergenceWheelPacket[] {
  return packets.filter((packet) => nowMs - packet.at <= PRECONVERGENCE_REPLAY_WINDOW_MS)
}

/** Enqueue one wheel packet: expired packets drop, the queue stays bounded (oldest out). */
export function enqueuePreconvergenceWheel(
  state: PreconvergenceState,
  packet: { readonly deltaY: number; readonly timeStamp?: number },
  nowMs: number,
): PreconvergenceState {
  const queue = freshOnly(state.queue, nowMs)
  queue.push({ deltaY: packet.deltaY, timeStamp: packet.timeStamp, at: nowMs })
  while (queue.length > PRECONVERGENCE_WHEEL_QUEUE_MAX) queue.shift()
  return { queue, fracIntent: state.fracIntent }
}

/** Record an absolute position intent — latest wins (it is a takeover, not a delta). */
export function recordPreconvergenceFracIntent(
  state: PreconvergenceState,
  intent: { readonly frac: number; readonly rearmFollowAtEnd: boolean },
  nowMs: number,
): PreconvergenceState {
  return {
    queue: state.queue,
    fracIntent: { frac: intent.frac, rearmFollowAtEnd: intent.rearmFollowAtEnd, at: nowMs },
  }
}

export interface PreconvergenceReplay {
  readonly state: PreconvergenceState
  readonly packets: readonly PreconvergenceWheelPacket[]
  readonly fracIntent: PreconvergenceFracIntent | null
}

/**
 * Drain everything replayable at `nowMs`: fresh packets in arrival order and
 * a fresh frac intent (stale entries drop silently — they are expired user
 * intent, and replaying them reads as a haunted viewport). The returned
 * state is always empty: replay is one-shot per convergence transition.
 */
export function takePreconvergenceReplay(
  state: PreconvergenceState,
  nowMs: number,
): PreconvergenceReplay {
  const packets = freshOnly(state.queue, nowMs)
  const fracIntent =
    state.fracIntent !== null && nowMs - state.fracIntent.at <= PRECONVERGENCE_REPLAY_WINDOW_MS
      ? state.fracIntent
      : null
  return { state: EMPTY_PRECONVERGENCE, packets, fracIntent }
}
