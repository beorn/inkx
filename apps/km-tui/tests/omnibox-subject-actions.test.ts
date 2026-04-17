/**
 * km-tui.itempicker-unify — subject-action command journeys.
 *
 * The three SET_LABEL / SET_ASSIGNEE / PANE_SPLIT_AND_PICK flows migrated
 * from the legacy ItemPicker to the unified omnibox. Each lands on the
 * omnibox with a sigil-scoped buffer and a sticky `defaultCommand`; Enter
 * runs a TUI-dispatched op against the subject (the anchor pane's cursor
 * at open time).
 *
 * NOTE on test shape: the `dispatch()` helper in test-app follows its
 * command execution with a render-flush Backspace. Because these commands
 * open an omnibox with a pre-seeded sigil (`#`, `@`, `+`), that Backspace
 * eats the sigil char. We compensate by re-typing the sigil at the start
 * of the buffer so downstream runtime code (`runSelection`) sees the same
 * shape it would after a real user keystroke. This is a test-env quirk,
 * not a behavior difference — the `defaultCommand` assertion confirms the
 * omnibox opened with the correct subject-action wiring.
 */
import { describe, expect, test } from "vitest"
import { item } from "./helpers/board-test.ts"
import { createTestApp } from "./helpers/test-app.ts"

// ---------------------------------------------------------------------------
// SET_LABEL — `omnibox.append_tag_to_subject`
// ---------------------------------------------------------------------------

describe("SET_LABEL (tag) routed through unified omnibox", () => {
  test("dispatch opens omnibox with tag subject-action command", () => {
    using app = createTestApp(item("board", item("col1", item("anchor"))))
    app.dispatch("set_label")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("omnibox.append_tag_to_subject")
    })
  })

  test("typing tag + Enter appends the tag to the subject's content", () => {
    using app = createTestApp(item("board", item("col1", item("anchor"))))
    expect(app).toHaveCursorOn("anchor")
    app.dispatch("set_label")
    // dispatch's render-flush Backspace eats the initial `#` — re-seed it
    // before typing the tag text, then confirm with Enter.
    app.type("#urgent")
    app.press("Enter")

    const anchor = app.repo.getNode("anchor")
    expect(anchor?.content ?? "").toContain("#urgent")
  })

  test("Enter on an already-present tag is a no-op (no duplicate #tag)", () => {
    using app = createTestApp(item("board", item("col1", item("anchor"))))
    // Pre-seed the node's content so the append path hits its
    // "already present" guard.
    const anchorId = app.repo.getNode("anchor")!.id
    app.repo.updateNode(anchorId, { content: "work #important" })

    app.dispatch("set_label")
    app.type("#important")
    app.press("Enter")

    const anchor = app.repo.getNode("anchor")
    // Exactly one "#important" — not "#important #important".
    const matches = (anchor?.content ?? "").match(/#important/g) ?? []
    expect(matches.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// SET_ASSIGNEE — `omnibox.set_assignee_on_subject`
// ---------------------------------------------------------------------------

describe("SET_ASSIGNEE routed through unified omnibox", () => {
  test("dispatch opens omnibox with assignee subject-action command", () => {
    using app = createTestApp(item("board", item("col1", item("anchor"))))
    app.dispatch("set_assignee")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("omnibox.set_assignee_on_subject")
    })
  })

  test("typing '@delei' + Enter writes assigned_to='delei' on the subject", () => {
    using app = createTestApp(item("board", item("col1", item("anchor"))))
    expect(app).toHaveCursorOn("anchor")

    app.dispatch("set_assignee")
    app.type("@delei")
    app.press("Enter")

    const anchor = app.repo.getNode("anchor")
    expect(anchor?.assigned_to).toBe("delei")
  })
})

// ---------------------------------------------------------------------------
// PANE_SPLIT_AND_PICK — `omnibox.split_and_reparent`
// ---------------------------------------------------------------------------

describe("PANE_SPLIT_AND_PICK routed through unified omnibox", () => {
  test("dispatch opens omnibox with split-and-reparent command", () => {
    using app = createTestApp(item("board", item("col1", item("anchor")), item("col2", item("target"))), {
      rows: 40,
      cols: 120,
    })
    app.dispatch("pane_split_and_pick")
    app.withStore((s) => {
      expect(s.ui.omnibox).not.toBeNull()
      expect(s.ui.omnibox?.state.defaultCommand).toBe("omnibox.split_and_reparent")
    })
  })
})
