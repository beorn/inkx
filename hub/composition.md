# Composition strategy

How we compose apps and systems across km, silvery, and tribe. The factory function should tell the story of the architecture — read it top to bottom and you understand what the system *is*.

## Principle

**The factory is the architecture.** A reader who's never seen the codebase should be able to read the top-level factory function and understand what the system is composed of, in what order, with what dependencies, and what cleanup is owed.

```typescript
const tribe = pipe(
  createBaseTribe({ scope }),
  withProjectRoot(opts.root),
  withSocketServer(),
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
//   withSocketServer():          (t: Tribe & { projectRoot }) => Tribe & { socket }
//   withMCPServer():       (t: Tribe & { socket }) => Tribe & { mcpServer }
//   withTool(tool):        (t: Tribe & { mcpServer }) => same type (mutates registry)
//
// Each `withX` is a curried factory: `withX(config)` returns a transform.
```

Three rules govern the shape:

1. **Each `withX` only typechecks if its prerequisites are upstream.** `withSocketServer()` requires `projectRoot` to already exist on the type. The compiler tells you the order.
2. **Each `withX` registers its own cleanup on the passed `Scope`.** The base value carries a `scope: Scope`; `withSocketServer` does `scope.defer(() => server.close())`. Closing the root scope cascades cleanup in reverse-registration order.
3. **`withX` factories are pure values until applied.** `withTool(loreTools())` is a description; running `pipe(...)` is what actually wires it up. This means tests can introspect the composition before executing it.

## Why this beats the alternatives

| Pattern                                    | Reads as                          | Cleanup story                                       | Test story                                                    |
| ------------------------------------------ | --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| pipe + with*                               | A list of capabilities, top-down  | Scope-cascaded, automatic                           | Each with* testable in isolation; whole pipe testable as data |
| Constructor injection                      | A pile of dependencies            | Manual disposers, easy to forget                    | Mocking dependency graphs                                     |
| Builder method-chain (.withX().withY())    | Same readable order               | Same as pipe but harder to compose programmatically | Same                                                          |
| Imperative setup script                    | A wall of side effects            | Whatever you remembered                             | Hard — order is implicit                                      |
| Plugin registry + start(api) (tribe today) | A list of names, semantics buried | Manual () => void cleanups                          | Plugin-by-plugin, but lifecycle ad-hoc                        |

The four key wins of `pipe + with*`:

1. **Story = code.** The factory function reads as the architecture diagram. No separate "boot order" doc to drift.
2. **Type-driven prerequisites.** Composition order is enforced by types, not comments or runtime asserts. Try to call `withSocketServer()` before `withProjectRoot()` and TypeScript stops you.
3. **Uniform lifecycle.** Every `withX` participates in the same `Scope` cascade. Hot-reload, shutdown, test teardown all use the same primitive. This aligns with the existing rule from MEMORY.md: *"resource leak / lifecycle / cleanup → `Scope` is the canonical primitive."*
4. **One pattern across km + silvery + tribe.** Anyone who knows the pattern for one knows it for all three. Reduces onboarding cost and cross-system context-switching.

## Companion patterns — the canonical runtime stack

Composition is the *structural* layer. It interlocks with four other patterns to form the full app runtime — used uniformly across silvery, km, silvercode, and tribe:

| Pattern                                            | Role                                                                                                                                                                                                                                                                                                  | Where the doc lives                   |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Composition (this doc)                             | Structure: factory produces the system. pipe + with*.                                                                                                                                                                                                                                                 | hub/composition.md                    |
| Inner domain reducers (Board.apply, Tree.apply, …) | Pure-state-machine layer. (state, op) → [state, effects], shipped (Phase 2a navigation reducer). The outer app-level dispatch/apply plugin bus is being designed — see hub/futures.md.                                                                                                                | docs/design/tea.md                    |
| alien-signals (reactive view generation)           | Derived state, projections, subscriptions. alien-projections for collections, alien-trees for hierarchies, alien-resources for async. Today plugins import alien-signals directly and expose signals on their slice of the daemon value. A cross-plugin signal-store API is parked in hub/futures.md. | vendor/bearly/packages/alien-*/       |
| Scope (lifecycle)                                  | Structured concurrency. AsyncDisposableStack + AbortSignal + child cascade. withScope() at the root, useScopeEffect in components.                                                                                                                                                                    | hub/silvery/design/lifecycle-scope.md |
| Loggily (observability)                            | Structured logs through one pipeline. createLogger("ns:thing") everywhere; host apps wire addWriter(createFileWriter(path)) at startup. Namespace IS the separator — never reinvent file-JSONL writes locally.                                                                                        | .claude/skills/logging/SKILL.md       |

### How they interlock

