# Command Surfaces

How can we make Silvery maximally ergonomic for maximally powerful apps? This doc explores the idea that a single **command registry** can serve as the universal interface between an app and everything that wants to interact with it — users, AI agents, tests, CLI tools, documentation generators.

## Prior Art

The idea of "everything is a command" has deep roots:

- **Emacs** (1976) — every operation is a named command, invokable via M-x, keybindings, or Lisp. This makes Emacs self-documenting: you can query any command or keybinding at runtime. Editable keymaps, composable macros, and scripting all fall out naturally.
- **VS Code** — extensions register commands once; they're accessible via the command palette, keyboard shortcuts, menus, and programmatic `vscode.commands.executeCommand()`.
- **Apple App Intents** — apps define actions once; they surface in Shortcuts, Siri, Spotlight, and the Action Button — all from one definition.
- **JetBrains Action System** — registered actions invokable from menus, keybindings, search, or programmatically.

All of these share the same insight: **define behavior once as named commands, project it onto many interaction mechanisms.** None of them use a single term for this pattern. We'll call each projection a **command surface**.

### Deep Comparison: Apple App Intents

Apple's App Intents (2022+) is the most mature "define once, surface everywhere" system in production. It's worth understanding in detail because it solves many of the same problems.

**The model.** An `AppIntent` is a Swift struct with three parts: metadata (title, description), parameters (`@Parameter` properties), and a `perform()` method. The system discovers intents at compile time via protocol conformance — no registration step. Each intent surfaces automatically in Shortcuts, Siri, Spotlight, Control Center, Widgets, and Action Button.

```swift
struct ToggleDone: AppIntent {
    static var title: LocalizedStringResource = "Toggle Done"
    static var description = IntentDescription("Toggle the done state of a task")

    @Parameter(title: "Task")
    var task: TaskEntity                    // entity parameter — resolved by query

    func perform() async throws -> some IntentResult {
        TaskStore.shared.toggleDone(task.id)
        return .result()
    }
}
```

**Parameters and entities.** Simple parameters (string, number, enum) are resolved directly. Complex parameters use `AppEntity` — a type with a display representation, a persistent ID, and a _query_. The query system has sub-protocols for different resolution strategies:

- `entities(for:)` — resolve by ID (like `registry.get(id)`)
- `suggestedEntities()` — return options to show the user (like `registry.getAll()`)
- `EntityStringQuery` — text search (like `registry.filter(query)`)
- `EntityPropertyQuery` — predicate-based filtering with sorting

Parameters can depend on each other via `@IntentParameterDependency` — e.g., "show tasks for this date" where the task list filters by the already-selected date.

**How it compares to command-native:**

| Dimension             | Apple App Intents                                   | Silvery command-native                               |
| --------------------- | --------------------------------------------------- | ---------------------------------------------------- |
| **Definition**        | Swift struct conforming to `AppIntent`              | Object with `id`, `name`, `description`, `execute()` |
| **Discovery**         | Compile-time via protocol conformance               | Runtime via `registry.getAll()` / `cmd.all()`        |
| **Parameters**        | `@Parameter` properties with typed resolution       | `CommandContext` built by caller (implicit)          |
| **Entity resolution** | `EntityQuery` sub-protocols (ID, string, predicate) | App builds context; registry has `filter(query)`     |
| **Surfaces**          | Siri, Shortcuts, Spotlight, Widgets, Control Center | Keybindings, CLI, palette, AI driver, MCP, tests     |
| **Same user path?**   | No — intents are separate from UI event handlers    | Yes — `cmd.toggle_done()` = pressing `x`             |
| **State access**      | None built-in — intents read app state directly     | `getState()` returns structured state                |
| **Composability**     | Shortcuts chains intents visually                   | Verb×location grid, macros, code composition         |
| **In-process**        | Yes (same Swift process)                            | Yes (same JS/TS process)                             |

**Key insight from App Intents:**

Apple's parameter resolution is more sophisticated than ours. Their `@Parameter` + `EntityQuery` system handles the "how does an intent get its inputs?" question that our `CommandContext` punts on. When Siri needs to resolve which task to toggle, the query provides options. When our CLI needs to resolve which node to delete, we... rely on the cursor position or require `--node-id`.

**What we should steal:**

