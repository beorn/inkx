# Sync Test API — act() Makes Async Unnecessary

**TL;DR**: React's `act()` synchronously flushes all effects. Test APIs don't need `async/await` — the async in silvery's `App.press()` is a formality that `act()` already handles.

---

## The Incident

createTestApp was built with async methods: `await app.press("j")`, `await app.command("cursor_down")`. Every test needed `async () => {}` and every action needed `await`. 2000+ await calls across 38 files.

Meanwhile, createDriverTest — the legacy API — was fully synchronous and had worked perfectly for 2+ years.

## The Investigation

Tracing the code:

- `App.press()` → `sendInput(key)` (sync) → `await Promise.resolve()` (microtask flush)
- `createApp.press()` → `handleKey()` (sync) → `doRender()` (sync) → `while (pendingRerender) { await Promise.resolve(); doRender() }` (effect-flush loop)

The ONLY async part is `await Promise.resolve()` — a microtask yield to let React passive effects run. But `act()` already flushes effects synchronously. createDriverTest wraps everything in `act()` and voids the promise: `void originalPress(key)`.

## The Fix

Made all TestApp methods synchronous. Used createDriverTest's exact pattern:

```typescript
const pressKey = (key: string) => {
  void driver.press(key)  // fire-and-forget the microtask promise
}
```

Batch-replaced ~2000 `await` and ~520 `async` across 38 files using `perl -pi -e`.

## The Rule

When building test APIs on top of async production code:

1. Check if `act()` already handles the async work
2. If yes, void the promise — don't propagate async to the test surface
3. Sync test APIs are dramatically more ergonomic (no `async/await` ceremony, native chaining)

The production API being async doesn't mean the test API must be. `act()` is the bridge.

## See Also

- [Batch Refactor Over Agents](batch-refactor-over-agents.md) — related lesson: use editsets for migrations, not per-file agents
- [Testing Escape Hatches](testing-escape-hatches.md)
- [Read the Factory](read-the-factory.md)
