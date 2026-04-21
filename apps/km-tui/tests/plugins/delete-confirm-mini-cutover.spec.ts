/**
 * Parity tests — DeleteConfirm via legacy path vs TEA plugin path.
 *
 * Every behavior the legacy path has (open on Backspace, Enter confirms,
 * Escape cancels, click-outside dismisses) must hold identically on the
 * plugin path when KM_TEA_DELETE_CONFIRM=1. Both paths share the same
 * assertions — the only variable is which store the render observes.
 *
 * DeleteConfirm is the simplest remaining Phase 1 dialog: no text input,
 * no focus scope, pure confirm/cancel. See
 * `hub/km/tea-phase1-withDialogs-scope.md` for the dialog inventory.
 */
import { beforeEach, describe, expect, test } from "vitest"
import { item } from "../helpers/board-test.ts"
import { createTestApp } from "../helpers/test-app.ts"
import { getDeleteConfirmStore, resetDeleteConfirmStore } from "../../src/plugins/with-delete-confirm.ts"

// ---------------------------------------------------------------------------
// Helper: run a test body against both paths (legacy + plugin)
// ---------------------------------------------------------------------------

function withBothPaths(name: string, body: (flagOn: boolean) => void): void {
  describe(name, () => {
    test("legacy path (KM_TEA_DELETE_CONFIRM unset)", () => {
      const prev = process.env.KM_TEA_DELETE_CONFIRM
      delete process.env.KM_TEA_DELETE_CONFIRM
      try {
        body(false)
      } finally {
        if (prev !== undefined) process.env.KM_TEA_DELETE_CONFIRM = prev
      }
    })

    test("plugin path (KM_TEA_DELETE_CONFIRM=1)", () => {
      const prev = process.env.KM_TEA_DELETE_CONFIRM
      process.env.KM_TEA_DELETE_CONFIRM = "1"
      resetDeleteConfirmStore()
      try {
        body(true)
      } finally {
        if (prev === undefined) delete process.env.KM_TEA_DELETE_CONFIRM
        else process.env.KM_TEA_DELETE_CONFIRM = prev
        resetDeleteConfirmStore()
      }
    })
  })
}

// ---------------------------------------------------------------------------
// Parity tests — each must pass on both paths
// ---------------------------------------------------------------------------

