# Composition strategy

How we compose apps and systems across km, silvery, and tribe. The factory function should tell the story of the architecture — read it top to bottom and you understand what the system *is*.

## Principle

**The factory is the architecture.** A reader who's never seen the codebase should be able to read the top-level factory function and understand what the system is composed of, in what order, with what dependencies, and what cleanup is owed.

```typescript
const tribe = pipe(
  createBaseTribe({ scope }),
  withProjectRoot(opts.root),
  withSocket(),
  withTools(),
  withTool(loreTools()),
  withTool(messagingTools()),
  withMCPServer(),
  withPlugin(gitPlugin),
  withPlugin(beadsPlugin),
  withPlugin(githubPlugin),
)
await tribe.run()
```

Anything that requires reading `init.ts`, `setup.ts`, `bootstrap.ts`, `wire-up.ts`, or eight constructors to understand the boot order has lost the plot.

## The pattern: `pipe + with*`

A small functional combinator (~30 LOC, no deps) and a convention:

```typescript
// pipe — left-to-right function composition
export function pipe<A, B>(a: A, ab: (a: A) => B): B
export function pipe<A, B, C>(a: A, ab: (a: A) => B, bc: (b: B) => C): C
// ...overloads to ~12

// withX — typed capability extension
//
//   withProjectRoot(root): (t: Tribe) => Tribe & { projectRoot: ProjectRoot }
//   withSocket():          (t: Tribe & { projectRoot }) => Tribe & { socket }
//   withMCPServer():       (t: Tribe & { socket }) => Tribe & { mcpServer }
//   withTool(tool):        (t: Tribe & { mcpServer }) => same type (mutates registry)
//
// Each `withX` is a curried factory: `withX(config)` returns a transform.
```

Three rules govern the shape:

1. **Each `withX` only typechecks if its prerequisites are upstream.** `withSocket()` requires `projectRoot` to already exist on the type. The compiler tells you the order.
2. **Each `withX` registers its own cleanup on the passed `Scope`.** The base value carries a `scope: Scope`; `withSocket` does `scope.defer(() => server.close())`. Closing the root scope cascades cleanup in reverse-registration order.
3. **`withX` factories are pure values until applied.** `withTool(loreTools())` is a description; running `pipe(...)` is what actually wires it up. This means tests can introspect the composition before executing it.

## Why this beats the alternatives

| Pattern | Reads as | Cleanup story | Test story |
|---|---|---|---|
| `pipe + with*` | A list of capabilities, top-down | Scope-cascaded, automatic | Each `with*` testable in isolation; whole pipe testable as data |
| Constructor injection | A pile of dependencies | Manual disposers, easy to forget | Mocking dependency graphs |
| Builder method-chain (`.withX().withY()`) | Same readable order | Same as pipe but harder to compose programmatically | Same |
| Imperative setup script | A wall of side effects | Whatever you remembered | Hard — order is implicit |
| Plugin registry + `start(api)` (tribe today) | A list of names, semantics buried | Manual `() => void` cleanups | Plugin-by-plugin, but lifecycle ad-hoc |

The four key wins of `pipe + with*`:

1. **Story = code.** The factory function reads as the architecture diagram. No separate "boot order" doc to drift.
2. **Type-driven prerequisites.** Composition order is enforced by types, not comments or runtime asserts. Try to call `withSocket()` before `withProjectRoot()` and TypeScript stops you.
3. **Uniform lifecycle.** Every `withX` participates in the same `Scope` cascade. Hot-reload, shutdown, test teardown all use the same primitive. This aligns with the existing rule from MEMORY.md: *"resource leak / lifecycle / cleanup → `Scope` is the canonical primitive."*
4. **One pattern across km + silvery + tribe.** Anyone who knows the pattern for one knows it for all three. Reduces onboarding cost and cross-system context-switching.

## Companion patterns — the canonical runtime stack

Composition is the *structural* layer. It interlocks with three other patterns to form the full app runtime — used uniformly across silvery, km, silvercode, and tribe:

| Pattern | Role | Where the doc lives |
|---|---|---|
| **Composition** (this doc) | Structure: factory produces the system. `pipe + with*`. | hub/composition.md |
| **TEA** (`apply` / `dispatch`) | Behavior: pure `(action, state) → [state, effects]` state machines. Effects are serializable data. | [docs/design/tea.md](../docs/design/tea.md) |
| **Reactive store** (alien-signals + family) | Derived state, projections, subscriptions. Signals are atomic; `alien-projections` for collections, `alien-trees` for hierarchies, `alien-resources` for async. | `vendor/bearly/packages/alien-*/` |
| **Scope** (lifecycle) | Structured concurrency. `AsyncDisposableStack` + `AbortSignal` + child cascade. `withScope()` at the root, `useScopeEffect` in components. | [hub/silvery/design/lifecycle-scope.md](./silvery/design/lifecycle-scope.md) |

