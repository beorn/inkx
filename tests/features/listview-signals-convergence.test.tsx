/**
 * ListView signals refactor — convergence + first-paint lockdown.
 *
 * Tests for the migration of ListView's viewport tracking from
 * `useState` + `onLayout` callbacks to `getLayoutSignals(node).boxRectCommitted()`.
 *
 * Background. The previous implementation captured the outer + inner Box
 * dimensions through `useState`-driven `onLayout` callbacks. Each callback
 * fired during the layout-phase notify pass and called `setState`, which
 * scheduled a React commit. The renderer's bounded convergence loop
 * (`MAX_CONVERGENCE_PASSES`, see `pass-cause.ts`) capped the number of
 * passes — so layouts with the height-independent ListView shape
 * (silvercode chat) needed 3+ passes to settle, while the cap admits 2.
 * The structural tail of that bug: scrollbar invisible until the user
 * triggered a re-render (e.g. by submitting the first prompt).
 *
 * The fix reads `boxRectCommitted` synchronously during render — the
 * committed signal is invariant across every convergence pass within one
 * batch (see `commitLayoutSnapshot` in
 * `vendor/silvery/packages/ag/src/layout-signals.ts`). A render that BOTH
 * reads the rect AND writes a layout-affecting prop based on it converges
 * in one pass, eliminating the feedback edge.
 *
 * Bead: `@km/silvery/listview-layout-signals-from-getlayoutsignals`.
 *
 * Companion bridge mitigation: silvercode's
 * `apps/silvercode/src/components/ChatBlockList.tsx` `estimateHeight={3}`
 * (commit 06b9a088d) papers over the pre-fix convergence symptom for the
 * scrollbar-visibility surface specifically. With this refactor landed the
 * bridge is no longer load-bearing — it's defense-in-depth.
 */

import React from "react"
import { describe, test, expect } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text } from "@silvery/ag-react"
import { ListView } from "../../packages/ag-react/src/ui/components/ListView"

const THUMB_EIGHTHS = new Set(["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"])

function makeItems(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `item ${i}`)
}

function findThumbCell(
  app: { cell: (col: number, row: number) => { char: string } },
  cols: number,
  rows: number,
): { col: number; row: number } | null {
  // Thumb renders in the rightmost interior column (the absolute scrollbar
  // overlay). Walk every row of the rightmost column for a thumb glyph.
  const col = cols - 1
  for (let r = 0; r < rows; r++) {
    if (THUMB_EIGHTHS.has(app.cell(col, r).char)) return { col, row: r }
  }
  return null
}

