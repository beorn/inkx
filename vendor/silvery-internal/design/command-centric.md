# Command-Centric Design

_Part 1 of [AI-Native Apps](./ai-mode.md). This doc covers the architecture — how to build apps with well-composed, exposed internals. [AI Mode](./ai-mode.md) covers what AI agents do with that architecture._

## The Core Idea

Apps have layers of internal structure — state, actions, UI components, layout — but they expose almost none of it. The only way in is through the surface the developer chose to build: a GUI, a CLI, an API. Each is a separate artifact that has to be designed, built, and maintained.

**Command-centric design** inverts this. Instead of building surfaces and hiding internals, you build around a **command registry** — a typed collection of every action the app can perform. The registry is the discoverable surface over app behavior — model methods are canonical, but the registry makes them accessible to every consumer. Every surface projects the command registry differently — keybindings, CLI, command palette, menus, MCP tools, tests, documentation.

```
                    Command Registry
                  (discoverable surface)
                  id · title · description
                  params · when · execute()
                         │
        ┌────────┬───────┼───────┬────────┐
        │        │       │       │        │
   Keybindings  CLI   Command  Menus    Code
   (j, Ctrl+K) (--help) Palette (GUI)  Driver
                        (⌘K)         (in-process)
        │        │       │              │
      REPL    Tools   DevTools        Tests
    (console) (MCP)   (inspect)      (assert)
```

The result: **every action the user can take is automatically available to code, tests, AI, CLI, and any other consumer** — because they all call the same `execute()`. No annotation gap. No drift. No incomplete API.

This is good for AI (see [AI Mode](./ai-mode.md)), but it's good for _everyone_. The properties that make an app AI-native — self-describing, programmatically drivable, structured state — also make it more testable, more accessible, more composable, and self-documenting.

## The Problem: Automation is Always a Second Thing

There are roughly seven ways to programmatically control an app, and they all share a failure:

| Approach                           | How it works                          | The problem                        |
| ---------------------------------- | ------------------------------------- | ---------------------------------- |
| **Vision**                         | Screenshots → OCR → coordinate clicks | Slow, brittle, no semantics        |
| **UI tree** (DOM, a11y)            | Traverse element tree → click/fill    | Element-level, not semantic intent |
| **CLI**                            | Subcommands + flags + stdout          | Separate code path from the UI     |
| **API / SDK**                      | Typed function calls                  | Separate code path from the UI     |
| **Remote tools** (MCP¹)            | JSON Schema tool discovery            | Schema bloat, separate from UI     |
| **Extensions** (IPC, scripting)    | Event bus, embedded language          | Partial coverage, app-specific     |
| **App Actions** (Apple, Microsoft) | Declared action manifest              | Separate from UI — annotation gap  |

_¹ MCP = Model Context Protocol, a JSON-based tool API format for AI agents._

**Developers build the UI, then build a separate thing for programmatic access.** The two inevitably drift. Commands that work in the UI aren't available via the API. The API does things the UI doesn't. Documentation gets stale.

This is the same mistake web development made with accessibility before ARIA: treating machine-readable structure as an afterthought.

## The Architecture

### One Command, Every Surface

Commands are organized as a **nested tree**. The tree structure is the single source of grouping — it auto-derives CLI subcommands, menu hierarchy, command palette categories, **domain objects** (typed groups like `app.task`, `app.navigation`), and TypeScript types. No separate `category`, `cli.path`, or `menu.group` fields needed.

```typescript
interface CommandDef {
  title: string
  description?: string
  params?: Record<string, ParamDef>
  when?: () => boolean // availability predicate
  execute: (params: any) => any // the actual behavior (calls model methods)
}
```

Command `execute` functions typically use `op(app.model)` to route through the interception pipeline, enabling undo/tracing/recording. See [app-composition.md](./app-composition.md) for the `op()` proxy design.