### How they interlock

```
pipe + with*       ← structure: factory produces the system value
  ├─ withScope()              ← scope: lifetime owner for everything below
  ├─ withSignalStore()        ← reactive store: signals + projections
  ├─ withMachines(...)        ← TEA: apply(action, state) → [state, effects]
  ├─ withTools()
  ├─ withTool(...)
  └─ withSurfaces()           ← surfaces read the registry; effects + signals
                                drive what they emit
await app.run()    ← run loop: dispatch → apply → emit effects → schedule async
                    work on scope; signals notify subscribers; cleanup cascades
                    when scope closes
```

The four are orthogonal but always-together:

- **Composition** wires the parts. Without it, "boot order" is implicit.
- **TEA** owns behavior. Actions are dispatched, state advances purely, effects describe the async work to schedule.
- **Signals** carry derived/observed state. Components and surfaces (MCP tools, render trees, log streams) subscribe to signals; signals re-compute when their inputs change.
- **Scope** owns lifetime. Every `withX` registers cleanup. Closing the root scope cascades — sockets close, subprocesses term, subscriptions drop, timers cancel — in reverse-registration order.

### Same shape across the apps

- **silvery apps** — composition wires term/theme/scope; TEA drives view state machines; signals drive derived UI; scope cleans timers + subscriptions
- **km** — composition wires vault/storage/board/commands; TEA drives the editor + command dispatch; signals drive board projections; scope owns file watchers + DB connections
- **silvercode** — composition wires controller/harness/sessions; TEA drives session state; signals drive pane projections; scope owns subprocesses + ACP connections
- **tribe** — composition wires socket/dispatch/tools/MCP/plugins; TEA drives messaging state machines; signals drive member roster + activity log; scope owns the daemon's resources

You can read the composition pipe top-to-bottom and know what's in the system. You can read a state machine's `apply` and know what it does. You can read a component's signals and know what it observes. You can read the scope's children and know what cleanup is owed. Each layer has one shape; together they describe the app.

The rest of this doc focuses on composition specifically. TEA, signals, and Scope each have their own design doc.

## Concrete shapes

### tribe (proposed migration)

Today, tribe-daemon's setup is imperative:

```typescript
// vendor/bearly/tools/tribe-daemon.ts (current, simplified)
const ctx = createDaemonContext({ ... })
const socket = bindSocket(socketPath)
const mcp = mountMCPHandlers(socket, ctx)
const plugins = loadPlugins([gitPlugin, beadsPlugin, ...], tribeClientApi)
// ...lots of imperative wiring...
```

Proposed:

```typescript
const tribe = pipe(
  createBaseTribe({ scope, db: openDb(dbPath) }),
  withProjectRoot(opts.root),
  withSocket(),                          // binds socket; defers close on scope
  withDispatch(),                        // wires JSON-RPC dispatcher to socket

  // Tool registry — protocol-independent.
  // withTools() establishes the registry slot on the daemon value;
  // withTool() is a helper that appends. Plugins may also write to the
  // registry directly when they have reason to.
  withTools(),                           // value.tools = new Map()
  withTool(loreTools()),                 // memory + recall
  withTool(messagingTools()),            // tribe.send / broadcast / members
  withTool(coordinationTools()),         // chief lease, claim, release

  // Surfaces — read tools from the registry, expose them over a wire.
  withMCPServer(),                       // serves registered tools over MCP

  // Observer plugins — push messages onto the wire, no tools registered.
  withPlugin(gitPlugin),
  withPlugin(beadsPlugin),
  withPlugin(githubPlugin),
  withPlugin(healthPlugin),
  withPlugin(accountlyPlugin),
)
```

Reading top-to-bottom:
- Tribe needs a project root and a scope (lifetime owner)
- It binds a Unix socket (cleaned up via scope)
- It wires a JSON-RPC dispatcher
- It registers tool families: lore, messaging, coordination
- The MCP server reads the tool registry and exposes it as MCP
- Observer plugins push messages onto the wire (no tools, just events)

### Tool registry — the load-bearing decoupling

The registry is a plain data structure (a `Map<string, ToolDef>`) on the daemon value. `withTools()` establishes it. `withTool(tools)` is a helper that appends. A plugin or surface that needs unusual access can read/write `value.tools` directly without going through the helper. **Surfaces** (MCP server, JSON-RPC dispatcher, future protocols) are independent consumers of that registry:

