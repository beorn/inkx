---
id: "@km/session/0425-evening"
aliases:
  - km-session.0425-evening
  - km-session-0425-evening
created_by: claude:2405c72e
created_at: 2026-04-26T04:37:48Z
closed_at: 2026-04-26T13:57:03Z
close_reason: >-
  Session complete. 38 streams executed across silvery + flexily + km. Major
  ships:


  Foundational architecture:

  - HeightModel Phase 1+2 (Fenwick prefix-sum tree as sole height source) —
  silvery

  - follow="end" prop replacing cursorKey-as-scroll-authority — silvery

  - overlay-anchor v1 substrate (anchorRef + decorations + OverlayLayer) —
  silvery

  - TextArea fieldSizing API replacing legacy height — silvery (BREAKING)

  - @km/autolinks package extraction with km-tui adoption —
  packages/km-autolinks


  Critical P1 bugs fixed:

  - silvercode --resume fork-bomb (pidfile + child-pgid registry + clamp) — N

  - silvercode --resume hangs no-input (synthetic turn-end after replay) — S

  - ListView scroll-cap stale estimate + overshoot regression — M+O

  - Layout corruption during stream+queue (flexily CSS §4.5 explicit-shrink fix)
  — V


  Polish + UX:

  - Queue UX: per-line > prefix, single-cursor, plain Enter inserts newline — A

  - Esc parity with Claude Code (interrupt + restore queue + double-Esc history)
  — F

  - Trailing & sends-and-backgrounds turn — F

  - Ctrl+D×2 quits + resume hint reliable — I

  - silvercode pane chord rebound Ctrl+W → Ctrl+G — W

  - Pane headers (--pane-headers opt-in) — P

  - Triple-click word/line selection in silvery — D

  - TextArea Shift+Enter newline (caught real defect via visual test) — Q

  - TextArea trio: soft-wrap default, Ctrl-N/P aliases, color/dim — E2

  - File-detection FILE_RE no longer matches /word inside compound paths — I

  - Slash-command FP fix (path requires second separator) — I

  - Resume hint reads sessionId LIVE (was stale snapshot) — I-followup

  - Markdown table render: single-Text-per-row layout fix — I-followup

  - Click-defaultPrevented gate for word/line auto-select — G

  - ListView scrollbar + bump in height-independent mode — J

  - Keyboard scroll: Shift+Up/Down/PageUp/PageDown/Home/End — T

  - Ctrl+G chord state-stale fix — X

  - Modal-dismiss-ghost regression suite (no synthetic repro yet) — Y


  /pro review of ListView architecture saved at
  hub/silvery/reviews/2026-04-26-listview-height-independent-pro-review.md.


  ~70+ commits across silvery + flexily + km. ~25 beads closed. ~150 tests
  added.


  Open follow-ups: km-silvercode.modal-dismiss-ghost (real-terminal repro
  needed).
started_at: 2026-04-26T04:37:53Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-session.0425-evening
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T21:37:52Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] Session plan: queue UX fixes + autolinks extraction + km-tui smartlinks adoption + overlay-anchor impl @km/session #epic #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

Session tracking bead authored 2026-04-25 evening.

After /compact, this bead is the resume point. Read this start-to-end and pick up at the next unfinished phase.

## Goals (3 streams)

### Stream A — Immediate queue UX bugs (screenshot ~/Desktop/Screenshot 2026-04-25 at 21.33.40.png)

**A1. Two cursors in queue editor mode**
- Symptom: when focus is in the queue TextArea (editing a queued command), a SECOND hardware cursor appears in the upper-left corner (likely SidePanel area).
- Phase 2 cursor-as-layout-output should ensure exactly one active cursor (focused-editable wins). Two cursors means either: a non-cursorOffset cursor source exists somewhere in silvercode, or findActiveCursorRect is not propagating correctly.
- Investigation: grep silvercode for TextInput/TextArea/cursorOffset/cursorStore; check SidePanel + Welcome + Notifications for any always-active widget holding a cursor.
- Fix: ensure the queue is the sole active cursor source when focused. May need silvery diagnostics.
- File a separate bead @km/silvercode/queue-two-cursors (P1) when the root cause is pinned.

**A2. Queue display formatting**
- Symptom: queue shows ONE `>` prefix on first item, blank lines between items, no `>` on subsequent items. User wants:
  ```
  > cmd1
  > cmd2
  > cmd3
  ----
  > active command
  ```
- Root cause: `apps/silvercode/src/components/CommandBox.tsx` renders a single TextArea for queueText (joined by \n\n in the wire format). Single `>` prefix is rendered next to the TextArea, not per line.
- Fix: 
  - Convert wire format ↔ display format (\n\n ↔ \n) in a CommandBox wrapper around TextArea
  - Render per-line `>` prefix via a parallel flex column aligned with TextArea rows
  - Single newline between items in display; controller still stores \n\n for Claude's input
- File: @km/silvercode/queue-display-polish (P2)

### Stream B — Architectural extraction + overlay-anchor implementation (parallel, then converging)

