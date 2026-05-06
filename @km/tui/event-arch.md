---
mentions:
  - km
  - claude
id: "@km/tui/event-arch"
aliases:
  - km-tui.event-arch
  - km-tui-event-arch
created_at: 2026-02-08T08:16:57Z
closed_at: 2026-02-18T08:21:35Z
assignee: claude:5f0aee02
---

# [x] Event architecture: stale layout during batches, module-level state, unnecessary re-renders @km/tui #task #P2 @claude:5f0aee02

## Systematic Problems in the TUI Event Architecture

Root cause analysis from 12+ sessions (2026-02-06 through 2026-02-08) fighting visual bell flashes and cursoring bugs. The individual bugs were fixed, but the architecture has systematic issues that will create more bugs.

### Problem 1: Stale Layout During Event Batches (MEDIUM IMPACT)

When multiple keys arrive in one stdin read (auto-repeat), they're batched and processed by `processEventBatch()` without rendering between handlers. Each handler gets fresh store state via `get()`, but **layout is stale** because:

- `dispatchBoard()` updates `cursorNodeId` synchronously via Zustand `set()`
- But `updateLayout()` runs in a React `useEffect` in Board.tsx — only after `doRender()`
- So key 2 in a batch sees key 1's layout (stale `colIndex`/`cardIndex`)

**Impact**: Horizontal nav (h/l) reads `layout.colIndex` which doesn't update until after render. Vertical nav (j/k) reads `cursorNodeId` from `boardState` which IS fresh — that's why j/k mostly works but h/l is more fragile.

**Fix options**:

1. Compute layout synchronously in `dispatchBoard()` instead of in React effects
2. Accept layout-is-one-behind and make handlers use `boardState.cursorNodeId` + tree-walking instead of `layout`
3. Break batches: render between each key (slower but correct)

### Problem 2: Module-Level Mutable State (`inBoundaryStreak`)

The `inBoundaryStreak` flag in `board-app.ts` is a module-level `let`. It:

- Leaks between test instances (fixed with `resetBoundaryStreak()`)
- Would leak between multiple app instances (only one in production, but architecturally wrong)
- Can't be inspected or tested via the store

**Fix**: Move into the store as non-reactive metadata, or into a closure captured by `createBoardApp()`.

### Problem 3: Silent Layout Mutation

`updateLayout()` in `board-app-store.ts` directly mutates `_get()` fields without calling `set()`. This is intentional (avoids double-render) but:

- Violates Zustand's contract (external state mutation)
- Makes it impossible to subscribe to layout changes
- Creates timing bugs where reads may see stale or fresh layout depending on render cycle

**Fix**: Use a separate mutable ref alongside the store, or make layout a computed value derived from `cursorNodeId` + tree structure.

### Problem 4: Unnecessary Re-renders on Bell Clear

Every keypress where `bellState` was previously set calls `setUI({ bellState: null })`, which triggers a Zustand re-render cycle. During boundary suppression, this means:

- Key 1: bell fires (necessary render)
- Key 2: clears bell (unnecessary render) + suppresses new bell (no render needed)
- Key 3: no bell to clear (no render) — but already wasted a render on key 2

**Fix**: Let the 150ms auto-dismiss timer handle bell clearing. Don't clear in handleKey.

### Summary

These are all consequences of the same architectural tension: **the event handler is synchronous but layout is async (React effects)**. The workarounds (silent mutation, module-level flags, eager bell clears) each solve their immediate problem but create subtle timing bugs.

Long-term fix: make layout a synchronous derivation of `cursorNodeId` + tree structure, computed on-demand rather than stored and async-updated.

