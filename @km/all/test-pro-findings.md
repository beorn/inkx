---
id: "@km/all/test-pro-findings"
aliases:
  - km-all.test-pro-findings
  - km-all-test-pro-findings
created_by: Bjørn Stabell
created_at: 2026-04-10T05:56:57Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.test-pro-findings
    depends_on_id: km-all.test-system
    type: parent-child
    created_at: 2026-04-15T12:25:10Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Pro review findings — semantic model, differential tests, generated sequences, matchers @km/all #task #P1

blocks:: [[@km/all/test-system]]

## Source

GPT 5.4 Pro review of testing strategy (2026-04-09). Full response at /tmp/llm-manual-review-our-tui-testing-l14m.txt.

Pro confirmed the invariants > typed assertions > snapshots hierarchy. These are the actionable findings beyond what we're already doing.

## Findings (ordered by Pro's priority)

### P0 — Do soon

1. **Failure artifacts** — auto-attach action trace + semantic state + last screen on every test failure. Makes debugging trivial without polluting the repo with committed snapshots.

2. **resize() + paste() + tick()** — missing user actions on TestApp. resize is not optional for a TUI. tick/fake-clock needed for calendar/time features.

3. **findCard() nullable queries** — mirror RTL's getBy vs queryBy. app.card() throws, app.findCard() returns null. Prevents people escaping to internals when they want "does this exist?"

4. **Custom vitest matchers** — expect(app).toHaveCursor("t1") better UX than expect(app.card("t1").isCursor).toBe(true). Better failure messages, more expressive.

### P1 — Build next

5. **Semantic screen model** — a versioned tree (board > column > card [cursor]) that invariants, semantic snapshots, and differential tests all operate on. Stronger than ad-hoc getters. The TUI equivalent of an accessibility tree.

6. **Semantic snapshots** — snapshot the semantic tree, not raw terminal cells. Ages better, less churn. Raw snapshots only for renderer-specific tests.
   Example output:
   ```
   view=cards focus=board overlay=null
   > column: col1
       task: task1 [cursor]
       task: task2
   ```

7. **Builder fixture DSL** — stable IDs, exact setup, no parser side effects. item() already fills this but Pro suggests a typed builder: board(column({id:"c1"}, task({id:"t1"}))).

8. **Headless vs termless differential tests** — run same action sequence on both backends, compare semantic state. Catches backend drift.

### P2 — Build later

9. **Generated action-sequence fuzzing** — use fast-check to generate navigation/fold/selection/resize sequences. Let invariants do the checking. Catches whole classes of bugs handcrafted tests miss.

10. **Command registry contract tests** — auto-generate: every command callable, disabled commands fail predictably, keybinding and direct command match semantically.

11. **Round-trip persistence laws** — load > save > reload preserves semantics, markdown import/export round-trip, undo > redo returns equivalent state.

12. **Real PTY smoke suite** — 5-20 tests in a real terminal for alt-screen, resize, cursor, Unicode width. xterm.js is not a real terminal.

13. **Width/resize/Unicode matrix** — narrow widths, short heights, emoji, combining marks, East Asian wide chars. Where TUIs quietly lie.

14. **Mutation testing on core logic** — reducers, selection, cursor, layout, invariants themselves. Tells you if tests actually mean anything.

## API refinements

15. **bell as counter is awkward** — prefer expect(app).toBell() or per-action delta over absolute counter. Counters become brittle in longer journeys.

16. **Distinguish command() from press()** — use command() for behavior tests, press() for keybinding tests. Otherwise keymap changes break behavior tests.

17. **app.card(title) by text is brittle** — renaming a task title breaks tests. Use app.node(id) for stable references, card(title) for convenience only.

## Architecture notes from Pro

- createTestApp is right for app tests but NOT for all tests. Keep pure model tests at lower layer.
- Don't let createTestApp become the only test layer — same coupling problem under a nicer API.
- Invariant checks must run after actions are fully settled (dispatch > effects > React > render). Transient states cause flakes.
- Invariants become part of the spec — don't encode accidental assumptions.
- app.state should stay small and semantic. Adding "just one more selector" is how it becomes store.getState() again.