1. **Typed parameters on commands.** Not just a bag of context, but declared inputs with types and descriptions. This enables CLI arg generation, MCP schema generation, and AI parameter resolution from a single definition.
2. **Entity queries for parameter resolution.** When a command needs a "task" parameter, provide a query that can list, search, or filter tasks. This is how the command palette populates suggestions, how CLI autocomplete works, and how an AI agent discovers valid inputs.
3. **Dependency chains.** "Pick a board, then pick a task in that board" — parameters that narrow based on prior selections.

**What we should NOT copy:**

- **Separate from UI.** App Intents are explicitly NOT the same code path as UI interactions. Apple apps have view controllers + event handlers for the UI, and intents for Siri/Shortcuts. We want the opposite — commands ARE the UI handlers.
- **Compile-time discovery.** Our runtime discovery (`cmd.all()`, `cmd.search()`) is better for AI agents because it reflects the actual available commands in the current state, not a static list.

## The Model

A silvery app's behavior lives in a **command registry** — a typed collection of commands, each with an `id`, `name`, `description`, `shortcuts`, and `execute()` function.

A **command surface** is any interface that discovers and invokes commands from the registry. You don't build ten APIs — you build one registry and project it onto as many surfaces as you need.

```
                    Command Registry
                   (source of truth)
                 id · name · description
                 shortcuts · execute()
                         │
        ┌────────┬───────┼───────┬────────┐
        │        │       │       │        │
   Keybindings  CLI   Command  Menus    AI
   (j, Ctrl+K) (--help) Palette (GUI)  Driver
                        (⌘K)         (in-process)
        │        │       │       │        │
      Mouse    Voice   Tools   DevTools  Tests
     (click)  (a11y)  (MCP/   (inspect) (assert)
               CLI)
```

| Surface            | Discovery               | Invocation                   | Audience                   |
| ------------------ | ----------------------- | ---------------------------- | -------------------------- |
| Keybindings        | Cheat sheet, `?` screen | Keystroke                    | Power users                |
| CLI                | `myapp --help`          | `myapp toggle-done`          | Shell users, **AI agents** |
| Command palette    | Fuzzy search (⌘K)       | Select from list             | All users                  |
| Menus              | Menu bar / context menu | Click                        | GUI users                  |
| Voice / a11y       | Screen reader announces | Voice command / AX action    | Accessibility              |
| In-process driver  | `registry.getAll()`     | `registry.get(id).execute()` | Tests, embedded AI         |
| MCP / remote tools | `tools/list`            | `tools/call`                 | Remote AI                  |
| DevTools           | Component tree          | Execute from inspector       | Developers                 |

Each surface has its own discovery and invocation style, but they all resolve to the same `execute()` call. Everything is auto-derived from the registry definition — CLI `--help`, keybinding cheat sheets, MCP tool schemas, fuzzy-searchable palettes, generated docs. No separate maintenance.

## Command-Native Design

We call this pattern **command-native**: the app is designed around commands from the ground up, the way "cloud-native" means designed for the cloud (not retrofitted). In a command-native app:

- **Commands are the primary model.** They're how the app works, not a secondary export. No annotation gap — every user action is a command by definition.
- **Same code path.** `cmd.toggle_done()` runs the same `execute()` as pressing `x`. No separate API that might drift.
- **Self-describing at runtime.** `cmd.all()` returns every available command with metadata. No docs lookup, no schema file — the app describes itself.
- **Structured state access.** `getState()` returns typed application state alongside screen text. An AI or test doesn't have to parse pixels or grep stdout.

This contrasts with most approaches to app automation, where the automation interface is a separate thing that must be built and maintained alongside the UI.

## How Apps Get Controlled Today

There are roughly seven approaches to driving an app programmatically:

| Approach                                         | Mechanism                                       | Discovery                | Same user path?                                 |
| ------------------------------------------------ | ----------------------------------------------- | ------------------------ | ----------------------------------------------- |
| **Vision**                                       | Screenshots + OCR + coordinate clicks           | None — guess from pixels | Yes (simulates clicks)                          |
| **UI tree** (DOM, a11y)                          | Structured element tree + element-level actions | Roles, selectors, labels | Partial (element actions, not semantic actions) |
| **CLI**                                          | Subcommands + flags + piped I/O                 | `--help`                 | No (separate interface)                         |
| **API / SDK**                                    | Typed function calls                            | Docs, schemas            | No (separate interface)                         |
| **Remote tools** (MCP)                           | JSON Schema tool discovery                      | Self-describing          | No (separate interface)                         |
| **Internal extension** (IPC, scripting, plugins) | Event bus, embedded language, plugin API        | Varies                   | Partial (events match, scripts may not)         |
| **Command-native**                               | Command registry + state + same `execute()`     | Runtime `cmd.all()`      | **Yes — identical path**                        |

