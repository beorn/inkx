# Read the Factory, Not the Wrapper

**TL;DR**: When investigating a subsystem, read the factory function that creates the thing — not the test helper or convenience wrapper. The factory reveals what the system actually supports. The wrapper shows what someone needed once.

---

## The Incident

An agent spent hours debugging a "rendering bug" (stale pixels after detail pane close). The investigation went through:

1. Dirty row tracking fixes in the render phase
2. prevBuffer invalidation in the output phase
3. Shared scoped state pollution between pipeline calls
4. skipOutput option to bypass the discarded output phase

None worked. The agent was stuck because it assumed the board driver (`createBoardDriver`) was the only way to test the km app, and the driver skips the output phase entirely (headless rendering).

The fix was trivial: `createBoardApp(storeParams).run(createTermless())` — the app factory already supports running with any terminal backend, including termless (in-process xterm.js). This exercises the full 5-phase pipeline. The board driver builds the identical `storeParams` — it just never passes a real terminal.

The agent didn't discover this because:
- It read `driver.ts` (the wrapper) thoroughly
- It read `board-app.ts` lines 0-50 (imports) but not line 1132 (`createBoardApp()`)
- The test skill docs only document `createBoardDriver` and `testEnv`, not `createBoardApp().run(term)`
- The docs describe tools (how to use X) not architecture (what X wraps, what it skips, what alternatives exist)

## The Pattern

```
User-facing wrapper  →  hides  →  Factory function  →  reveals full capability
createBoardDriver    →  hides  →  createBoardApp     →  supports any Term backend
testEnv              →  hides  →  createRenderer     →  supports diagnostics, incremental
run(<App />, term)   →  hides  →  createApp          →  supports stores, providers, events
```

Wrappers are ergonomic shortcuts. They're optimized for the common case. But they HIDE capability by making choices (headless, no output phase, default options). When you hit a wall with a wrapper, **read the factory it wraps** — the full capability is there.

## The Rule

When investigating a subsystem you don't own:

1. **Find the factory**: `grep "export function create"` in the package. This is the real API.
2. **Read its signature**: What parameters does it accept? What does it return? What options exist?
3. **Trace the wrapper**: How does the convenience wrapper call the factory? What does it hardcode? What does it skip?
4. **Check for unused capability**: Does the factory support options the wrapper doesn't expose? That's your answer.

## Applied to Testing

The km testing architecture has three layers:

```
Test helper (testEnv, createBoardDriver)
  └── App factory (createBoardApp, createApp)
      └── Pipeline (executeRender, outputPhase, createTermless)
```

Test helpers pick a single path through the factory. But the factory supports multiple paths:

| Helper | Factory call | What it exercises |
|--------|-------------|-------------------|
| `testEnv()` | `createRenderer()` | Buffer only (phases 1-4) |
| `createBoardDriver()` | `createBoardApp()` + headless | Buffer + state (phases 1-4) |
| `createBoardApp().run(termless)` | Full pipeline | All 5 phases including ANSI output |

The third option was always available — nobody wired it up for tests because the wrappers were "good enough."

## See Also

- [Discoverable Interfaces](discoverable-interfaces.md) — put operations on core objects, not ad-hoc helpers
- [Testing Escape Hatches](testing-escape-hatches.md) — when the test infra doesn't cover a case