describe("ListView signals refactor — convergence", () => {
  test("first-paint scrollbar visibility (height-independent, no estimateHeight)", () => {
    // The exact silvercode shape: ListView wrapped in a flexGrow container,
    // no `height` prop, no `estimateHeight` prop. With the prior
    // useState+onLayout chain, the scrollbar's geometry depended on the
    // inner Box's `viewportSize.h` reaching the renderer through a chain
    // of setState calls — by `MAX_CONVERGENCE_PASSES`, the chain was still
    // mid-flight, so the scrollbar gate computed against a stale viewport
    // height of 1 and the thumb didn't render until a subsequent batch.
    //
    // With the signals refactor, the outer Box's `boxRectCommitted` is read
    // synchronously during the SAME render that consumes it — the height
    // is known on the first batch's commit, the scrollbar gate evaluates
    // correctly, and the thumb appears on the first painted frame.
    //
    // We check after `app.rerender` to exercise the commit-boundary signal
    // path explicitly: a fresh renderer commits its initial layout and any
    // subsequent re-render reads the committed value.
    const COLS = 60
    const ROWS = 20
    const items = makeItems(200)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ items: it }: { items: string[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView items={it} nav renderItem={(item) => <Text>{item}</Text>} />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness items={items} />)
    // `auto-flash` fires `setIsScrolling(true)` when item count grows; force
    // it via a rerender with the same items to enter the visible-scrollbar
    // window. The exact timing is downstream of the convergence question:
    // we're verifying that ONCE the gate is asked, the thumb renders.
    app.rerender(<Harness items={makeItems(items.length + 1)} />)
    expect(findThumbCell(app, COLS, ROWS)).not.toBeNull()
  })

  test("bounded settle — strict mode does not trip with height-independent ListView", () => {
    // The renderer's bounded-convergence assertion fires under
    // `SILVERY_STRICT` when the layout loop exceeds `MAX_CONVERGENCE_PASSES`.
    // SILVERY_STRICT=1 is on by default in this test setup (see km-tui
    // CLAUDE.md). The pre-refactor implementation was a known offender for
    // this exact shape — the test would either fail (STRICT=2) or emit a
    // stderr warning that the harness flagged.
    //
    // We render the height-independent ListView shape with overflowing
    // content and assert the harness completes WITHOUT a render error.
    const COLS = 60
    const ROWS = 20
    const items = makeItems(200)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    expect(() => {
      render(
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView items={items} nav renderItem={(item) => <Text>{item}</Text>} />
          </Box>
        </Box>,
      )
    }).not.toThrow()
  })

  test("follow=end snap waits for measured viewport (no phantom snap on first paint)", () => {
    // Per /pro audit (session c288c217 review): the follow="end" snap must
    // not fire when `viewportSize.h === 0` — otherwise it sees `maxRow = 0`
    // (because `scrollableRows = max(0, totalRowsMeasured - viewportHeight)`
    // collapses), pins to the (false) bottom, and clears `pendingFollowSnap`.
    // The next frame, when the viewport finally measures, the snap is
    // already cleared and the user sees a frozen near-top viewport.
    //
    // The signals refactor doesn't change the snap math, but it changes WHEN
    // a non-zero viewport reaches the snap gate (now: same batch as the first
    // committed layout). This test asserts the gate is intact and that the
    // last item is visible after a follow="end" first paint.
    const COLS = 60
    const ROWS = 20
    const items = makeItems(50)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView items={items} follow="end" renderItem={(item) => <Text>{item}</Text>} />
        </Box>
      </Box>,
    )

    // Tail item visible on first paint. The exact item-49 string would land
    // on the last visible row when follow="end" snaps to the tail correctly.
    expect(app.text).toContain("item 49")
  })

  test("fitWidth composition — height-independent ListView nested in fitWidth lane chooser", () => {
    // The post-A0.7 substrate: `<Box fitWidth>` resolves the lane in flexily's
    // single-pass layout (no phantom subtree, no React round-trip). The
    // composition concern is the same as the prior AutoFit-flavored test:
    // when a lane-snapping wrapper sits between a flexGrow container and a
    // height-independent ListView, the ListView's viewport-rect signals
    // settle in one batch and content paints on the first frame.
    //
    // Pre-A0.7 this test exercised AutoFit's phantom→visible transition;
    // with that machinery deleted, the engine-native fitWidth path is the
    // canonical lane chooser, and this test pins the same composition
    // invariant against it.
    const COLS = 80
    const ROWS = 20
    const items = makeItems(50)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <Box fitWidth={[40, 60, 80]} alignSelf="flex-start" minWidth={0}>
            <ListView items={items} nav renderItem={(item) => <Text>{item}</Text>} />
          </Box>
        </Box>
      </Box>,
    )

    // The lane Box sets its used inline-size in one layout pass; ListView's
    // viewport-rect signal is a committed value by the time it consumes it
    // — same batch, no race. visible-text assertion is sufficient to verify
    // the composition didn't throw or render an empty viewport.
    expect(app.text).toContain("item 0")
    expect(app.text).toContain("item 1")
  })

  test("auto-flash scrollbar appears on first paint when content overflows (height-independent)", () => {
    // Bead: @km/code/trackpad-scrolling-no-scrollbar.
    // `prevItemCountRef` initialises to 0 (NOT `activeItems.length`) so a
    // ListView that mounts with items already present (resumed chat, server-
    // rendered list, etc.) sees the 0→N transition as "items grew" and
    // fires the auto-flash. The prior `useRef(activeItems.length)` init
    // meant ListView treated "already 50 items on first paint" as the
    // steady state — no flash, scrollbar invisible until the user wheeled.
    //
    // The semantically correct behavior: if N items overflow the viewport
    // on first paint, the scrollbar should flash, telling the user "there
    // is more content above/below this viewport." Without the flash, the
    // user can't tell whether content overflows until they try to scroll.
    const COLS = 60
    const ROWS = 20
    const initialItems = makeItems(50)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ items: it }: { items: string[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView items={it} nav renderItem={(item) => <Text>{item}</Text>} />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness items={initialItems} />)
    // First-paint flash: scrollbar visible immediately because 50 items
    // overflow a 20-row viewport.
    expect(findThumbCell(app, COLS, ROWS)).not.toBeNull()

    // Grow further — flash re-fires (same auto-hide timer cycles).
    app.rerender(<Harness items={makeItems(150)} />)
    expect(findThumbCell(app, COLS, ROWS)).not.toBeNull()
  })

  test("silvercode shape — items appear AFTER first render, scrollbar visible without input", async () => {
    // Bead: @km/code/trackpad-scrolling-no-scrollbar.
    //
    // The exact silvercode resumed-session shape: ListView mounts initially
    // with zero items (Welcome screen path), then the controller's projected
    // events land via setState and the ListView re-renders with a large
    // overflowing item array. With `prevItemCountRef = useRef(0)` (NOT
    // `useRef(activeItems.length)`), the 0→N transition is detected and
    // `flashScrollbar` fires — scrollbar visible WITHOUT a wheel or submit.
    //
    // Mirrors the live-repro at apps/silvercode/src/test/live-repro.ts:
    // run() mounts the app with empty items, then 60 turns emit synchronously
    // and React batches them into one re-render. ListView sees 0 → 121.
    //
    // Configuration mirrors silvercode's ChatBlockList:
    //   follow="end", gap=0, nav=false, no estimateHeight.
    const COLS = 60
    const ROWS = 20
    const render = createRenderer({ cols: COLS, rows: ROWS })

    function Harness({ items: it }: { items: string[] }): React.ReactElement {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView
              items={it}
              getKey={(item) => item}
              gap={0}
              nav={false}
              follow="end"
              renderItem={(item) => <Text>{item}</Text>}
            />
          </Box>
        </Box>
      )
    }

    // Initial mount with EMPTY items (Welcome path).
    const app = render(<Harness items={[]} />)
    // Empty → no scrollbar (no content to scroll over).
    expect(findThumbCell(app, COLS, ROWS)).toBeNull()

    // Items "stream in" — re-render with 60 items. This mirrors the
    // resume-session path where the controller's projected events land
    // after mount.
    app.rerender(<Harness items={makeItems(60)} />)

    // Scrollbar visible on the very next paint — no wheel, no submit, no
    // app.press. The auto-flash on the 0→60 transition fires.
    expect(
      findThumbCell(app, COLS, ROWS),
      "scrollbar must be visible on first paint after items stream in (resumed-session shape)",
    ).not.toBeNull()
  })

  test("wheel scrolls immediately on first paint (no first-prompt-submit needed)", async () => {
    // The user-reported trackpad-wheel-not-scrolling symptom: at first
    // paint in silvercode's resumed-session shape, wheel events were
    // silently dropped by `handleWheel`'s `if (maxRow <= 0) return` gate
    // because `maxScrollRowRef` hadn't been written yet — the layout-
    // height convergence chain needed 3+ commits to settle but the
    // renderer's MAX_CONVERGENCE_PASSES is 2. Users had to submit a
    // prompt (forcing another render) before wheel started working.
    //
    // With the signals refactor the outer Box's `boxRectCommitted`
    // resolves in the same batch as the first paint, so by the time
    // the first wheel event arrives `maxScrollRowRef` is already
    // populated. Asserts wheel produces forward scroll on first paint —
    // without an intervening `rerender` or input.
    const COLS = 60
    const ROWS = 20
    const items = makeItems(100)
    const render = createRenderer({ cols: COLS, rows: ROWS })

    const app = render(
      <Box width={COLS} height={ROWS} flexDirection="column">
        <Box flexGrow={1} flexShrink={1} minHeight={0}>
          <ListView
            items={items}
            nav
            getKey={(item) => item}
            renderItem={(item) => <Text>{item}</Text>}
          />
        </Box>
      </Box>,
    )

    // Item 0 visible on first paint.
    expect(app.text).toContain("item 0")
    // The top item before scrolling — we verify it leaves the viewport
    // after wheel-down. If `handleWheel` drops on `maxRow <= 0`, the
    // viewport doesn't move and item 0 remains visible.
    const textBeforeWheel = app.text

    // Wheel-down at viewport center — 5 deltaY rows worth. With the
    // refactor, this advances the visible window past item 0.
    await app.wheel(5, ROWS / 2, 5)

    // After wheel, the text frame has changed and item 0 should be off
    // the top of the viewport (replaced by a later item). The exact
    // boundary depends on item heights, but the frame MUST differ from
    // the pre-wheel snapshot — proving the wheel was not dropped.
    expect(
      app.text,
      `wheel produced no frame change — handleWheel likely dropped on maxRow<=0:\n${app.text}`,
    ).not.toBe(textBeforeWheel)
  })

  test("a wheel during the zero-content-rows window is deferred and replayed on convergence (21184)", async () => {
    // The residual latent window behind the trackpad symptom: a wheel packet
    // that arrives while `followEndContentRows` is still 0 (content
    // unmeasured — the first convergence commits in the live app) used to be
    // dropped by `handleWheel`'s `maxRow <= 0` gate, silently losing user
    // intent. The deterministic stand-in for that ms-scale transient: rows
    // that measure to zero height occupy the frame with a zero-row content
    // model; flipping them to real rows drives the same
    // `scrollableRows 0 → positive` transition the live convergence chain
    // produces. The deferred packet must replay: the viewport lands where
    // the converged-first-paint test above lands after the same wheel.
    const COLS = 40
    const ROWS = 12
    const items = makeItems(40)
    const render = createRenderer({ cols: COLS, rows: ROWS })
    function Harness({ measured }: { measured: boolean }) {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView
              items={items}
              nav
              getKey={(item) => item}
              renderItem={(item) => (measured ? <Text>{item}</Text> : <Box height={0} />)}
            />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness measured={false} />)
    await app.wheel(COLS / 2, ROWS / 2, 5)
    app.rerender(<Harness measured={true} />)

    const topVisible = app.text.split("\n").find((line) => line.trim() !== "")
    expect(
      topVisible,
      `deferred wheel was not replayed — viewport still at the top:\n${app.text}`,
    ).toContain("item 5")
  })

  test("a wheel on a MEASURED list whose content fits stays a genuine no-op (21184 discriminator)", async () => {
    // The other side of the defer discriminator: content is measured and
    // simply fits the viewport (followEndContentRows > 0, maxRow == 0).
    // That wheel is a real no-op — it must NOT be queued, so growing the
    // list later never replays a stale gesture into the new content.
    const COLS = 40
    const ROWS = 12
    const render = createRenderer({ cols: COLS, rows: ROWS })
    function Harness({ count }: { count: number }) {
      return (
        <Box width={COLS} height={ROWS} flexDirection="column">
          <Box flexGrow={1} flexShrink={1} minHeight={0}>
            <ListView
              items={makeItems(count)}
              nav
              getKey={(item) => item}
              renderItem={(item) => <Text>{item}</Text>}
            />
          </Box>
        </Box>
      )
    }

    const app = render(<Harness count={3} />)
    expect(app.text).toContain("item 0")
    await app.wheel(COLS / 2, ROWS / 2, 5)
    app.rerender(<Harness count={40} />)

    const topVisible = app.text.split("\n").find((line) => line.trim() !== "")
    expect(
      topVisible,
      `fits-wheel leaked into the defer queue and replayed after growth:\n${app.text}`,
    ).toContain("item 0")
  })
})