```
                  withTool(loreTools)
                  withTool(messagingTools)   ←─ populates registry
                  withTool(coordinationTools)
                          │
                          ▼
                  ┌──────────────┐
                  │ tool registry│  (in-process, single source of truth)
                  └──────────────┘
                          │
              ┌───────────┼───────────────┐
              ▼           ▼               ▼
         withMCPServer  withDispatch   (future surface)
         (MCP wire)     (raw JSON-RPC)
```

Three consequences:

1. **Tools are protocol-agnostic.** A tool definition is `{ name, schema, handler }` — it doesn't know whether it's being called over MCP, raw JSON-RPC, or a hypothetical future agent protocol. `withMCPServer()` is one of several possible surfaces; nothing prevents `withRESTServer()` or `withAgentProtocolServer()` later.

2. **Order between `withTool` and `withMCPServer` is loose.** The MCP server reads the registry at start time (or subscribes for late-additions). You can register tools before or after the server appears in the pipe. We *prefer* tools-before-server in the factory because it matches the reading order, but the architecture doesn't require it.

3. **The same tool can flow over multiple surfaces simultaneously.** A direct tribe client over Unix socket calls `tribe.ask` via JSON-RPC dispatch; an agent connected via the stdio adapter calls `tribe.ask` via MCP. Both go through the same handler in the registry. No duplication, no protocol-specific re-implementation.

This is the same separation that `@apollo/server` makes between schema (the registry) and `expressMiddleware` / `startStandaloneServer` (the surfaces), and that Effect's `Layer` makes between service definitions and runtime providers.

### silvery (already partially this shape)

```typescript
const app = pipe(
  createBaseApp({ scope }),
  withTerm(termOptions),                 // terminal capability
  withTheme(theme),                      // semantic tokens, $primary etc.
  withFocus(),                           // focus manager
  withScopeIntegration(),                // useScopeEffect, withScope
  withCommands(commandRegistry),         // input dispatch
  withView(<App />),                     // React tree mount
)
```

Already partially shipped: `withScope`, theme injection, focus scopes. Migration to a uniform `pipe + with*` factory is incremental — wrap existing setup helpers as `withX` factories, then assemble.

### km (commands + render)

```typescript
const km = pipe(
  createBaseKm({ scope }),
  withVault(vaultPath),                  // filesystem source of truth
  withStorage(storage),                  // SQLite + sync layer
  withTree(treeStore),                   // tree model
  withBoard(boardStore),                 // board view-model
  withCommands(kmCommandRegistry),       // command dispatch
  withRenderer(silveryRuntime),          // mounts silvery app
)
```

The km command system stays as-is internally — it's an *output* of `withCommands(...)`, not a replacement for the composition pattern.

## Lifecycle integration

Every `with*` accepts (or transitively has access to) the base's `scope: Scope`. Cleanup registration is non-optional and uniform:

```typescript
function withSocket() {
  return <T extends BaseTribe & WithProjectRoot>(t: T): T & WithSocket => {
    const path = resolveSocketPath(t.projectRoot)
    const server = bindSocket(path)
    t.scope.defer(async () => {
      await server.close()
      await rmSocketFile(path)
    })
    return { ...t, socket: { path, server } }
  }
}
```

When the root scope closes (daemon shutdown, hot-reload, test teardown), the `defer`-ed cleanups fire in reverse-registration order. This is the same `Scope` primitive `withScope`/`useScopeEffect` use in silvery components.

`SILVERY_SCOPE_TRACE=1` instrumentation extends through tribe automatically once tribe migrates to this pattern.

## Async — outside the pipe, then `app.run()`

`pipe` is synchronous. Two principles handle every async case:

**1. Async setup happens outside the pipe.** If something must be awaited (read config, open a database, fetch keys, resolve a socket path against a remote), do it before `pipe(...)` and pass the result in:

```typescript
// Async work BEFORE the pipe — keeps pipe pure and synchronous.
const db = await openDb(dbPath)
const config = await readConfig(opts.configPath)

const tribe = pipe(
  createBaseTribe({ scope, db, config }),
  withProjectRoot(opts.root),
  withSocket(),
  withTools(),
  withTool(loreTools()),
  // ...
)

await tribe.run()
```

**2. Ongoing async — events, streams, subscriptions, long-running work — is TEA.** `pipe` produces the system as a value; TEA describes its runtime behavior. Every interactive subsystem is `(action, state) → [state, effects]`; effects are the place async runtime concerns live (subscribing to a socket, broadcasting on a channel, polling git). The composition wires them up; TEA runs them.

