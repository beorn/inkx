---
mentions:
  - km
id: "@km/inbox/kxhg"
aliases:
  - km-kxhg
  - "@km/_orphan/kxhg"
created_at: 2026-01-16T16:56:26Z
closed_at: 2026-01-17T20:19:50Z
---

# [x] Complete content-only event sourcing @km/_orphan #task #P3

## Summary

Make content-only event sourcing complete. The infrastructure is 95% built — this tracks the remaining gaps.

## Context

Decided that event sourcing applies to **content mutations only** (TAction → events.jsonl).
Navigation and UI state remain ephemeral in-memory state.

See @km/_orphan/4o8x for the full analysis of why content-only (not full ES including UI state).

## What's Done (95%)

- Core emit() infrastructure (emit.ts)
- Event persistence to events.jsonl
- State rebuild from events (rebuildState)
- Filesystem sync via events
- Event helpers: emitNodeUpdated/Moved/Deleted/Created

## Completed Work

### 1. ADD_NODE now emits events ✓

- Added `addNode()` function in storage layer (db.ts)
- Emits `node_created` event in disk mode
- Generates ULID if id not provided
- Sets sensible defaults for task nodes

### 2. TUI routes ADD_NODE through TAction ✓

- Updated handleTAction in App.tsx to call addNode()
- Complete flow: ADD_NODE action → effect layer → addNode() → emit

### 3. Memory mode decision ✓

Memory mode intentionally does NOT emit events because:

- No persistence (events would have nowhere to go)
- Rebuilds from filesystem on each run anyway
- Events only useful for disk mode features (undo, sync, audit)

This is correct behavior, not a gap.

## Remaining Gaps (if any)

### Route all TUI mutations through TAction

- Most mutations already go through TAction via command system
- Tab/Shift+Tab (indent/outdent) use MOVE_NODE action ✓
- Opt+hjkl (shifting) use UPDATE_NODE/MOVE_NODE actions ✓
- New item dialog uses appendTaskToFile (bypasses TAction)
  - Could be converted to ADD_NODE action in future

## Key Files

- packages/@km/storage/src/db.ts — addNode(), updateNode(), deleteNode(), moveNode()
- packages/@km/storage/src/emit.ts — emission logic
- apps/@km/tui/packages/@km/_orphan/opentui/src/App.tsx — handleTAction effect layer

