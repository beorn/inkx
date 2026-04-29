---
id: "@km/silvery/reactive-pipeline"
aliases:
  - km-silvery.reactive-pipeline
  - km-silvery-reactive-pipeline
created_by: claude:21c57d63
created_at: 2026-03-20T00:06:23Z
closed_at: 2026-04-12T15:26:59Z
close_reason: "G1-G5 done (prior sessions), G6 DEFERRED (research: 22-32 days,
  current 90%+ skip rate), G7 useAgNode + useSignal done, G8 textContent+focused
  signals done, G9 rect-signals moved to @silvery/ag. Three-layer reactive stack
  complete."
owner: bjorn@stabell.org
assignee: beorn
dependencies:
  - issue_id: km-silvery.reactive-pipeline
    depends_on_id: km-silvery.layout-quality-plateau
    type: blocks
    created_at: 2026-04-12T00:49:05Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Reactive pipeline — signals for dirty tracking, layout gating, incremental rendering @km/silvery #epic #P0 @beorn

blocks:: [[@km/silvery/layout-quality-plateau]]

Reactive pipeline — signals for dirty tracking, layout gating, incremental rendering.

## Vision: Design G — Two-Level Reactive Graph

One framework-agnostic signal graph from content to cells:

Level 1 (tree): props → flex constraints → Flexily → boxRect → screenRect
Level 2 (text): text → preparedText → intrinsicSize ↔ width → wrappedLines → renderedCells

React = thick adapter (reconciler → signals). Solid = thin adapter (compiles → signals).

### Design G status

G1-G3 PreparedText cache: DONE
G4 Reactive cascade (reactive-node.ts): DONE
G5 Layout output signals (rect-signals.ts): DONE — moved to @silvery/ag
G6 Buffer effects: DEFERRED — too complex (22-32 days), current render phase already 90%+ skip rate
G7 useAgNode() hook: DONE — { node, signals } with rect signals
G8 Signal expansion: DONE — textContent + focused as writable signals (node-signals.ts)
G9 Framework-agnostic layer: DONE — rect-signals + node-signals in @silvery/ag

BONUS: useSignal() hook — bridges alien-signals to React re-renders (era2 alignment)

## Three-Layer Reactive Stack

Layer 0: alien-signals (signal, computed, effect) — pure reactive core
Layer 1: getRectSignals, getNodeSignals — framework-agnostic (in @silvery/ag)
Layer 2: useSignal() — React bridge (alien-signals → re-renders)
Layer 3: useBoxRect, useScreenRect, useAgNode — semantic convenience hooks

## Architecture boundary

Signals start AFTER layout. Flexily isDirty() is the sole layout gate (no signals).
Signal graph reads layout OUTPUTS (boxRect, screenRect) not layout INPUTS.

## Completed phases (layout quality plateau, 2026-04-12)

Phase 1: Delete silvery layoutDirty — Flexily isDirty() sole gate (-90 lines)
Phase 2: Delete executeRender — createAg sole API (-215 lines)
Phase 3: STRICT layout overflow invariant (+55 lines)
Phase 4: boxRect/screenRect as alien-signals
Phase 5: Flexily native fit-content/snug-content (+99 Flexily lines)
/complete: layoutDirty field deleted, 5 regression tests, all remnants cleaned

## Remaining

- Perf: noop-frame-skip (P2), pipeline-counters (P2), COW rows (P3), style-interning (P3)
- G6 buffer effects: DEFERRED (research complete, decision documented in design field)