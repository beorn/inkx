---
id: "@km/core/slate-interfaces/p3-split-actions"
aliases:
  - km-core.slate-interfaces.p3-split-actions
  - km-core-slate-interfaces-p3-split-actions
created_by: claude:ceb7c9cb
created_at: 2026-03-28T07:29:18Z
closed_at: 2026-03-28T08:35:49Z
close_reason: Categorized ~130 action types into 8 focused sub-unions
  (VerbOp/NavOp/EditOp/TextOp/BoardOp/DialogOp/PaneOp/ViewOp). Router is 8
  lines. All 4791 tests pass. Type guards use O(1) Set dispatch.
---

# [x] Phase 3: Split CommandAction (91 variants → focused sub-unions) @km/core #task #P2 @claude:ceb7c9cb

## Goal
Decompose the 91-variant CommandAction god-union into focused operation types. The 186-case switch becomes a small router. Each subsystem owns its operations.

## DEPENDENCY NOTE
This phase does NOT depend on P2 (TreeOps). Splitting the action union is about ROUTING, not about what handlers do internally. Can run in parallel with P2 if needed.

## Pre-work: Categorize ALL 91 types
BEFORE writing any code, create a concrete table assigning every action type to a category. This is the design artifact. Resolve ambiguities upfront, not during implementation.

Likely categories (refine during pre-work):
- **BoardOp** (~15): SELECT, ZOOM_IN, FOLD, COLLAPSE, MOVE_MODE, NAV_HISTORY, CONTENT_LINES
- **VerbOp** (~4): CURSOR_TO, REPARENT_TO, LINK_TO, CREATE_AT (already done)
- **TextOp** (~16): character editing operations (PlainText machine candidates)
- **EditOp** (~15): node structure — inline edit, clipboard, add/delete/duplicate node, properties
- **DialogOp** (~20): pickers, search, filter, favorites, confirmations, help, console
- **NavOp** (~10): cursor move, nav back/forward, page jump, column jump
- **PaneOp** (~10): split, close, focus, resize, equalize, swap

Note: 7 categories, not 5. The actual count emerges from the categorization exercise.

## BREAK FIRST
After splitting, the old monolithic CommandAction type must not compile with the old shape. Each sub-union gets its own handler function. The router is <30 lines.

## Changes
1. Categorize all 91 types → design table (in bead description or design doc)
2. @km/_orphan/commands/src/types.ts — sub-union types
3. board-actions.ts — 186-case switch → router + category handler functions
4. Each handler: focused switch, <20 cases
5. Type-level enforcement: exhaustive check per handler

## DRY audit (part of this phase)
After splitting, review each handler for:
- Patterns that repeat across categories → extract
- Cases that delegate to another handler (misclassified?) → move
- Guard patterns that should be in the router → lift

## /complete
- All 91 action types assigned to a category (documented in bead)
- handleCommandAction router is <30 lines
- Each category handler is a separate function
- No handler has >25 cases
- All tests pass