```typescript
const commands = {
  task: {
    toggle_done: {
      title: "Toggle Done",
      description: "Toggle the done state of the current task",
      params: { nodeId: { type: "string", description: "Task to toggle" } },
      execute: (ctx) => op(ctx.app.model).task.toggleDone({ nodeId: ctx.currentNodeId }),
      shortcuts: ["x"],
      modes: ["normal"],
    },
    set_priority: {
      title: "Set Priority",
      description: "Set task priority (0=critical, 4=backlog)",
      params: { nodeId: { type: "string" }, priority: { type: "number" } },
      execute: (ctx, { priority }) => op(ctx.app.model).task.setPriority({ nodeId: ctx.currentNodeId, priority }),
    },
  },
  navigation: {
    down: { title: "Move Down", execute: (ctx) => ctx.app.model.nav.moveCursor({ delta: 1 }), shortcuts: ["j"] },
    up: { title: "Move Up", execute: (ctx) => ctx.app.model.nav.moveCursor({ delta: -1 }), shortcuts: ["k"] },
  },
}
```

`ctx` is the command execution context — `withCommands` provides it automatically. `ctx.app.model` gives access to domain models (`ctx.app.model.task`, `ctx.app.model.nav`), so commands call the same methods as any other code. `ctx.currentNodeId` and similar cursor/selection state come from the app's state model.

The nesting does all the work by default:

| Surface              | Derived from tree path                       | Example                          |
| -------------------- | -------------------------------------------- | -------------------------------- |
| **CLI**              | `task.toggle_done` → `km task toggle-done`   | Nesting = subcommand hierarchy   |
| **Menu**             | `task.toggle_done` → Task → Toggle Done      | Nesting = menu/submenu structure |
| **Command palette**  | `task.toggle_done` → "Task: Toggle Done"     | Nesting = category prefix        |
| **Domain object**    | `task.toggle_done` → `task.toggle_done()`    | Nesting = typed object methods   |
| **TypeScript types** | `task.toggle_done` → `KM.task.toggle_done()` | Nesting = interface hierarchy    |
| **MCP tool**         | `task.toggle_done` → tool with dotted name   | Nesting = tool grouping          |

Individual commands can override any surface-specific behavior — but the defaults from nesting are right most of the time, so most commands only need `title`, `execute`, and optionally `shortcuts`.