See [docs/design/tea.md](../docs/design/tea.md) for the TEA pattern. The composition pattern and TEA are complementary: composition is for *structure*, TEA is for *behavior*.

**The entry point is `app.run()`, not `app.start()`.** Aligns with silvery's runtime (`run(view, …)`) and the era2 lifecycle. `run()` opens sockets, mounts surfaces, fires plugin observers, and returns when the scope closes (shutdown, SIGTERM, fatal error). Tests typically call `run()` and either let it run to completion or close the scope to terminate.

## Error handling

A `withX` that throws aborts composition. Cleanup runs because the scope closes on the catch:

```typescript
try {
  const tribe = pipe(createBaseTribe({ scope }), withProjectRoot(...), withSocket(), ...)
  await tribe.run()
} catch (err) {
  await scope.close()                     // fires registered cleanups in reverse
  throw err
}
```

This matches structured-concurrency intent: partial composition is fully cleaned up.

## When to use

- Top-level system factories: tribe-daemon, silvercode app, km app, silvery runtime
- Subsystems with optional capabilities: storage layers (with/without FTS, sync, encryption), test harnesses (with/without termless, with/without real network)
- Anything that reads as "create the base, then layer on capabilities"

## When *not* to use

- Hot paths and inner loops — `pipe` allocates closures per step
- Single-purpose functions with no optional capabilities — overkill
- Pure data transformations — use direct function calls
- React component trees — that's React's job, not ours; don't reinvent

## Type evolution

Each `withX` extends the type. The pipe's final type is the union of all extensions:

```typescript
type Base = { scope: Scope }
type WithProjectRoot = { projectRoot: ProjectRoot }
type WithSocket = { socket: SocketHandle }
type WithTools = { tools: Map<string, ToolDef> }
type WithMCP = { mcpServer: McpServer }

const tribe = pipe(
  createBaseTribe({ scope }),                            // Base
  withProjectRoot(root),                                  // Base & WithProjectRoot
  withSocket(),                                           // ... & WithSocket
  withTools(),                                            // ... & WithTools
  withTool(loreTools()),                                  // ... (no new type; appends to tools)
  withMCPServer(),                                        // ... & WithMCP
)
// inferred: Base & WithProjectRoot & WithSocket & WithTools & WithMCP
```

TypeScript's intersection types do this automatically. The `pipe` overloads thread the types through.

## Costs (be honest)

- **Overload boilerplate.** `pipe` needs ~12 overloads to type N-step compositions. One-time cost in a util file.
- **Type errors get verbose.** When step 7 fails because step 4 didn't add the right field, the error is at step 7 mentioning the cumulative intersection type. Mitigation: extract intermediate types as named aliases.
- **Curry indirection.** `withTool(t)` returns a function — slightly more code than `tribe.addTool(t)`. Real cost; bought back in composability.
- **Async pipe is not free.** We sidestep entirely: sync `pipe`, async work outside it (before) or in TEA (during runtime).

## What this replaces

- The `TribePluginApi.start(api) → cleanup` shape (still available; `withPlugin(p)` wraps it for backward compat)
- Imperative wiring in tribe-daemon.ts boot
- Ad-hoc test fixtures that hand-build a daemon with three constructor calls

## Migration path for tribe

1. Add `vendor/bearly/packages/composition/` with `pipe` + scope plumbing primitives (~50 LOC). Could absorb into `@bearly/tribe-client` since it's tribe-shaped infrastructure.
2. Wrap existing tribe-daemon setup as `withX` factories one at a time. Existing code keeps working.
3. Migrate `tribe-daemon.ts` boot to a `pipe(...)` call.
4. Migrate observer plugins to `withPlugin(p)` (same shape, just composed via pipe).
5. Tests that build a synthetic tribe switch to the same `pipe(...)` form.

Estimate: 1-2 sessions, low risk (no public-API changes; tribe MCP wire stays identical).

Bead: `km-tribe.composition-pipe` (P2 design+exec).

## Migration path for silvery / km

Lower priority. Both already work. Migrate when:
- Silvery is ready to standardize the `with*` providers (currently partial)
- km's app boot needs a refactor for some other reason

Don't force a churn pass for consistency alone — wait for an organic trigger.

## See also

- [hub/architecture.md](./architecture.md) — the runtime topology these factories produce
- [hub/silvery/design/lifecycle-scope.md](./silvery/design/lifecycle-scope.md) — the `Scope` primitive every `withX` participates in
- Effect's `Layer` and Apollo Server's `ApolloServer.create` — same idea, different ecosystems