Key differentiators for command-native:

- **Action discovery**: Runtime enumeration (`cmd.all()`) vs static docs or no discovery at all.
- **State access**: Full structured state + screen text vs pixels, DOM, or whatever the API exposes.
- **Same user path**: The automation calls the exact same code as a keystroke. No drift, no "API works but UI doesn't" bugs.
- **Completeness**: 100% coverage by construction — every command is automatically available to every surface. Other approaches require manual effort to expose each action.
- **Element tree**: Virtual DOM with layout, props, state — something terminal apps otherwise lack entirely.

### The A11y Tree: Closest Cousin

The accessibility tree is the nearest existing paradigm. Both provide structured action enumeration, semantic names, and state inspection. But there are important differences:

- **A11y is a secondary export.** Developers build the UI, then annotate it for accessibility. Incomplete annotations → incomplete automation. Command-native apps have no annotation gap — commands are the primary model.
- **A11y operates at element level** (click button, fill textbox). **Command-native operates at semantic action level** (toggle_done, fold, move_up). An a11y client knows which list item is selected and its label. `getState()` can return the full list of items with their completion status, due dates, priority — structured data beyond what any UI tree exposes.
- **A11y is standardized** (ARIA, AX, UIA) with rich semantics (landmarks, live regions, states). Command-native is framework-specific but can be richer for automation because it's not constrained to the visual model.
- **Terminal apps have no a11y tree.** The OS sees a character grid, not UI elements. Silvery creates a structured, introspectable model where none exists — a virtual DOM for the terminal.

Silvery does for terminal UIs what ARIA does for web UIs — but as a first-class design principle, not an afterthought.

## The Virtual DOM Angle

Traditional terminal apps have no structure — the OS sees a character grid. Silvery's React reconciler creates a **virtual DOM**: a component tree with typed nodes, layout data, and semantic structure.

- **Element tree** — inspectable component hierarchy (like browser DOM, but for terminal)
- **Layout data** — every node has computed position, dimensions, scroll offset
- **Component identity** — React keys, refs, state — same introspection as React DevTools
- **DevTools integration** — inspect component tree, view props/state, highlight elements

Combined with the command registry, this means an AI agent doesn't just get a list of actions and screen text — it gets the full structured DOM of the application. No other terminal framework exposes this.

## Driving a Silvery App

### In-process (primary)

The AI or test runs in the same process. Zero serialization, sub-millisecond, fully typed:

```typescript
const commands = registry.getAll() // discover
const screen = handle.text // read
const state = store.getState() // inspect
registry.get("toggle_done")!.execute(ctx) // act — same code path as pressing 'x'
```

Best for: testing, automation, embedded AI, fuzz testing.

### CLI (proven most effective for AI agents)

The emerging consensus from production AI agents is that **simple CLI tools outperform MCP for most agent interactions.** Claude Code, the most widely deployed coding agent, uses shell commands as its primary tool interface. The reasons are structural:

- **Zero schema overhead.** MCP servers dump tool definitions into the context window — the full GitHub MCP server costs ~55,000 tokens before the agent asks a single question. CLI tools cost zero schema tokens because models already know `git`, `gh`, `kubectl`, etc. from training data.
- **Composability.** LLMs are trained on billions of Unix pipe chains. `myapp list --json | jq '.[] | select(.done)'` is a pattern the model already knows. MCP tools don't compose.
- **Debuggability.** CLI commands are visible, reproducible, and loggable. MCP calls are opaque JSON-RPC.
- **No runtime dependency.** No server process, no WebSocket connection, no keepalive. Just a binary.

A command-native app gets CLI for free:

```bash
myapp toggle-done --id task-123    # same execute() as pressing 'x'
myapp list-commands                # self-describing
myapp get-state                    # structured JSON output
```

The CLI surface is auto-generated from the registry: names become subcommands, descriptions become help text, `execute()` is the handler. No separate CLI framework needed.

### The MCP Problem (and When It Still Makes Sense)

