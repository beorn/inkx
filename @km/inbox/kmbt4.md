---
id: "@km/inbox/kmbt4"
aliases:
  - km-kmbt4
  - "@km/_orphan/kmbt4"
created_by: claude:40fd010c
created_at: 2026-03-02T22:49:39Z
closed_at: 2026-03-03T00:45:53Z
owner: bjorn@stabell.org
assignee: claude:e039a9ca
---

# [x] inkx: eliminate all module-level mutable state (PipelineContext + cursor + adapter + theme) @km/_orphan #task #P3 @claude:e039a9ca

Comprehensive refactoring: replace ALL module-level mutable state in inkx with per-instance patterns.

## Inventory of Module-Level Mutable State

### output-phase.ts — DONE ✅ (Phase 0)
- [x] _caps → OutputContext.caps
- [x] _outputMeasurer → OutputContext.measurer
- [x] sgrCache / transitionCache → per-OutputContext
- [x] accumulatedAnsi / accumulateWidth / accumulateHeight / accumulateFrameCount → per-closure AccumulateState

### unicode.ts — DONE ✅ (Phase 1)
- [x] _scopedMeasurer → PipelineContext.measurer threads through pipeline
- [x] _defaultMeasurer — lazy singleton, config-independent, KEEP
- [x] displayWidthCache — pure computation cache, KEEP
- [x] textPresentationEmojiCache — pure computation cache, KEEP

### content-phase.ts — DONE ✅ (Phase 2+3)
- [x] Per-node params (scrollOffset, clipBounds, hasPrevBuffer, ancestorCleared) → NodeRenderState struct
- [x] _instrumentEnabled → PipelineContext.instrumentEnabled
- [x] _contentPhaseStats → PipelineContext.stats
- [x] _nodeTrace / _nodeTraceEnabled → PipelineContext.nodeTrace / .nodeTraceEnabled
- [x] warnedBgConflicts → PipelineContext.warnedBgConflicts
- [x] bgConflictMode → PipelineContext.bgConflictMode

### hooks/useCursor.ts — DONE ✅ (Phase 5)
- [x] _globalCursorState → CursorStore + CursorProvider
- [x] _cursorListeners → per-instance via CursorStore

### Non-pipeline callsites — DONE ✅ (Phase 4)
- [x] reconciler/nodes.ts — optional measurer param
- [x] text-cursor.ts — optional measurer param
- [x] components/Fill.tsx — optional measurer prop
- [x] adapters/terminal-adapter.ts — optional measurer param

### render-adapter.ts — KEEP AS-IS ✅ (Phase 6)
- [x] currentAdapter — intentional process-scoped singleton, documented

### theme-defs.ts — KEEP AS-IS ✅
- _activeTheme + _contextStack — proper push/pop stack pattern