---
id: "@km/tribe/composition-pipe"
aliases:
  - km-tribe.composition-pipe
  - km-tribe-composition-pipe
created_by: claude:2405c72e
created_at: 2026-04-27T00:36:21Z
closed_at: 2026-04-27T08:07:39Z
close_reason: "Migrated tribe-daemon to pipe + with* composition.
  tribe-daemon.ts boots via pipe(...) at line 151, ends with await tribe.run()
  at line 1933. Added composition primitives (pipe/Scope/Tool registry) to
  @bearly/daemon-spine + 11 withX factories in tools/lib/tribe/compose/. 35 new
  tests pass; existing tribe-daemon tests pass (events-agent classification work
  owns the 2 ambient-inbox failures). Hub docs trimmed to current-state per
  acceptance NOTES. Commits: bearly 8444223, d947597, dace517; km a0c9bfb5b.
  Follow-on bead filed for runtime decomposition."
---

# [x] Migrate tribe-daemon to pipe + with* composition @km/tribe #feature #P2 @claude:87d20187

blocks:: [[@km/tribe/refactor]]

## Problem

tribe-daemon's setup is imperative: createDaemonContext → bindSocket → mountMCPHandlers → loadPlugins, with implicit boot order and ad-hoc cleanup. Reading boot order requires walking through tribe-daemon.ts. Hot-reload, shutdown, and test teardown each have their own cleanup code path. The TribePluginApi.start(api) → cleanup return-thunk shape is different from silvery's Scope-based lifecycle.

## Goal

Migrate to the layered `pipe + with*` composition strategy described in `hub/composition.md`. Factory function reads top-to-bottom as the architecture:

```typescript
const tribe = pipe(
  createBaseTribe({ scope, db }),
  withProjectRoot(opts.root),
  withSocket(),
  withDispatch(),
  withTools(),
  withTool(loreTools()),
  withTool(messagingTools()),
  withMCPServer(),
  withPlugin(gitPlugin),
  withPlugin(beadsPlugin),
  withPlugin(githubPlugin),
  withPlugin(healthPlugin),
  withPlugin(accountlyPlugin),
)
await tribe.run()
```

Tool families match `hub/architecture.md` vocabulary (messagingTools, loreTools). Coordination methods (chief lease, claim, release) are part of messagingTools per architecture.md component reference; no separate coordinationTools family.

Entry point is `tribe.run()`, not `tribe.start()` — aligns with silvery's `run(view, …)`, era2 lifecycle, and the auto-start vs run distinction in architecture.md ("Auto-start vs app.run()" section).

## Wins

- Story = code: factory function IS the architecture description
- Type-driven prerequisites: order enforced by types
- Uniform Scope-based cleanup (cascade on shutdown / hot-reload / test teardown)
- Tool registry decoupled from surfaces (MCP, JSON-RPC, future protocols all read same registry)
- Same pattern across km, silvery, tribe — one mental model

## Phases

1. Add `vendor/bearly/packages/composition/` with pipe + Scope plumbing primitives (~50 LOC). Could absorb into `@bearly/tribe-client` if smaller.
2. Wrap existing tribe-daemon setup as withX factories one at a time — withProjectRoot, withSocket, withDispatch. Existing imperative code keeps working alongside.
3. Introduce tool registry primitive: `Tool { name, schema, handler }`. Migrate inline tribe-daemon tools (send, broadcast, members, history, leadership) to registry entries via `withTool(messagingTools())`.
4. Migrate lore methods (ask, brief, plan, session, workspace, inject_delta) to `withTool(loreTools())`. Drop the special-case lore plugin path.
5. Migrate observer plugins (git, beads, github, health, accountly) to `withPlugin(p)`.
6. Switch tribe-daemon.ts boot to a `pipe(...)` call. Keep behavior identical — no public-API changes.
7. Test fixtures move to the same `pipe(...)` form.

## Out of scope (separate beads if needed)

- Renaming @bearly/daemon-spine → @bearly/tribe-client (queued)
- Renaming plugins/mcp → plugins/shared-mcp (queued)
- Renaming tribe-proxy.ts → stdio-adapter name (queued)
- silvery/km migration to same pattern (lower priority, no organic trigger yet)

## Acceptance

- tribe-daemon.ts top-level boot is a `pipe(...)` call
- Tool registry exists; tools are protocol-agnostic
- All existing tribe.* methods work identically over MCP and direct JSON-RPC
- Scope cascades cleanup on shutdown / hot-reload / test teardown
- Factory ends with `await tribe.run()`
- No regressions in tribe tests

## Reference

- `hub/composition.md` — strategy doc
- `hub/architecture.md` — runtime topology this factory produces; vocabulary; component reference
- `hub/silvery/design/lifecycle-scope.md` — the Scope primitive