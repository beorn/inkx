/**
 * Virtual-focus promotion — Law 3 of the PTY plateau: looks-focused ≡ receives-input.
 *
 * `focusById` on a not-yet-mounted testID records VIRTUAL focus (`activeId`
 * set, `activeElement` null): the ring can paint, but key routing feeds only a
 * real focused node. Before this feature nothing promoted virtual focus when
 * the matching node arrived, so every consumer needed bespoke one-shot retry
 * effects — and a retry racing the mount (or a node mounting non-focusable and
 * flipping later) silently left panes looking focused but dead to input (the
 * hab 20989 no-click-input class).
 *
 * The law: once a focusable node whose testID matches the pending virtual
 * `activeId` is COMMITTED — fresh subtree mount or focusable-flip — the focus
 * manager promotes it to real focus with no second focus call. Promotion never
 * steals from an established REAL focus.
 */
import React from "react"
import { describe, expect, test } from "vitest"
import { createRenderer } from "@silvery/test"
import { Box, Text, useFocusManager } from "silvery"

type FocusCtl = { focus: (nodeOrId: string) => void }

/** Captures the hook INSIDE the tree — useFocusManager's string-focus derives
 *  the root by walking up from NodeContext, which is absent at the root
 *  component level (mirrors real consumers like PaneGrid, which live under
 *  the pane tree). */
function CtlProbe({ ctl }: { ctl: { current: FocusCtl | null } }): React.ReactElement {
  const fm = useFocusManager()
  ctl.current = { focus: fm.focus }
  return <Text>probe</Text>
}

function Harness({
  show,
  targetFocusable,
  ctl,
  withOther = false,
}: {
  show: boolean
  targetFocusable: boolean
  ctl: { current: FocusCtl | null }
  withOther?: boolean
}): React.ReactElement {
  return (
    <Box flexDirection="column">
      <Box>
        <CtlProbe ctl={ctl} />
      </Box>
      {withOther ? <Box testID="other-pane" focusable height={1} /> : null}
      {show ? <Box testID="pane-x" focusable={targetFocusable} height={2} /> : null}
    </Box>
  )
}

describe("virtual focus promotes to the real node (20992 f2)", () => {
  test("focus intent lands BEFORE the node mounts → mount promotes it, no second focus call", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const ctl: { current: FocusCtl | null } = { current: null }
    const app = render(<Harness show={false} targetFocusable ctl={ctl} />)

    ctl.current?.focus("pane-x")
    // The window under test: virtual focus is recorded, no backing node.
    expect(app.focusManager.activeId).toBe("pane-x")
    expect(app.focusManager.activeElement).toBeNull()

    app.rerender(<Harness show targetFocusable ctl={ctl} />)

    // The committed subtree carries the matching focusable node — promotion
    // must happen from the commit itself, with no retry from the consumer.
    expect(app.focusManager.activeId).toBe("pane-x")
    expect(app.focusManager.activeElement).not.toBeNull()
    expect((app.focusManager.activeElement?.props as { testID?: string }).testID).toBe("pane-x")
  })

  test("node exists but is not yet focusable → the focusable flip promotes it", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const ctl: { current: FocusCtl | null } = { current: null }
    const app = render(<Harness show targetFocusable={false} ctl={ctl} />)

    ctl.current?.focus("pane-x")
    // Found but unfocusable → the call falls into the virtual arm.
    expect(app.focusManager.activeId).toBe("pane-x")
    expect(app.focusManager.activeElement).toBeNull()

    app.rerender(<Harness show targetFocusable ctl={ctl} />)

    expect(app.focusManager.activeId).toBe("pane-x")
    expect(app.focusManager.activeElement).not.toBeNull()
    expect((app.focusManager.activeElement?.props as { testID?: string }).testID).toBe("pane-x")
  })

  test("promotion never steals from an established real focus", () => {
    const render = createRenderer({ cols: 40, rows: 10 })
    const ctl: { current: FocusCtl | null } = { current: null }
    const app = render(<Harness show={false} targetFocusable ctl={ctl} withOther />)

    ctl.current?.focus("other-pane")
    expect(app.focusManager.activeId).toBe("other-pane")
    expect(app.focusManager.activeElement).not.toBeNull()

    // A pane-x mount must not disturb the real focus on other-pane.
    app.rerender(<Harness show targetFocusable ctl={ctl} withOther />)

    expect(app.focusManager.activeId).toBe("other-pane")
    expect((app.focusManager.activeElement?.props as { testID?: string }).testID).toBe("other-pane")
  })
})
