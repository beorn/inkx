/**
 * @failure Terminal-target consumers (multi-pane apps verifying per-pane
 *   `contain` selection scopes) need the selection-scope resolvers, but
 *   silvery/term exported only the mouse-event constructors — the resolvers
 *   were reachable solely through @silvery/ag-term internals, which standalone
 *   consumers cannot import.
 * @level l1
 * @consumer silvery/term subpath surface
 */
import { describe, expect, it } from "vitest"
import { findContainBoundary, hitTest, resolveUserSelect, selectionHitTest } from "silvery/term"

describe("silvery/term selection-scope surface", () => {
  it("exports the selection-scope resolvers alongside the mouse-event surface", () => {
    expect(typeof findContainBoundary).toBe("function")
    expect(typeof resolveUserSelect).toBe("function")
    expect(typeof selectionHitTest).toBe("function")
    expect(typeof hitTest).toBe("function")
  })
})