There is no special machinery — the entire runtime is just `pipe + with*` plugins composing together. State lives in the plugin that creates it; no centralized dispatch bus. A signal-store primitive for cases where plugins need to share derived state is parked in [hub/futures.md](./futures.md#signal-store-api).

```
pipe + with*       ← structure: factory produces the system value
  ├─ withScope()              ← scope: lifetime owner for everything below
  ├─ withProjectRoot()        ← config / env / project-rooted state
  ├─ withDatabase()           ← persistence layer
  ├─ withTools()              ← protocol-agnostic tool registry
  ├─ withTool(...)            ← register tool families
  └─ withMCPServer()          ← surface: serve registered tools over a wire
await app.run()    ← scope owns lifetime; cleanup cascades on close
```

The patterns each `withX` plugin uses internally — when it needs them:

- **Inner domain reducers** — `Board.apply(state, op) → [state, effects]` and friends — are the pure-state-machine layer (shipped per [docs/design/tea.md](../docs/design/tea.md)). Each plugin owns when and how it consults its own reducer. The outer app-level `dispatch/apply` plugin bus that would route ops between plugins is being designed — open questions are parked in [hub/futures.md](./futures.md#tea-effect-emission-shape).
- **`alien-signals`** — for reactive view generation (derived state, projections, subscriptions). Today plugins import `alien-signals` directly and expose signals on their slice of the daemon value. A shared signal-store is parked in [hub/futures.md](./futures.md#signal-store-api); until then, plugins reach for `alien-signals` themselves.
- **`scope.defer(...)`** — for cleanup. Every `withX` that allocates a resource registers its own teardown on the passed scope. Closing the root scope cascades in reverse-registration order.
- **`createLogger("namespace:thing")` from loggily** — for observability. Every subsystem logs through one pipeline; namespaces separate. New subsystems do **not** ship a local `createLogger` or `fs.appendFileSync`.

The pattern is uniform: a plugin owns its state, its reducer (if any), its signals (if any), its cleanup, and its observability. The daemon value carries each plugin's slice. `pipe` composes them. Nothing in the middle orchestrates.

A `withX` factory typically does three things: extends the daemon value with a new field, registers cleanup on the scope, and (if needed) reads tools from the registry to wire them. No machine-orchestration layer in the middle.

```typescript
// Inside a with* factory — narrow, additive, scope-aware
function withSocketServer<T extends BaseTribe & WithProjectRoot>(): (t: T) => T & WithSocket {
  return (t) => {
    const path = resolveSocketPath(t.projectRoot)
    const server = createServer().listen(path)
    chmodSync(path, 0o600)
    t.scope.defer(async () => {
      await new Promise<void>((r) => server.close(() => r()))
      rmSocketFile(path)
    })
    return { ...t, socket: { path, server } }
  }
}

// Tool handler reads tools/state directly — no dispatch wrapper layer:
const sendTool: ToolDef = {
  name: "tribe.send",
  schema: z.object({ to: z.string(), text: z.string() }),
  handler: (args, ctx) => {
    if (!ctx.clients.has(args.to)) throw new Error(`unknown member: ${args.to}`)
    ctx.broadcast.send(args.to, args.text)
  },
}
```

The pipe wires capabilities onto the daemon value; tool handlers consume them through `ctx`. No global state, no machinery layer — every capability is reachable through the value passed into the pipe.

### Same shape across the apps

- **silvery apps** — composition wires term/theme/scope; TEA drives view state machines; signals drive derived UI; scope cleans timers + subscriptions
- **km** — composition wires vault/storage/board/commands; TEA drives the editor + command dispatch; signals drive board projections; scope owns file watchers + DB connections
- **silvercode** — composition wires controller/harness/sessions; TEA drives session state; signals drive pane projections; scope owns subprocesses + ACP connections
- **tribe** — composition wires socket/dispatch/tools/MCP/plugins; TEA drives messaging state machines; signals drive member roster + activity log; scope owns the daemon's resources

You can read the composition pipe top-to-bottom and know what's in the system. You can read a state machine's `apply` and know what it does. You can read a component's signals and know what it observes. You can read the scope's children and know what cleanup is owed. Each layer has one shape; together they describe the app.

The rest of this doc focuses on composition specifically. TEA, signals, Scope, and Loggily each have their own design / skill doc.

## Concrete shapes

### tribe

```typescript
const tribe = pipe(
  createBaseTribe({ scope }),
  withConfig(),                          // argv + env → TribeConfig
  withProjectRoot(),                     // process.cwd()
  withDatabase(),                        // open SQLite, defer close on scope
  withDaemonContext(),                   // daemon-role TribeContext bound to daemonSessionId
  withLore(),                            // memory + recall handlers (closed via scope.signal)

  // Tool registry — protocol-agnostic.
  // withTools() establishes the registry slot on the daemon value;
  // withTool() is a helper that appends. Plugins may also write to the
  // registry directly when they have reason to during composition.
  withTools(),                           // value.tools = new Map()
  withTool(messagingTools()),            // tribe.send / broadcast / members / history /
                                         // rename / join / health / reload / retro / chief /
                                         // claim-chief / release-chief / debug
  withTool(loreTools(tribe.lore)),       // tribe.ask / brief / plan / session_register /
                                         // session_heartbeat / sessions_list / workspace_state /
                                         // session_state / inject_delta / status / hello

  // Wire — registry, broadcast, accept loop. After this the daemon is
  // listening but only answers JSON-RPC; MCP-spec frames go to default.
  withClientRegistry(),
  withBroadcast(),
  withSocketServer(),
  withIdleQuit({ … }),
  withDispatcher({ … }),

  // Surface — reads tools from the registry, exposes them over MCP. Sits
  // after the dispatcher because it registers MCP-spec method handlers
  // (initialize, tools/list, tools/call) on `t.dispatcher.register`.
  // Late-bound handlers run in the dispatcher's default branch, so this
  // factory is order-loose with respect to withTool() — tools registered
  // either before or after withMCPServer() show up in tools/list.
  withMCPServer(),                       // serves registered tools over MCP

  // Observer plugins — push messages onto the wire, no tools registered.
  withHotReload({ … }),
  withSignals({ … }),
  withRuntime({ plugins: [...] }),
)
await tribe.run()
```

Reading top-to-bottom:

- Tribe needs a project root and a scope (lifetime owner)
- Config + db + daemon ctx + lore handlers (in-process state, all cleaned up via scope)
- Tool registry — populated by tool families before any surface
- Messaging tools include the coordination methods (chief lease, claim, release) —
  no separate coordinationTools family
- Wire (client registry, broadcast, socket server, idle-quit, dispatcher) accepts
  Unix-socket connections and answers JSON-RPC
- The MCP server registers `initialize` / `tools/list` / `tools/call` on the
  dispatcher; tools/call routes through the existing per-connection JSON-RPC
  handler, so the daemon answers MCP-spec frames natively
- Hot-reload + signals + runtime own lifecycle and observer plugins push
  messages onto the wire (no tools, just events)

### Tool registry — the load-bearing decoupling

The registry is a plain data structure (a `Map<string, ToolDef>`) on the daemon value. `withTools()` establishes it. `withTool(tools)` is a helper that appends. A plugin or surface that needs unusual access can read/write `value.tools` directly without going through the helper, **but only during composition** — once `app.run()` is called, the registry is read-only. Surfaces subscribe to it; they never mutate it from a tool handler or running plugin. **Surfaces** (MCP server, JSON-RPC dispatcher, future protocols) are independent consumers of that registry:

```
                  withTool(messagingTools)   ←─ populates registry
                  withTool(loreTools)
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
  withVault(vaultPath),                  // FILESYSTEM layer: file watchers, atomic writes
  withStorage(storage),                  // STORAGE layer: SQLite + sync, owns PARSER too
  withTree(treeStore),                   // TREE layer: in-memory KNode model
  withBoard(boardStore),                 // BOARD layer: view-models for kanban/outline/tabs
  withCommands(kmCommandRegistry),       // COMMANDS layer: input dispatch
  withRenderer(silveryRuntime),          // APP layer: mounts the silvery app
)
```

km's documented layer stack (APP → COMMANDS → BOARD → TREE → STORAGE → PARSER → FILESYSTEM) maps directly to these `withX` factories — `withVault` is the FILESYSTEM layer, `withStorage` subsumes both STORAGE and PARSER (parsing happens at the storage boundary), and so on. The layer doc and the factory doc describe the same architecture from two angles. The km command system stays as-is internally — it's an *output* of `withCommands(...)`, not a replacement for the composition pattern.

## Lifecycle integration

Every `with*` accepts (or transitively has access to) the base's `scope: Scope`. Cleanup registration is non-optional and uniform:

```typescript
function withSocketServer() {
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
  withSocketServer(),
  withTools(),
  withTool(loreTools()),
  // ...
)

await tribe.run()
```

**2. Ongoing async — events, streams, subscriptions, long-running work — is TEA.** `pipe` produces the system as a value; TEA describes its runtime behavior. Inner domain reducers (Board, Tree, etc.) follow the shipped contract `(state, op) → [state, effects]` — see [docs/design/tea.md](../docs/design/tea.md). The outer app-level `dispatch/apply` plugin bus is parked in [hub/futures.md](./futures.md#tea-effect-emission-shape).

See [docs/design/tea.md](../docs/design/tea.md) for the TEA pattern. The composition pattern and TEA are complementary: composition is for *structure*, TEA is for *behavior*.

**The entry point is `app.run()`, not `app.start()`.** Aligns with silvery's runtime (`run(view, …)`) and the era2 lifecycle. `run()` opens sockets, mounts surfaces, fires plugin observers, and returns when the scope closes (shutdown, SIGTERM, fatal error). Tests typically call `run()` and either let it run to completion or close the scope to terminate.

## Error handling

A `withX` that throws aborts composition. Cleanup runs because the scope closes on the catch:

```typescript
try {
  const tribe = pipe(createBaseTribe({ scope }), withProjectRoot(...), withSocketServer(), ...)
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
  withSocketServer(),                                           // ... & WithSocket
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

## See also

- [hub/architecture.md](./architecture.md) — the runtime topology these factories produce
- [hub/futures.md](./futures.md) — open design questions, considered alternatives, and explicitly rejected abstractions (`withMachines`, `withSignalStore`, `withSurfaces`)
- [hub/silvery/design/lifecycle-scope.md](./silvery/design/lifecycle-scope.md) — the `Scope` primitive every `withX` participates in
- Effect's `Layer` and Apollo Server's `ApolloServer.create` — same idea, different ecosystems