MCP has a fundamental tension: it tries to make APIs self-describing by dumping schemas into the context window, but **the schemas themselves become the bottleneck.** Cloudflare discovered this with their own API (2,500+ endpoints): traditional MCP tool definitions cost 1.17 million tokens. Their solution — "Code Mode" — replaced tool schemas with two primitives (`search()` and `execute()`) and let the agent write code against the API, reducing the footprint to ~1,000 tokens (99.9% reduction).

This validates the command-native insight from a different angle: **the right abstraction is not "describe every tool as a schema" but "give the agent a way to discover and call what it needs."** Command-native apps do this naturally — `cmd.all()` is progressive discovery, and each command is a callable function, not a schema to be parsed.

MCP still makes sense for **remote multi-tenant scenarios** (SaaS integrations, enterprise security boundaries, cross-process communication). But for local agent-to-app interaction, in-process calls and CLI are faster, cheaper, and more reliable. The command registry supports both — MCP is one surface among many, not the primary one:

```typescript
// When you need it — auto-generated, no hand-written handlers
serveMCP(registry, {
  state: () => store.getState(),
  screen: () => handle.text,
})
```

## What Falls Out for Free

Once you have a command registry as the single source of truth, you get these without extra work:

| Benefit                  | How                                                                            | Audience               |
| ------------------------ | ------------------------------------------------------------------------------ | ---------------------- |
| **CLI with `--help`**    | names + descriptions → subcommands + help text                                 | Shell users, AI agents |
| **Keybinding reference** | shortcuts → printable cheat sheet or `?` screen                                | Power users            |
| **Command palette**      | names + descriptions → fuzzy-searchable list                                   | All users              |
| **Self-documenting app** | `cmd.all()` at runtime, like Emacs `describe-function`                         | Users, support         |
| **Generated docs**       | names + descriptions → man pages, reference docs                               | Technical writers      |
| **Test harness**         | `cmd.toggle_done()` and assert — no flaky UI scripting                         | QA, CI                 |
| **AI tool schemas**      | name + description + execute signature → JSON Schema                           | AI agents              |
| **Accessibility model**  | Named actions + structured state for a terminal app where the OS provides none | a11y                   |

Most apps maintain these separately. A command-native app maintains them all by maintaining one thing.

## Silvery's Unique Combination

No other terminal framework combines all four:

1. **`cmd.all()`** — runtime command discovery (no docs lookup)
2. **`getState()`** — structured state + screen text in one call
3. **`cmd.down()`** — same code path as pressing `j`
4. **Virtual DOM + DevTools** — full element tree with layout, props, state

## Design Analysis

### How Far Can CLI Generation Go?

**Answer: Very far.** Examining km's 173 commands reveals three parameter patterns:

| Pattern                  | Count      | Example                                                            | CLI mapping                                                            |
| ------------------------ | ---------- | ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| **Zero-arg**             | ~101 (58%) | `cursor_down → { type: "CURSOR_MOVE", dir: "down" }`               | `myapp cursor-down`                                                    |
| **Implicit from cursor** | ~23 (13%)  | `delete_node → { type: "DELETE_NODE", nodeId: ctx.currentNodeId }` | `myapp delete-node` (uses cursor) or `myapp delete-node --node-id abc` |
| **Explicit target**      | ~3 (2%)    | `goto → { type: "GOTO_BOARD", boardId: ctx.targetId }`             | `myapp goto @inbox`                                                    |
| **Context-dependent**    | ~46 (27%)  | Dialog commands, text editing, mode-specific                       | Usually not CLI-relevant                                               |

The majority of commands (58%) need zero arguments — they map directly to CLI subcommands. Commands that read `ctx.currentNodeId` can default to the cursor position (like how `git` defaults to HEAD) and accept an explicit `--node-id` flag. The composable verb×location commands (`goto`, `move`, `add`) already have explicit targets that map to CLI positional args.

**The ~27% context-dependent commands** (dialog navigation, text editing, mode-specific operations) don't make sense as CLI subcommands — they're inherently interactive. This is fine. A CLI surface should expose the **stateless** subset of commands, not all of them. The registry already has `modes` and `category` fields to filter:

```typescript
// Auto-generate CLI from commands that work in "normal" mode
const cliCommands = registry.getAll().filter((cmd) => !cmd.modes || cmd.modes.includes("normal"))
```

