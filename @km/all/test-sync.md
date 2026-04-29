---
id: "@km/all/test-sync"
aliases:
  - km-all.test-sync
  - km-all-test-sync
created_by: Bjørn Stabell
created_at: 2026-04-09T15:42:47Z
closed_at: 2026-04-09T15:55:14Z
close_reason: Implemented. createTestApp is fully synchronous. All TestApp
  methods return TestApp (not Promise). Batch-replaced ~2000 await + ~520 async
  across 38 files. Verified 43/43 pass. Commit 50dc257dc.
---

# [x] Question: can createTestApp be fully synchronous? @km/all #task #P0 @Bjørn Stabell

## Question

createTestApp currently has async methods (press, command, type return Promise).
This was inherited from the board driver's async press() pattern. But is async
actually necessary? The headless backend is already synchronous under the hood.

If both backends could be fully synchronous, tests would be dramatically simpler:

```typescript
// Current (async everywhere):
test("foo", async () => {
  using app = await createTestApp(item("board", item("col1")))
  await app.command("cursor_down")
  await app.command("cursor_right")
  app.expect("#2a[data-cursor]").toExist()
})

// Ideal (fully sync):
test("foo", () => {
  using app = createTestApp(item("board", item("col1")))
  app.command("cursor_down")
  app.command("cursor_right")
  app.expect("#2a[data-cursor]").toExist()
})
```

## Why async exists

1. **Headless**: `createBoardDriver.press()` is async because silvery's `App.press()`
   returns `Promise<App>`. But the actual work (handleKey + React act + render) is
   synchronous inside act(). The async is a formality.

2. **Termless**: `handle.press()` is genuinely async because it needs to flush through
   the xterm.js emulator and wait for rendering to propagate.

## Investigation needed

1. Can the headless backend's press/command be made synchronous? What breaks?
2. Can the termless backend use a synchronous pattern (e.g., flush emulator
   inline after each key, blocking until the render completes)?
3. Would vitest support `using app = createTestApp(...)` (sync) cleanly?
4. What does testEnv's synchronous press() actually do under the hood? It works
   without await — can we replicate that pattern?

## Impact

If solved, this eliminates:
- `async () => {}` on every test
- `await` before every press/command/type
- The entire TestAppChain thenable machinery
- The `createTestApp` being async (ready() workaround)
- The termless settle delay (TERMLESS_SETTLE_MS = 50ms per operation)

Tests become as ergonomic as testEnv (sync) while supporting both backends.

## /complete criteria
- Decision documented: sync possible or not, with evidence
- If possible: createTestApp and all methods are sync
- If not: document WHY async is necessary with specific code paths