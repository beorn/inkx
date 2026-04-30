---
id: "@km/inbox/storage-1"
aliases:
  - km-storage-1
  - "@km/_orphan/storage-1"
created_at: 2026-01-16T16:34:02Z
closed_at: 2026-03-09T22:07:22Z
close_reason: "Grooming: 52 days stale, no longer relevant"
---

# [x] Full event sourcing architecture @km/_orphan #feature #P4

## Decision
Event sourcing applies to **content mutations only** (TAction → events.jsonl).
Navigation and UI state remain ephemeral in-memory state.

This provides undo/redo, audit trail, and multi-window sync for content without the complexity overhead of event-sourcing transient UI state.

## Why Content-Only?
- Content changes are meaningful history; cursor movements are not
- UI state would bloat the log (j/k 100 times = 100 events)
- Simpler mental model: content = durable, UI = ephemeral
- Already what the architecture does — making it explicit

## Full Event Sourcing (Deferred)
The original vision of event-sourcing ALL state (including cursor, fold, modals) is deferred indefinitely. No clear use case for:
- Undo cursor movement
- Replay exact UI session
- Multi-window cursor sync

## Implementation
See @km/_orphan/kxhg for the remaining work to complete content-only ES.

## Original Analysis

### Current State vs Full Event Sourcing

| Aspect | Current | Full Event Sourcing |
|--------|---------|---------------------|
| Storage events | ✓ events.jsonl exists | Same |
| UI state (cursor, fold) | In-memory BoardState | Would be events |
| Content mutations | Stored directly | Would be events → derived |
| Undo | Navigate action history | Replay events minus last |
| Multi-window | Manual broadcast | Natural (shared event log) |

### Trade-offs of Full ES

1. **Complexity**: Everything becomes async event handling
2. **Performance**: Need snapshots and projections for speed
3. **UI state in log?**: Cursor position, fold state — feels heavy
4. **Storage growth**: Events accumulate (need compaction strategy)