**Conclusion**: No separate definition layer needed. The existing `CommandDef` (id, name, description, category, modes) contains enough metadata to auto-generate a CLI. Add an optional `params` field for commands that accept explicit arguments:

```typescript
interface CommandDef {
  // ... existing fields ...
  params?: Record<
    string,
    {
      type: "string" | "number" | "boolean"
      description: string
      required?: boolean
      default?: string // expression like "ctx.currentNodeId"
    }
  >
}
```

### State Granularity: Selectors, Not Schemas

**Answer: Use the same pattern as `useSelector` — pass a function, get back what you need.**

The "GraphQL for app state" framing is wrong — it implies a query language and a schema. The right model is simpler: **selectors**. The same pattern React/Zustand uses for components works for external consumers:

```typescript
// Full state (current behavior)
const state = app.getState()

// Selector: just the cursor
const cursor = app.getState((s) => s.cursor)

// Selector: derived data
const taskSummary = app.getState((s) => ({
  total: s.columns.flatMap((c) => c.cardNodes).length,
  done: s.columns.flatMap((c) => c.cardNodes).filter((n) => n.task_status === "done").length,
  cursor: s.cursor,
}))
```

This is better than a query API because:

- **No schema to maintain** — the selector is just TypeScript, with full type inference
- **Composable** — selectors are functions, they compose naturally
- **Familiar** — every React developer already knows this pattern
- **Works for all surfaces** — in-process callers pass a function; CLI/MCP callers get the full state (no selector possible over a serialization boundary)

For the in-process driver, the implementation is trivial:

```typescript
// In withCommands plugin
getState<T>(selector?: (state: AppState) => T): T | AppState {
  const full = buildState()
  return selector ? selector(full) : full
}
```

The serialized surfaces (CLI `get-state`, MCP) always return the full state — they can't pass functions. But that's fine: the full state is small enough to serialize, and if it grows, the CLI can offer `--select cursor` flags that map to pre-built selectors.

### Progressive Discovery

**Answer: Already built — `registry.filter(query)` does fuzzy matching.**

The km registry already has `filter(query: string): CommandDef[]` that fuzzy-matches against name, description, and id. This is literally Cloudflare's `search()` primitive. For the `cmd` proxy, expose it as:

```typescript
app.cmd.search("done")
// Returns: [{ id: "toggle_done", name: "Toggle Done", ... }, { id: "toggle_hide_done", ... }]
```

At 173 commands, `cmd.all()` is ~8KB of JSON — well under any context budget. But the search primitive is valuable regardless of scale because it helps agents (and palette UIs) find relevant commands without processing the full list.

**For token-sensitive surfaces** (MCP, remote AI), the pattern could be:

1. Agent calls `search("task status")` → gets 3 matching commands (tiny payload)
2. Agent calls `execute("toggle_done")` → runs it
3. Never needs the full 173-command list in context

This is exactly Cloudflare's Code Mode insight applied at the command level rather than the API level.

### Command Composability

**Answer: Yes, via three mechanisms — one exists, two are straightforward to add.**

**1. Verb × Location (exists today).** The `goto`, `move`, `add` commands compose verbs with targets:

```
goto × inbox = navigate to inbox
goto × fav:a = navigate to favorite "a"
move × journal = move selected to journal
add × link = open link picker
```

This is generated as a grid: 4 verbs × ~10 locations = ~40 compound commands from ~14 primitives. Keybindings are assigned by cross-product (e.g., `g i` = goto inbox, `m i` = move to inbox).

**2. Command sequences (straightforward to add).** Record a sequence of command IDs, replay them:

```typescript
// Emacs-style keyboard macro
const macro = app.cmd.record() // start recording
await app.cmd.down()
await app.cmd.toggle_done()
macro.stop() // macro = ["cursor_down", "toggle_done"]
await macro.replay(5) // repeat 5 times
```

This falls out naturally from the command-native model — every action is already a named command with a deterministic execute path. No special infrastructure needed beyond a list of IDs.

**3. Code composition (already works via in-process driver).** An agent can write:

```typescript
// "Mark all items in this column as done"
for (const card of state.columns[0].cardNodes) {
  if (card.task_status !== "done") {
    await app.cmd.toggle_done()
    await app.cmd.down()
  }
}
```

This is the most powerful form — the agent writes TypeScript against the registry and state, composing commands with arbitrary logic. It's what Cloudflare concluded with Code Mode, and it's what the in-process driver already enables. **Code is the ultimate composition mechanism.**