**B1. Autolinks extraction to shared package** (closes part of @km/all/autolinks-extraction)
- Today: `apps/silvercode/src/autolinks/` houses everything (config, match, previews, handlers, uri parsing, host parsers).
- Target: `packages/km-smartlinks/` consumed by silvercode + @km/tui (and eventually website term-linker).
- Sub-tasks:
  - Move `apps/silvercode/src/autolinks/*` → `packages/km-smartlinks/src/*`
  - Move `apps/silvercode/tests/autolinks/*` → `packages/km-smartlinks/tests/*`
  - Add package.json with proper exports + tsconfig
  - Update silvercode imports to use `@km/smartlinks`
  - Update root tsconfig paths
  - Verify all 139 autolinks tests pass post-move
  - Update `docs/design/autolinks.md` to reflect new home
- Bead: @km/silvercode/autolinks-extract-to-package (P2). Parent: @km/all/autolinks-extraction.

**B2. Overlay-anchor-impl-v1** (closes @km/silvery/overlay-anchor-impl-v1's defer-until criterion)
- Implement the substrate from `hub/silvery/design/overlay-anchor-system.md`:
  - `BoxProps.anchorRef: string` (semantic input — names this Box as an anchor)
  - `BoxProps.decorations: readonly Decoration[]` (semantic input — overlays attached to this Box)
  - `LayoutSignals.anchorRect(id): Rect | null` — geometric output
  - `LayoutSignals.decorationRects: { id, rects, kind }[]` — geometric output
  - `findAnchor(root, id, edge?): Rect | null` — tree-walk lookup
  - `placeFloating(anchor: Rect, target: { width, height }, placement: Placement): Rect` — pure rect math, unit-tested with all 12 placements (top/bottom/left/right + start/center/end + auto-flip-deferred-v2)
  - `OverlayLayer` per-frame artifact bundling caret + focus + selection + decorations + anchors
- Tests: BoxProps contract tests (per silvery 'New Props Require Tests'); SILVERY_STRICT=2 fixture (1 anchor + 1 popover renders at expected rect, incremental == fresh); OverlayLayer matches existing per-signal reads (cross-check property test).
- Bead: @km/silvery/overlay-anchor-impl-v1 (already exists, P2 — claim and ship).

### Stream C — @km/tui smartlinks-with-popover adoption (depends on B1 + B2)

**C1. @km/tui consumes @km/smartlinks**
- Wire `@km/smartlinks` into @km/tui's knode body / Detail view rendering path.
- Pattern matching: same regex/literal rules from `.km/config.yaml` (per-vault), with the cascade.
- Detection plumbing: where does @km/tui currently render text? Find the equivalent of silvercode's DetectionText.tsx in @km/tui (likely in views/DetailView.tsx or a TextRenderer component) and route through the smartlinks pipeline.
- Bead: @km/tui/smartlinks-adopt (P2). Depends on B1.

**C2. Hover-popover positioning via overlay-anchor**
- When mouse hovers over a smart-link match in @km/tui, render a popover anchored to the matched text span (not to the cursor — to the actual rendered span).
- Uses `anchorRef` on the Text wrapping the match + `decorations` to declare the popover overlay.
- placeFloating decides positioning (default 'bottom-start', falls back to 'top-start' if not enough vertical space — auto-flip can be v2 deferred or simple v1).
- Bead: @km/tui/smartlinks-hover-popover (P2). Depends on C1 + B2.

## Sequencing

Phase 1 (parallel, agents):
- Stream A — fix queue UX bugs (single agent, in shared workspace)
- Stream B1 — autolinks extraction (single agent, big mechanical move)
- Stream B2 — overlay-anchor-impl-v1 (single silvery agent)

Phase 2 (sequential, after Phase 1 lands):
- Stream C1 — @km/tui adopts @km/smartlinks
- Stream C2 — @km/tui hover-popover via overlay-anchor

## Acceptance — full session

- [ ] Stream A: two-cursors fixed; queue displays per-line `>` prefix with single newline separation; wire format unchanged
- [ ] Stream B1: `packages/km-smartlinks/` exists; silvercode consumes it via `@km/smartlinks` import; 139+ autolinks tests pass post-move; `docs/design/autolinks.md` updated
- [ ] Stream B2: anchorRef + decorations props on BoxProps; LayoutSignals.anchorRect + decorationRects; findAnchor + placeFloating; OverlayLayer artifact; STRICT contract tests (12 placeFloating cases + 1 anchor+popover SILVERY_STRICT=2 fixture)
- [ ] Stream C1: @km/tui Detail view renders smart-links via @km/smartlinks; hover detection wired
- [ ] Stream C2: hover-popover renders anchored to matched text span (not cursor); placeFloating positions correctly bottom-start default; manual TTY verification

## Closure

When all four sub-beads close (queue-display-polish, queue-two-cursors, autolinks-extract-to-package, overlay-anchor-impl-v1, smartlinks-adopt, smartlinks-hover-popover), close this session bead with summary referencing each commit SHA.

## References

- Screenshot: ~/Desktop/Screenshot 2026-04-25 at 21.33.40.png
- Design doc: hub/silvery/design/overlay-anchor-system.md
- Today's commits trail: `git log --oneline origin/main` from 8e92ba275 forward (35+ commits this session, autolinks v3 substrate complete)
- Parent epics: @km/silvercode (P1 epic), @km/all/autolinks-extraction (P3 epic), @km/silvery/overlay-anchor-system (P2 umbrella)