Each command definition has a **universal core** (title, description, params, execute) and optional **surface-specific overrides** (shortcuts, modes, custom CLI flags). One definition, not separate definitions in separate files. The tree structure groups commands into **domain objects** — typed namespaces that are navigable rather than flat. An AI exploring the app sees 6 domain objects, not 173 undifferentiated commands (see [AI Mode: Discovery](./ai-mode.md#discovery-domain-objects--types)).

The framework auto-derives every surface from the tree:

| Surface             | Auto-generated                                |
| ------------------- | --------------------------------------------- |
| **Keyboard**        | `x` triggers `task.toggle_done`               |
| **CLI**             | `km task toggle-done --node-id abc`           |
| **Command palette** | "Task: Toggle Done" (fuzzy searchable)        |
| **MCP tool**        | `{ name: "task.toggle_done", ... }`           |
| **Menu**            | Task → Toggle Done                            |
| **Domain object**   | `task.toggle_done({ nodeId: "abc" })`         |
| **Tests**           | `await task.toggle_done(); expect(...)`       |
| **Docs**            | "Toggle Done — Toggle the done state..."      |
| **Cheat sheet**     | `x` — Toggle Done                             |
| **TypeScript**      | `interface KM { task: { toggle_done(...) } }` |

No other approach gets all of these from one definition.

### The Defining Properties

- **Commands are the discoverable surface over behavior.** Model methods are canonical, but every user action has a corresponding command. No annotation gap — if the user can do it, it's in the registry.
- **Same code path.** `task.toggle_done()` runs the same `execute()` as pressing `x`. No drift.
- **Self-describing at runtime.** The app enumerates every available command with metadata, grouped by domain category. The app describes itself.
- **Structured state.** `getState()` returns typed application state. Consumers read data, not pixels.
- **Complete by construction.** If the user can do it, it's a command. No opt-in, no forgetting to expose something.

### The Surfaces

Not all surfaces are equal. There's a natural hierarchy:

```
Code (in-process driver)         ← primary: full power, typed, composable
  ├─ REPL (interactive console)  ← for humans: explore and automate interactively
  ├─ CLI (auto-generated)        ← for shell/scripts: composable via pipes
  └─ MCP (auto-generated)        ← for remote: when you can't run in-process
```

**In-process code** is the most powerful — typed, composable, full language:

```typescript
const cursor = app.model.cursor
await app.invoke("task.toggle_done")

for (const card of app.model.columns[0].cardNodes) {
  if (card.task_status !== "done") {
    await app.invoke("task.toggle_done")
    await app.invoke("navigation.down")
  }
}
```

**CLI** is auto-generated — titles become subcommands, descriptions become help text, `execute()` is the handler. Building a good CLI is hard: naming subcommands, writing help text, handling flags, structuring output. Most apps ship mediocre CLIs because the effort competes with UI work. Command-centric design makes it effortless: every command already has a title, description, and parameters. The CLI falls out automatically, and it's _complete_ — every user action is a subcommand by construction.

**MCP** is auto-generated for remote scenarios — SaaS integrations, security boundaries. But for local interaction, in-process code and CLI are faster, cheaper, and more reliable.

## Why Commands, Not APIs?

"Isn't this just having a good API?"

No. The distinction matters:

| Dimension          | API/SDK                                | Command registry                                |
| ------------------ | -------------------------------------- | ----------------------------------------------- |
| **Relation to UI** | Separate code path                     | Same code path — commands drive the UI          |
| **Completeness**   | Whatever the dev chose to expose       | 100% by construction — every user action exists |
| **Granularity**    | Data-oriented (CRUD on resources)      | Intent-oriented (what the user wants to do)     |
| **Discovery**      | External docs, OpenAPI specs           | Runtime `cmd.all()` — the app describes itself  |
| **Maintenance**    | Second thing to build and keep in sync | Derived from model methods — surfaces auto-sync |

An API is _about_ the data. A command is _about_ what the user wants to accomplish. `PATCH /tasks/123 { done: true }` vs `toggle_done`. The command carries context (what's selected, what mode we're in), has a human-readable name, and runs the same code path the UI does.

Consider a concrete example: in the UI, the user has a cursor on a task and presses `x` to toggle it done. The command uses `ctx.currentNodeId` — it knows what's selected. An API call like `PATCH /tasks/123` requires the caller to supply the ID explicitly. An AI scripting via commands can say `task.toggle_done()` and trust that the cursor context is there. With a traditional API, the AI must first query for the ID, then construct the right PATCH — two calls instead of one, and it has to manage state the app already knows.

APIs are opt-in and always incomplete. A command registry is complete by construction — if the user can do it, it's a command. The analogy is AppleScript dictionaries: apps that exposed a scripting dictionary were automatable; apps that didn't forced users into GUI scripting.

## Why This Benefits Everyone

The same properties that make an app command-centric also make it:

- **More testable** — tests call `task.toggle_done()` and assert on `getState()`, not flaky UI scripting
- **More accessible** — named actions and structured state where the OS otherwise sees only a character grid
- **More discoverable** — command palette, `--help`, `?` screen, all auto-generated
- **More composable** — macros, scripting, shell pipes, all from the same commands
- **More consistent** — one code path means no UI/CLI/API drift
- **Self-documenting** — the app describes itself at runtime, like Emacs `describe-function`
- **Undoable** — command history enables replay, undo/redo, and audit trails for free

Even if you don't care about AI agents, you want all of these.

## Industry Convergence

The industry is converging on "define once, surface everywhere" — but every system except Emacs separates the automation layer from the UI code:

| System                           | Approach                                                      | Gap                                              |
| -------------------------------- | ------------------------------------------------------------- | ------------------------------------------------ |
| **Emacs** (1976)                 | Every operation is a named command (M-x, keybinding, Lisp)    | Closest precedent — no gap                       |
| **VS Code**                      | Extensions register commands for palette, shortcuts, menus    | Handlers registered separately from UI rendering |
| **Apple App Intents** (2022+)    | Schema-first: `AppIntent` struct → Shortcuts, Siri, Spotlight | Separate Swift structs from view controllers     |
| **Microsoft App Actions** (2025) | JSON manifest + `IActionProvider`                             | Separate manifest from UI code                   |
| **Google App Actions**           | Built-in Intents (BIIs) — predefined semantic patterns        | Platform-controlled, most conservative           |

Command-centric design closes the gap: commands and UI share the same code path. Nothing separate to maintain, nothing that can drift.

---

# Part 2: Application in Silvery

The concepts above are framework-agnostic. This section describes how Silvery implements them — and why command-centric design is a core reason to choose Silvery.

## Why This Matters for Silvery

Most frameworks weren't designed with command-centric architecture in mind. Retrofitting commands onto an existing React or Electron app means building the infrastructure yourself — auto-generated CLIs, domain objects, MCP tools, AI integration — as separate layers on top of UI code. That's a lot of plumbing that inevitably drifts.

Silvery takes a different approach: commands are the framework's foundation, not a bolt-on. When you define a command tree, every surface — CLI, palette, REPL, code mode, AI agent — follows automatically. This requires a shift in how you think about app architecture, but the payoff compounds: each new command is immediately available across all surfaces, and each new surface the framework adds works with all existing commands.

The result is that Silvery apps are testable, scriptable, accessible, and AI-native by construction — not because the developer added those capabilities one by one, but because the architecture provides them.

## What Exists Today

Silvery is a React-based TUI framework. Its command system already implements the core:

- Nested command registry — tree structure with `title`, `description`, `shortcuts`, `execute()`
- Domain object proxy — `app.invoke("task.toggle_done")` calls execute with same path as keypress
- `cmd.search(query)` — fuzzy matching across all commands by name, description, path
- `getState()` — structured application state
- Virtual DOM — component tree with layout, props, state (unique among terminal frameworks)

**Terminal-specific value:** Terminal apps have no accessibility tree. The OS sees a character grid, not UI elements. Silvery's virtual DOM creates structured, introspectable UI where none exists. The virtual DOM gives consumers not just commands and state, but the full element tree — component hierarchy, layout data, scroll positions, focus state.

**Persistence:** How state is stored is an app-level decision — SQLite, files, remote API, CRDT, or anything else. The command registry is agnostic to storage; it cares about actions and state shape, not where the data lives.

### How Domain Objects Form

Each [plugin](./app-composition.md#plugins) contributes a subtree to the command tree — and that subtree becomes a domain object:

```
Command Tree                    Domain Object           Code / CLI / Menu
────────────────                ──────────────────       ────────────────────
commands.task.toggle_done   →   task.toggle_done()  →   km task toggle-done
commands.task.set_priority  →   task.set_priority() →   km task set-priority
commands.navigation.down    →   navigation.down()   →   km navigation down
commands.history.undo       →   history.undo()      →   km history undo
```

Plugins compose the tree: a chat plugin registers `chat.submit` and `chat.compact`, a history plugin adds `history.undo` and `history.redo`. The composition IS the discoverable surface — no separate schema to maintain. Commands are just function calls; invoking a command has negligible overhead (it's the same `execute()` the UI calls, not IPC or serialization).

## CLI Generation Feasibility

Examining a real app's 173 commands:

| Pattern              | Count      | CLI mapping                         |
| -------------------- | ---------- | ----------------------------------- |
| **Zero-arg**         | ~101 (58%) | `km cursor-down`                    |
| **Implicit context** | ~23 (13%)  | `km delete-node` or `--node-id abc` |
| **Explicit target**  | ~3 (2%)    | `km goto @inbox`                    |
| **Interactive-only** | ~46 (27%)  | Not CLI-relevant                    |

58% map directly to subcommands. The 27% interactive-only commands don't belong in a CLI. A CLI surface exposes the stateless subset via a filter on command metadata.

## Open Questions

- **Nesting depth.** Two levels (domain.command) covers most cases. Three levels for complex areas like `task.priority.set`. Convention or enforced?

- **Typed parameters on CommandDef.** The `params` field enables CLI arg generation, MCP schemas, and palette prompts — but 58% of commands take zero args. Worth the overhead?

- **Entity queries for parameter resolution.** When `goto` needs a board target, where do the options come from? Apple's `EntityQuery` model solves this. Should commands declare parameter sources?

- **Context predicates.** The `when` field on `CommandDef` enables conditional availability. Should this subsume the `modes` field?

- **Surface overrides.** Sometimes you want a different CLI name or menu position than the tree implies. Override syntax is probably optional fields on the command def.

- **Cross-app discovery.** How does an external consumer detect a command-centric app? Options: `km describe`, well-known CLI subcommand, or env var. Should be zero-config.

- **OS-level manifest generation.** The command tree has enough metadata to generate Apple App Intents or Microsoft App Actions manifests automatically. Worth building in?

---

_See also: [AI Mode](./ai-mode.md) — how AI agents use command-centric apps, including code mode, AI agent mode, domain object discovery, and multi-agent collaboration._
