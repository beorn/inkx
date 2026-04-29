---
id: "@km/silvery/lifecycle-scope"
aliases:
  - km-silvery.lifecycle-scope
  - km-silvery-lifecycle-scope
created_by: claude:0940ca20
created_at: 2026-04-24T17:57:16Z
closed_at: 2026-04-25T06:45:58Z
close_reason: "Shipped: vendor/silvery 7d9ee8081 + km main 84ac75043.
  useScope/useAppScope/useScopeEffect hooks + ScopeProvider + handle.scope.
  silvercode App.tsx migrated. 5 tests pass under vendor project. Decisions on 7
  open questions documented in agent report. Phase 3 (subprocess ownership
  migration) + Phase 5 (delete useDispose) deferred to follow-up beads."
started_at: 2026-04-25T06:32:22Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.lifecycle-scope
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-24T10:57:34Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] Silvery runtime-integrated structured-concurrency scope for managed resources @km/silvery #feature #P0 @claude:2405c72e

blocks:: [[@km/silvery]]

Silvery should expose a runtime-integrated structured-concurrency scope (via @silvery/scope, which already exists as a library but is not wired to the runtime) so that resources spawned inside a silvery app get cleaned up automatically when the app exits.

## Principle

Apps that spawn subprocesses, open files, register watchers, or hold any disposable resource currently have to write ~10 lines of per-resource boilerplate to wire cleanup into every exit path (SIGINT/SIGTERM/React unmount/uncaught exception). Silvery's existing META-fix pattern (Output/Modes/Input/Signals — one owner per Term mediates every registration) stops one layer short: Lifecycle is never exposed as a first-class hook-shaped surface.

@silvery/scope already ships the structured-concurrency primitive (Disposable, defer, child scopes, AbortSignal propagation, using-compatible). It just isn't wired into run()/createApp().

## The desired shape (API TBD)

The goal: resources self-register cleanup on an ambient scope; apps don't write any cleanup wiring.

Sketch — NOT the final API, this is the problem statement:

  // silvery runtime creates a root scope at run() time, disposes on teardown.
  const scope = useScope()
  const session = spawnClaude({ scope, cwd })
  // spawnClaude internally: scope.defer(() => session.close())
  // When silvery tears down → scope disposes → session.close fires.
  // No useDispose, no useEffect cleanup.

Or a higher-level resource hook:

  const session = useSpawnClaude({ cwd })   // hook reads ambient scope, registers
  // session is valid for the lifetime of the scope; tears down automatically.

## Why P0

Ergonomics of subprocess-spawning silvery apps is today a 10-line-boilerplate barrier. /silvery-native/ agent apps (silvercode is the first, but pam/openclaw/kimmi all need the same) will reinvent this wiring unless silvery exposes the pattern.

Surfaced during silvercode dogfood — /big session 2026-04-24 flagged the lifecycle plumbing as the #1 ergonomic gap. User pushed back on a preliminary useDispose(fn) hook as still not-quite-right.

## Open design questions

- Is the API a hook (useScope / useSpawnX), context, or constructor arg?
- Does run()/createApp() always create a root scope, or opt-in via option?
- How does it interact with React reconciler lifetime? (component unmount vs app exit)
- How does it compose with useDispose (current shipped ergonomic stopgap)?
- Does it replace AgentSession.close(), or wrap it?
- What about async dispose ordering — LIFO like @silvery/scope today, or priority-tagged like term.signals?
- How does a subtree get its own child scope (for modals, tabs, etc.)?

## Current stopgap (shipped in silvercode 2026-04-24)

useDispose(fn) hook in silvery (vendor/silvery/packages/ag-react/src/hooks/useDispose.ts, commit ed086099). One line at call site, wires SIGINT + SIGTERM + React unmount. Apps write the fn; silvery wires the exit paths.

That removes 10 lines of boilerplate but still requires the app author to know about dispose as a concept and call the hook. The scope-based design removes the hook too: resources register themselves.

## Success criteria

- spawnClaude-style resource factories self-register cleanup on the ambient scope.
- Zero per-call-site cleanup code in the common case.
- Escape hatch for custom dispose priorities / before-after ordering (drop down to term.signals.on).
- Playable against real silvercode: App.tsx has no useDispose/useEffect/cleanup anywhere; subprocesses just die when silvery exits.