### Code as the Primary Surface

**Answer: Yes — and this should be the central design insight.**

If the command registry is the source of truth, and the most powerful way to use it is typed code, then **the framework's #1 job is making the in-process code API maximally ergonomic.** Every other surface (CLI, MCP, palette) is a lossy projection. Design for code first, project downward.

The in-process driver already demonstrates this:

```typescript
import { createBoardDriver } from "./driver.ts"

const driver = createBoardDriver(repo, "board")

// Discover — typed API, no schema parsing
const commands = driver.cmd.all()
const matches = driver.cmd.search("done")

// Inspect — selectors, not serialized blobs
const cursor = driver.getState((s) => s.cursor)
const screen = driver.text

// Act — same path as pressing 'x'
await driver.cmd.toggle_done()
await driver.press("j")

// Compose — full language, not a workflow DSL
for (const card of driver.getState((s) => s.columns[0].cardNodes)) {
  if (card.task_status !== "done") {
    await driver.cmd.toggle_done()
    await driver.cmd.down()
  }
}
```

**Why code is strictly better than schemas:**

|                   | Schema-based (MCP, tool defs)       | Code (in-process)                              |
| ----------------- | ----------------------------------- | ---------------------------------------------- |
| **Discovery**     | Parse JSON Schema → pick a tool     | Autocomplete, type hints, `cmd.search()`       |
| **Parameters**    | Fill JSON fields from description   | Typed function args, IDE validation            |
| **Composition**   | Can't — one tool call at a time     | Loops, conditionals, variables, error handling |
| **State**         | Whatever the tool returns (opaque)  | Full typed state, selectors, subscriptions     |
| **Feedback loop** | Call → wait → parse result → decide | Instant: `getState()` after `cmd.down()`       |
| **Speed**         | Network round-trip per call         | Sub-millisecond                                |

**What "leaning into code" means for Silvery's design:**

1. **The driver API is the primary public API.** Not the CLI, not MCP, not tool schemas. The `cmd` proxy + `getState()` + selectors should be the best-documented, most ergonomic interface. Other surfaces are generated from it.

2. **TypeScript types ARE the schema.** Instead of maintaining JSON Schemas for MCP tools or CLI arg definitions, the types on `CommandDef`, `getState()`, and `cmd.*()` are the canonical description. Tools that need schemas can extract them from the types (like `ts-json-schema-generator`).

3. **The command registry is an implementation detail.** External consumers don't interact with the registry directly — they use the driver (`cmd.toggle_done()`, not `registry.get("toggle_done").execute(ctx)`). The registry exists to enable the projections (CLI, palette, help screen), but the primary experience is code.

4. **AI agents should run in-process when possible.** An embedded AI that imports the driver and writes TypeScript against it is fundamentally more capable than one making MCP calls. The framework should make this easy — maybe a `withCowork()` plugin that gives an LLM the driver API and lets it generate code to execute.

5. **CLI and MCP are escape hatches, not the main event.** They exist for when in-process isn't possible (remote agent, different language, security boundary). Design them to be auto-generated and correct, not hand-tuned.

**This reframes command surfaces.** Instead of "10 equal projections from one registry," the hierarchy is:

```
Code (in-process driver)         ← primary: full power
  └─ CLI (auto-generated)        ← for shell/agents: composable, zero-schema
      └─ MCP (auto-generated)    ← for remote: when you can't run in-process
```

Each level down loses something:

- CLI loses types, selectors, and direct composition (gains Unix pipes)
- MCP loses composability entirely (gains cross-process, cross-language)

The framework should be opinionated about this hierarchy. Optimize for the top, auto-generate the rest.

### Two Modes of AI Integration

There are two fundamentally different ways an AI interacts with a command-native app:

**Mode A: AI inside the app** — an embedded cowork (chat panel, command palette, voice). The AI has a live session with persistent state. Think Cursor's AI or Anthropic's Cowork mode.

**Mode B: AI outside the app** — a general-purpose agent (Claude Code, a personal assistant) that uses the app as one tool among many. The AI doesn't live inside the app; it reaches in when needed. Think Claude Code using `git`.

These have very different requirements:

|                    | Mode A: Embedded cowork                        | Mode B: External agent                     |
| ------------------ | ---------------------------------------------- | ------------------------------------------ |
| **Connection**     | Live session, persistent state                 | Transactional, stateless per-call          |
| **Discovery**      | One-time at session start — knows all commands | Progressive — needs compact overview first |
| **State**          | Subscriptions, real-time updates               | Query on demand, read fresh each call      |
| **Composition**    | In-process code (full language)                | CLI pipes or sequential tool calls         |
| **Context budget** | Generous — lives in the app's process          | Tight — the app is one of many tools       |
| **Feedback**       | Watches state changes live                     | Reads state after each action              |

#### Mode A: Embedded Cowork (withCowork)

The cowork runs in-process with a live session. It has the driver API — `cmd.*()`, `getState(selector)`, state subscriptions — and generates TypeScript to execute against it.

**Scenario.** You're in km, looking at 40 inbox items. You open the cowork and type:

> "Clean up my inbox. Move work stuff to Work board. Mark done errands as complete."

The cowork has three things: `cmd.all()` (what can I do), `getState()` (what's on screen), and a code sandbox. It generates:

```typescript
const inbox = driver.getState((s) => s.columns[0].cardNodes)

for (const card of inbox) {
  const text = `${card.title} ${card.body ?? ""}`.toLowerCase()

  if (/meeting|sprint|deploy|review|pr|jira/.test(text)) {
    await driver.cmd.goto({ target: card.id })
    await driver.cmd.move({ target: "@work" })
  } else if (/grocery|dentist|prescription/.test(text) && /done|picked up/.test(text)) {
    await driver.cmd.goto({ target: card.id })
    await driver.cmd.toggle_done()
  }
}
```

The user watches cards rearrange in real-time — same visual feedback as pressing keys manually. 40 cards classified, 15 commands executed, <100ms total.

This is a **live session**: the cowork can see the state change after each command. It could pause, ask the user "I'm not sure about this one — work or personal?", then continue. It could subscribe to state and react: "I notice you just marked 5 tasks as done — want me to move them to archive?"

**As a plugin:**

```typescript
const app = pipe(
  baseApp,
  withCommands({ registry, getContext, handleAction }),
  withCowork({
    model: "claude-sonnet",
    sandbox: true,
    onPlan: (code) => showPreview(), // show plan before executing
  }),
)
```

The plugin auto-generates the system prompt from `cmd.all()` + `getState()`. The app author writes zero AI code.

#### Mode B: External Agent (Progressive Discovery)

A general-purpose AI — say Claude Code, or a personal assistant managing your day across multiple apps — encounters km as one tool among many. It can't dump 173 commands into its context; it needs to discover the app efficiently.

**The problem.** If the app exposes all 173 commands as MCP tools or CLI subcommands, the agent drowns in schema tokens before doing anything useful (the GitHub MCP problem: 55K tokens for 93 tools). If the app exposes too few, the agent can't do what it needs.

**The solution: 4 meta-commands.** Instead of exposing every command individually, expose the discovery and execution primitives:

```bash
km describe                          # ~200 tokens: what this app is, command categories
km commands --category Task          # drill into one area
km state --select cursor,columns     # compact state slice
km execute toggle-done               # run any command by ID
```

Or as 4 MCP tools:

```
describe()           → "Task manager with 173 commands in 7 categories: Navigation, Edit, Task, ..."
commands(category?)  → [{ id: "toggle_done", name: "Toggle Done", ... }, ...]
state(selector?)     → { cursor: { col: 0, card: 3 }, ... }
execute(id, params?) → { success: true, newState: ... }
```

This is exactly Cloudflare's Code Mode insight: **don't expose N tools, expose the discovery and execution primitives.** The context cost is fixed (~1000 tokens for 4 tool schemas) regardless of how many commands the app has.

**Scenario.** Claude Code is helping a user plan their week. It needs to check their km inbox:

```
Agent: I'll check your task manager for pending items.
→ km describe
  "km is a task/notes/calendar TUI. Categories: Navigation (33), Edit (28), Task (9), View (17), ..."
→ km state --select columns
  { columns: [{ title: "Inbox", cards: 12 }, { title: "Today", cards: 5 }, ...] }
→ km commands --category Task
  [{ id: "toggle_done", ... }, { id: "set_priority", ... }, { id: "set_due_date", ... }]
→ km execute set_due_date --node-id task-abc --date 2026-03-15

Agent: I've set the deadline for "Prepare Q3 report" to March 15.
```

The agent discovered the app progressively: describe → drill into category → execute. Total context cost: ~2000 tokens across 4 calls, vs 55,000+ if every command were a separate tool.

**The key difference from Mode A:** The external agent doesn't have a live session. Each `km state` call reads fresh state. There are no subscriptions, no real-time feedback. The agent works transactionally — read state, decide, execute, read state again. This is less powerful than Mode A but works across process boundaries and with any general-purpose agent.

#### Both Modes from One Registry

The command registry serves both modes without modification:

- **Mode A (embedded)**: `withCowork()` plugin → in-process driver → `cmd.*()` + `getState(selector)` + subscriptions
- **Mode B (external)**: 4 meta-commands auto-generated → `describe()` wraps `cmd.all()` with compression, `commands()` wraps `cmd.search()`, `state()` wraps `getState(selector)`, `execute()` wraps `cmd[id]()`

The app author defines commands once. Silvery generates both interfaces.

This is the endgame of command-native design: **the app describes itself well enough that any AI — embedded or external — can drive it.**

### Two Products, Two Roles

This design has implications for two distinct products:

**km** — a command-native app. Has its own embedded cowork (Mode A: AI chat panel, voice, command palette). Also available as a tool for external personal assistant AIs (Mode B: 4 meta-commands via CLI). km is both the showcase for command-native design and the first consumer of `withCowork()`.

**tty** — a general-purpose tool for controlling _any_ TUI app, and itself a silvery app. The existing `mcp__tty__*` tools (start, screenshot, press, type) let an AI interact with any terminal app via vision + keystrokes. But tty being silvery means it has its own command registry, its own `withDiscovery()`, its own meta-commands. It's command-native all the way down.

For non-silvery apps, tty falls back to vision/keystrokes. For silvery apps, tty detects the command registry and promotes to the richer path: `describe`, `commands`, `state`, `execute`.

```
Any TUI app (non-silvery)     → tty: screenshot + press/type (vision paradigm)
Any silvery app               → tty: describe + commands + state + execute (command-native)
km specifically               → embedded cowork: live session, subscriptions, code generation
```

tty becomes the bridge: it gives AI agents command-native access to silvery apps without the app needing its own AI integration. The 4 meta-commands are generic — tty generates them from any silvery app's registry.

The recursive case is interesting: an AI agent uses tty (command-native) to drive km (also command-native). tty detects km's registry and auto-promotes from vision → semantic commands. No configuration, no MCP server — just two silvery apps recognizing each other. And because tty itself is command-native, the external AI discovers tty's capabilities the same way it discovers km's. Turtles all the way down.

**For silvery's roadmap**, this means:

1. **`withCommands()` already exists** — the registry, `cmd` proxy, `getState()`
2. **Next: `withDiscovery()`** — expose the 4 meta-commands (describe, commands, state, execute) as CLI subcommands or MCP tools, auto-generated from the registry. This is what tty would consume for silvery apps.
3. **Then: `withCowork()`** — in-process LLM integration with live session, code generation, sandbox. This is what km would use for its embedded AI.

## Remaining Open Questions

- **Typed parameters on CommandDef.** Apple's `@Parameter` system is more powerful than our `CommandContext` bag. Should `CommandDef` declare its inputs with types and descriptions? This enables CLI arg generation, MCP tool schemas, palette parameter prompts, and AI parameter resolution — all from one definition. But it adds complexity to command definitions. Is the juice worth the squeeze for 173 commands where 58% take zero args?
- **Entity queries for parameter resolution.** When `goto` needs a board target, where do the options come from? Currently: hardcoded locations + favorites. Apple's model: an `EntityQuery` that can list, search, and filter. Should commands declare their parameter sources? This would unify: CLI autocomplete, palette suggestions, AI option discovery.
- **tty detection.** How does tty know an app is silvery/command-native? Options: (a) the app responds to `myapp --silvery` with registry JSON, (b) tty probes for a well-known CLI subcommand (`myapp describe`), (c) the app advertises via a terminal escape sequence or environment variable. The detection needs to be zero-config for app authors.
- **Framework boundaries.** Which projections should silvery own vs leave to apps? Candidates for silvery: `cmd.search()`, `getState(selector)`, `withDiscovery()` (4 meta-commands), macro recording. Candidates for app-level: `withCowork()` (needs LLM dependency), custom parameter resolution, domain-specific state selectors.
