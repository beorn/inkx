# Op→Signal Boundary — Where Pure Functions Meet Reactive State

**TL;DR**: Signals are never written from outside their owning store. The store method is the boundary — pure function inside, signal write outside.

**Keywords**: signals, ownership, reactive, alien-signals, store, effect, computed, bridge

---

## Case Study: Selection Bridge Mess

**What happened**: The selection store (`sel`, alien-signals) and `BoardPaneState.cursorNodeId` (signal-store) both owned cursor state. A bridge effect synced them: when `sel.node.cursor()` changed, the effect wrote `cursorNodeId`, and vice versa. Every cursor move wrote twice. Init race where `sel.node.cursor()` returned null because the bridge hadn't fired yet.

**Root cause**: Two systems owned cursor state. The bridge (pattern 3: effect writes signal) kept them in sync — but "kept in sync" means "temporarily out of sync, then reconciled." The gap between "out of sync" and "reconciled" is where bugs live.

**Fix**: `sel` becomes sole cursor owner. No bridge. One write path. `BoardPaneState.cursorNodeId` reads from `sel.node.cursor()` via computed derivation — never writes to it.

---

## Three Patterns, Ranked

### Pattern 1: DIRECT — method → pure function → write own signal

One owner, one write, no cascades. The store method is the pure→reactive boundary: read signals, call a pure function, write the result back to the store's own signals.

```typescript
// ✅ DIRECT — store method owns the write
const sel = createSelection()
sel.node.setCursor(targetId)  // pure logic inside, signal write at the end
```

This is the cleanest pattern. The store method encapsulates the decision logic. External code calls the method — it never writes the signal directly.

### Pattern 2: DERIVED — signal A changes → computed B recomputes

No writes, just derivation. A computed signal reads from another signal and transforms the value. No side effects, no cascades, no timing issues.

```typescript
// ✅ DERIVED — computed, no writes
const cursorNode = computed(() => {
  const id = sel.node.cursor()
  return id ? repo.getNode(id) : null
})
```

Clean because there's no write — just a lens over existing state. Computed values are always consistent with their sources.

### Pattern 3: EFFECT — signal A changes → effect → writes signal B

Two systems. An effect watches one signal and writes to another. This is the source of every bridge mess, init race, and double-write bug.

```typescript
// ⚠️ EFFECT — two owners, bridge
effect(() => {
  const cursor = sel.node.cursor()
  boardState.setCursorNodeId(cursor)  // writing someone else's signal
})
```

Use sparingly. Every mess starts here.

---

## Decision Framework

When you need reactive state that depends on other reactive state:

1. **Derives from existing state?** → `computed` (pattern 2). No new signals, no writes, just a lens.
2. **Belongs to an existing store?** → Add a method to that store (pattern 1). The store owns the write.
3. **Needs its own store?** → New store with its own methods (pattern 1). Bridge to other stores via `computed` derivation only (pattern 2).
4. **Writing `effect(() => { otherStore.set(...) })`?** → Stop. Ask why it can't be pattern 2. If it truly can't, document the exception.

---

## Litmus Test

If you're writing `effect(() => { otherStore.set(...) })`, something is wrong. Either:

- The two stores should be one store (merge them)
- One store should derive from the other via `computed` (pattern 2)
- The write belongs in the source store's method, not in an effect

---

## The One Justified Exception

Cross-system boundaries where two systems genuinely can't be the same store. Example: `sel` store writes `agNode.selected` on silvery's ag tree — the selection system and the render tree are architecturally separate, and merging them would violate layer boundaries.

When you must use pattern 3:

- Document why patterns 1 and 2 don't apply
- Minimize the surface: one effect, one direction, one signal
- Never chain effects (effect A writes signal B, effect on B writes signal C)
- Test the init ordering explicitly

---

## Rules

### 1. One writer per signal

Every signal has exactly one store that writes it. External code reads signals and calls store methods — it never writes signals directly. This makes the write path traceable: grep for the method name, find every mutation.

### 2. Store methods are the pure→reactive boundary

Inside a store method: read signals, call pure functions, make decisions. At the end of the method: write the result to the store's own signals. The method IS the boundary between pure logic and reactive state.

### 3. Computed over effect for cross-store reads

When store B needs to react to store A's state, store B reads from store A via `computed` — never via an effect that writes store B's signals. Computed values are synchronous, consistent, and free of init races.

### 4. Effects are code smells between stores

An `effect(() => { otherStore.set() })` is a design smell. It means two stores both think they own something. Find the true owner. If ownership is genuinely split (the exception above), document it and keep it minimal.

---

## See Also

- [Selection System Lessons](selection-system.md) — the full history of the selection design, including the bridge problem
- [docs/principles.md](../principles.md) — "Signal ownership — one writer per signal" principle
- [docs/architecture.md](../architecture.md) — Reactive Model section describing the three patterns