describe("DeleteConfirm — mini-cutover parity", () => {
  beforeEach(() => {
    resetDeleteConfirmStore()
  })

  withBothPaths("Backspace on node with children opens the confirm dialog", (flagOn) => {
    using app = createTestApp(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("other"))),
    )
    app.expect("#parent[data-cursor]").toExist()

    app.press("Backspace")

    // Dialog visible — text shown on screen through whichever path is active.
    expect(app).toContainText("Delete")
    expect(app).toContainText("parent")
    expect(app).toContainText("will be deleted")

    // Legacy ui state reflects the payload.
    app.withStore((s) => {
      expect(s.ui.deleteConfirm).not.toBeNull()
      expect(s.ui.deleteConfirm?.title).toBe("parent")
      expect(s.ui.deleteConfirm?.childCount).toBeGreaterThan(0)
    })

    if (flagOn) {
      const state = getDeleteConfirmStore().getState()
      expect(state.payload).not.toBeNull()
      expect(state.payload?.title).toBe("parent")
      expect(state.payload?.childCount).toBeGreaterThan(0)
    }
  })

  withBothPaths("Enter confirms and executes delete, clearing dialog state", (flagOn) => {
    using app = createTestApp(() =>
      item("board", item("col1", item("parent", item("child1"), item("child2")), item("other"))),
    )
    app.press("Backspace") // open dialog
    app.press("Enter") // confirm

    // Parent + children gone.
    app.expect("#parent").not.toExist()
    app.expect("#child1").not.toExist()

    // Both legacy and plugin state are cleared.
    app.withStore((s) => expect(s.ui.deleteConfirm).toBeNull())

    if (flagOn) {
      expect(getDeleteConfirmStore().getState().payload).toBeNull()
    }
  })

  withBothPaths("Escape cancels without deleting", (flagOn) => {
    using app = createTestApp(() => item("board", item("col1", item("parent", item("child1")), item("other"))))
    app.press("Backspace") // open dialog
    app.press("Escape") // cancel

    // Everything still there.
    app.expect("#parent").toExist()
    app.expect("#child1").toExist()

    // Both legacy and plugin state are cleared.
    app.withStore((s) => expect(s.ui.deleteConfirm).toBeNull())

    if (flagOn) {
      expect(getDeleteConfirmStore().getState().payload).toBeNull()
    }
  })

  withBothPaths("column delete goes through the same confirm dialog", (flagOn) => {
    using app = createTestApp(() => item("board", item("col1", item("1a"), item("1b")), item("col2", item("2a"))))
    // Navigate to column header.
    app.command("cursor_up")
    app.expect("#col1[data-cursor]").toExist()

    app.press("Backspace") // open dialog

    app.withStore((s) => {
      expect(s.ui.deleteConfirm?.title).toBe("col1")
    })
    if (flagOn) {
      expect(getDeleteConfirmStore().getState().payload?.title).toBe("col1")
    }

    app.press("Escape") // cancel — leave the column intact

    app.expect("#col1").toExist()
    if (flagOn) {
      expect(getDeleteConfirmStore().getState().payload).toBeNull()
    }
  })

  withBothPaths("re-opening after cancel reuses the plugin slot cleanly", (flagOn) => {
    using app = createTestApp(() => item("board", item("col1", item("parent", item("child1")), item("other"))))

    for (let i = 0; i < 2; i++) {
      app.press("Backspace")
      app.withStore((s) => expect(s.ui.deleteConfirm).not.toBeNull())
      if (flagOn) expect(getDeleteConfirmStore().getState().payload).not.toBeNull()

      app.press("Escape")
      app.withStore((s) => expect(s.ui.deleteConfirm).toBeNull())
      if (flagOn) expect(getDeleteConfirmStore().getState().payload).toBeNull()
    }
  })
})

// ---------------------------------------------------------------------------
// Plugin-specific tests — only meaningful when the flag is on
// ---------------------------------------------------------------------------

describe("withDeleteConfirm plugin — dispatch observability", () => {
  beforeEach(() => {
    resetDeleteConfirmStore()
  })

  test("plugin subscribers see every dialog state transition", () => {
    const prev = process.env.KM_TEA_DELETE_CONFIRM
    process.env.KM_TEA_DELETE_CONFIRM = "1"
    try {
      using app = createTestApp(() => item("board", item("col1", item("parent", item("child1")), item("other"))))

      const transitions: string[] = []
      const unsub = getDeleteConfirmStore().subscribe(() => {
        const s = getDeleteConfirmStore().getState()
        transitions.push(s.payload ? `show:${s.payload.title}` : "hide")
      })

      app.press("Backspace") // show:parent
      app.press("Escape") // hide
      app.press("Backspace") // show:parent
      app.press("Enter") // hide (after delete)

      unsub()
      expect(transitions).toEqual(["show:parent", "hide", "show:parent", "hide"])
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_DELETE_CONFIRM
      else process.env.KM_TEA_DELETE_CONFIRM = prev
      resetDeleteConfirmStore()
    }
  })

  test("plugin state matches legacy ui state after any action sequence", () => {
    const prev = process.env.KM_TEA_DELETE_CONFIRM
    process.env.KM_TEA_DELETE_CONFIRM = "1"
    try {
      using app = createTestApp(() => item("board", item("col1", item("parent", item("child1")), item("other"))))

      // A non-trivial sequence: open, cancel, re-open, confirm (delete).
      app.press("Backspace")
      app.press("Escape")
      app.press("Backspace")
      app.press("Enter")

      const plugin = getDeleteConfirmStore().getState()
      app.withStore((s) => {
        // After execute, both are null.
        expect(plugin.payload).toBeNull()
        expect(s.ui.deleteConfirm).toBeNull()
      })
    } finally {
      if (prev === undefined) delete process.env.KM_TEA_DELETE_CONFIRM
      else process.env.KM_TEA_DELETE_CONFIRM = prev
      resetDeleteConfirmStore()
    }
  })
})
