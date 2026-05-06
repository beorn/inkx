---
mentions:
  - km
  - claude
id: "@km/silvery/term-sub-owners"
aliases:
  - km-silvery.term-sub-owners
  - km-silvery-term-sub-owners
created_by: claude:019d032d
created_at: 2026-04-22T20:47:26Z
closed_at: 2026-04-23T01:08:14Z
close_reason: "Phase D shipped silvery 47245067 + km 960ce5d15. Console exposes
  count: ReadSignal<number> (cheap notification) + entriesSnapshot() (lazy O(n)
  copy); entries ReadSignal dropped. useConsole + Board + tui all migrated. 39
  console/output tests + 2511 km-tui pass. Closes the P1-9 perf item;
  pro-review-p1 (4/4 items done: A1 name-uniqueness, A2 backendTerm signals, A3
  symbol hiding, D console perf); parent epic term-sub-owners done (all 4 phases
  A/B/C/D + Phase 9b shipped)."
owner: bjorn@stabell.org
assignee: claude:019d032d
dependencies:
  - issue_id: km-silvery.term-sub-owners
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-22T13:47:52Z
    created_by: claude:019d032d
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvery
---

# [x] Promote Term to typed-sub-owner umbrella (input/output/modes/size/signals/console) @km/silvery #task #P1 @claude:019d032d

blocks:: [[@km/silvery]]

META-bead consolidating 4 existing race-class beads under one architectural reframe.

The pattern: silvery has Term as its 'central abstraction' but it leaks raw streams (term.stdin / term.stdout exposed) and most state is touched directly via process.* outside Term. Each fix we've proposed (InputOwner, TerminalProtocolOwner, SignalHandlerRegistry, stdout-dims-snapshot) is a piece of what Term should already own.

The reframe: Term gains typed sub-owners. Hide raw streams. Single, consistent naming (input/output/modes/size/signals/console — singular nouns, no Manager/Guard/Owner suffix). Existing methods (term.write, term.cols, term.events) stay as proxies.

PROPOSED Term SHAPE

```ts
interface Term {
  readonly caps:     TerminalCaps     // existing
  readonly input:    Input            // .probe(), .onKey(), .onMouse(), .onPaste(), .onFocus()
  readonly output:   Output           // .write(), style chain
  readonly modes:    Modes            // raw, altScreen, paste, kitty, mouse, focus — set ONCE per session
  readonly size:     Size             // .cols, .rows, .subscribe()
  readonly signals:  Signals          // process signal scope
  readonly console:  Console          // patched console
  readonly screen?:  Screen           // existing — termless emulator only
  readonly scrollback?: Scrollback    // existing — termless only
  dispose(): void; [Symbol.dispose](): void
}
```

ABSORBED BEADS (each becomes a phase, not a separate invention):

- @km/silvery/input-owner          → Phase 1: term.input (in flight via spawned silvery agent — rename target from start)
- @km/silvery/terminal-protocol-owner → Phase 2: term.modes
- @km/silvery/stdout-dims-snapshot-race → Phase 3: term.size (single-source)
- @km/all/signal-handler-registry  → Phase 4: term.signals
- (new) Phase 5: term.console — formalize patchConsole as a sub-owner

NAMING RULES

- Singular nouns. The noun IS the role. No Manager/Guard/Owner/Service suffixes.
- term.X.Y() reads like document.body.style.color — chained access mirrors web.
- Internal type names match: `Input`, `Output`, `Modes`, `Size`, `Signals`, `Console` (no Term prefix; namespace comes from term.).
- The sub-owner INTERFACES are public; the implementations stay internal to @silvery/ag-term/runtime.

PRIOR ART CONVERGENCE

- Crossterm (Rust): single Terminal struct owns raw mode, alt-screen, mouse, dims. No direct stdin.
- Bubbletea (Go): tea.Program is the runtime. Components return tea.Cmd; framework executes.
- notcurses (C): single notcurses_t* context. All API takes the context.
- Ink (TS): single Ink instance per render(). Hooks read via context.

LINT EXTENSION
The existing check-stdin-ownership.sh extends to ban term.stdin.* and term.stdout.* direct access in addition to process.*.

MIGRATION PLAN

- Phase 0: agree on the shape (this bead).
- Phase 1-5: implement each sub-owner additively. Existing methods (term.write, term.cols) stay as proxies. Zero consumer churn.
- Phase 6: extend lint to forbid term.stdin / term.stdout member access.
- Phase 7: deprecate raw stdin/stdout fields in Term interface (warning), then remove (next major).

EFFORT: medium. ~1000 LOC new + ~200 LOC migration glue. Risk low (additive).

