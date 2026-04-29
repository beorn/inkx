---
id: "@km/silvery/interactions-runtime/phase-6"
aliases:
  - km-silvery.interactions-runtime.phase-6
  - km-silvery-interactions-runtime-phase-6
created_by: Bjørn Stabell
created_at: 2026-04-06T07:04:44Z
closed_at: 2026-04-06T09:38:01Z
close_reason: CHANGELOG, README, CLAUDE.md, guide pages all updated. Internal
  design doc has SUPERSEDED notice. Silvery commit 5d8a0ab.
---

# [x] Phase 6: Fix demo, km, docs, marketing (selection/find/copy/drag only) @km/silvery #task #P1

Final sweep: rewrite demo (if not already done in 3.1), verify km, update all docs, marketing, CHANGELOG. Also: full internal design doc rewrite (deferred from Phase 0) + dev-mode warnings (deferred from Phase 3) if easy.

Split acceptance: selection highlight is a HARD gate (zero km code changes); copy-on-mouseup is a CONDITIONAL gate (requires clipboard capability in runtime).

## Scope

### 6.1 Demo verification

Phase 3.1 already rewrote the demo. This phase is a final verification + any residual cleanup:
- Run demo in TTY
- Verify mouse drag selects across all panels
- Verify copy on mouseup (OSC 52 via Term's clipboard capability)
- Screenshot for docs if needed

### 6.2 km two-gate verification (per Pro review 2 item 9)

**Hard gate: zero km code changes, selection highlight works**
- Run km: bun km view /some/vault
- Open help dialog (?)
- Mouse-drag on help text → highlights visible
- PASS: zero km code changes needed

**Conditional gate: copy-on-mouseup works in a runtime with clipboard capability**
- km already uses Term (has OSC 52 clipboard capability)
- Mouse drag → mouseup → paste into external editor
- Expected: correct text in clipboard
- Environment caveat: OSC 52 may be blocked by tmux/screen/SSH configs — document tested environments in the bead notes
- PASS: copy works in standard macOS Terminal.app, Ghostty, Alacritty, etc

**DO NOT claim zero-code-change copy works everywhere.** Only claim it for environments with working OSC 52.

### 6.3 User-facing silvery docs

- vendor/silvery/docs/guide/text-selection.md — rewrite to match final API (props + useSelection hook, no more useTerminalSelection)
- vendor/silvery/docs/guide/clipboard.md — rewrite: capability-based copy model
- vendor/silvery/docs/guide/find.md — rewrite: withFocus + Ctrl+F (no more useFind)
- vendor/silvery/docs/guide/event-handling.md — mention mouse-drag selection as documented behavior of mouse events
- vendor/silvery/docs/guide/the-silvery-way.md — add userSelect, draggable to canonical props list

### 6.4 Architecture docs (continue from Phase 0)

Phase 0 added thin architecture docs. This phase completes them with the final details now that the architecture is proven:

- vendor/silvery/docs/guide/runtime-layers.md — add concrete examples of selection/find/drag integration
- vendor/silvery/docs/guide/providers.md — add 'How withDomEvents handles text selection' example
- vendor/silvery/docs/guide/headless-machines.md — update catalog with the 4 moved machines + usage patterns

### 6.5 Internal design doc rewrite (deferred from Phase 0)

Full rewrite of vendor/internal/silvery/design/v10-terminal/text-selection-and-clipboard.md now that the architecture is stable:
- Updated diagrams
- Final service shapes
- Capability registry pattern
- Render invalidation flow
- Follow-up beads (clipboard-paste-cleanup, ag-term-cleanup)

### 6.6 Dev-mode warnings (deferred from Phase 3)

Per Pro review 2 item 11I: dev warnings detection is under-specified. If withDomEvents isn't installed, who scans and warns?

Approach:
- Warning detection lives in withTerminal (which is always installed in terminal apps)
- After mount, walk the ag tree once
- If any node has userSelect prop but SELECTION_CAPABILITY is not registered in the router → log warning
- Same for draggable + DRAG_CAPABILITY, onCopy + CLIPBOARD_CAPABILITY, onFind + FIND_CAPABILITY
- Gate on SILVERY_STRICT env var (non-blocking, opt-in)

If the detection plumbing turns out to be annoying or unreliable, SKIP this sub-phase and file a follow-up bead. Don't block Phase 6 on it.

### 6.7 Marketing + visibility

- vendor/silvery/README.md — mention text selection, find, copy-mode, drag in feature list
- vendor/silvery/docs/index.md (homepage) — add interactions to feature showcase
- vendor/silvery/CHANGELOG.md — breaking change notice + new feature summary
- vendor/silvery/docs/guide/silvery-vs-ink.md — add 'text selection' to comparison (Ink lacks this)
- vendor/silvery/docs/guide/silvery-vs-blessed.md, silvery-vs-textual.md, silvery-vs-bubbletea.md — mention where selection is a differentiator (only if accurate)

### 6.8 km docs

- /Users/beorn/Code/pim/km/CLAUDE.md — update TUI architecture section if it mentions interactions
- /Users/beorn/Code/pim/km/apps/@km/tui/CLAUDE.md — update if exists

### 6.9 Create follow-up beads

If not created in Phase 5:
- @km/silvery/clipboard-paste-cleanup — paste architecture redesign (bracketed paste, onPaste prop, etc)
- @km/silvery/ag-term-cleanup (optional) — reorganize existing flat ag-term files into input/ and rendering/ subfolders

## Delete

Stale references in docs to deleted APIs (useTerminalSelection, CopyProvider, etc).

## New tests

No new test files. Manual verification is the gate.

## Definition of Done (split gates)

### Hard gates (all must pass)

- [ ] Selection highlight works in demo (manual)
- [ ] Selection highlight works in km help dialog with zero km code changes (manual)
- [ ] All docs updated: text-selection.md, clipboard.md, find.md, event-handling.md, the-silvery-way.md
- [ ] Internal design doc fully rewritten
- [ ] CHANGELOG entry exists
- [ ] README mentions interactions
- [ ] Homepage mentions interactions
- [ ] grep -rq 'useTerminalSelection' vendor/silvery/docs/guide → 0 hits
- [ ] grep -rq 'CopyProvider' vendor/silvery/docs/guide → 0 hits
- [ ] Docs build succeeds

### Conditional gates (pass in supported environments)

- [ ] Copy-on-mouseup works in demo + external paste (macOS Terminal.app, Ghostty, Alacritty)
- [ ] Copy-on-mouseup works in km + external paste (same environments)
- [ ] Documented environments where copy is known to NOT work (tmux without OSC 52 enabled, restricted SSH, etc)

### Optional (skip if plumbing complex)

- [ ] Dev warnings for decorative props (SILVERY_STRICT mode)

## /complete criteria

- grep -q 'userSelect' vendor/silvery/examples/apps/text-selection-demo.tsx
- grep -c 'useInput' vendor/silvery/examples/apps/text-selection-demo.tsx → 0 or 1 (only for quit)
- grep -rq 'useTerminalSelection\|CopyProvider\|PasteProvider' vendor/silvery/docs/guide → 0 hits
- grep -q 'text selection\|userSelect' vendor/silvery/README.md
- grep -q 'text selection\|userSelect\|interactions' vendor/silvery/docs/index.md
- grep -q 'selection\|interactions' vendor/silvery/CHANGELOG.md
- cd vendor/silvery && bun run docs:build → success
- bd list | grep 'clipboard-paste-cleanup' → found
- MANUAL: demo selection highlights + copy works
- MANUAL: km help dialog selection highlights + copy works (with zero km code changes)
- MANUAL: supported-environments documented in clipboard.md

## MANDATORY

Read docs/lessons/refactoring.md IN FULL before starting. Remember Case Study 3 (NewWay Documentation Drift): migration isn't complete until ALL references updated.