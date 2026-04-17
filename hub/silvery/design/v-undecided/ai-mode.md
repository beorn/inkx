# AI Mode

_Part 2 of [AI-Native Apps](../v15-tea/commands.md). This doc assumes familiarity with [Command-Centric Design](../v15-tea/commands.md), which covers the architecture — command registry, nested tree, domain objects, auto-derived surfaces — that makes everything below possible._

## The Premise

A [command-centric app](../v15-tea/commands.md) has well-composed, exposed internals: every action is a named command grouped into domain categories, state is structured and queryable, and the app describes itself at runtime. This is the plumbing. AI Mode is the interface layer — how AI agents access that plumbing.

The core principle: **the app IS the runtime.** Not a passive target that AI pokes at — a programmable system that AI talks to, codes against, and collaborates with.

Two features make this different from existing approaches:

1. **Code mode** — AI sends JavaScript that executes in the app's sandbox. 5x more token-efficient than tool calling. The app's domain objects ARE the language's globals.
2. **AI agent mode** — the app itself IS an agent with an LLM, domain expertise, and natural language understanding. Other agents connect to it as a peer.

This doc covers: how AI discovers commands (domain objects + types), the code interface (`app code`), agent mode (`app ai`), the developer REPL, embedded AI chat, multi-agent collaboration, and the agent hub.

## Discovery: Domain Objects + Types

Before an AI can act, it needs to know what the app can do. The biggest problem with flat command lists is that they're overwhelming — 173 undifferentiated items.

**Domain objects** solve this. As described in [Command-Centric Design](../v15-tea/commands.md#how-domain-objects-form), the command registry's nested tree naturally maps to typed domains — each subtree becomes a domain object with methods. This grouping matters for AI because it reduces a flat list of 173 commands into a handful of navigable domains:

```typescript
// Flat (overwhelming — 173 undifferentiated items):
cmd.all() → [{id: "cursor_down", ...}, {id: "toggle_done", ...}, ...]

// Domain objects (navigable — 6 typed groups):
task       → { toggle_done(), set_priority(), archive(), ... }     // 9 methods
navigation → { down(), up(), goto(), fold(), unfold(), ... }       // 33 methods
board      → { move(), add_column(), sort(), ... }                 // 12 methods
edit       → { start(), confirm(), cancel(), ... }                 // 8 methods
history    → { undo(), redo() }                                    // 2 methods
state      → (selector) => structured data                         // query state
screen     → { text, lines, width, height }                        // rendered output
```

Discovery = **explore a few domain objects**, not scan a flat list. The AI asks "what domains exist?" (6 objects), picks the relevant one, drills into its methods.

### Type Definitions

Every app can dump its TypeScript types with usage examples:

```bash
km code --types
```

```typescript
interface KM {
  task: {
    /** Toggle the done state of a task.
     * @example await task.toggle_done({ nodeId: "abc" }) */
    toggle_done(args: { nodeId: string }): Promise<void>

    /** Set priority (0=critical, 4=backlog).
     * @example await task.set_priority({ nodeId: "abc", priority: 1 }) */
    set_priority(args: { nodeId: string; priority: number }): Promise<void>
    // ...
  }
  navigation: {
    /** Move cursor down one row.
     * @example navigation.down() */
    down(): void
    // ...
  }
  state: {
    /** Query app state with a selector.
     * @example state(s => s.columns[0].cards.filter(c => c.due < Date.now())) */
    <T>(selector: (s: AppState) => T): T
  }
  screen: {
    /** Full rendered text of the current screen. */
    text: string
    /** Individual lines of the rendered screen. */
    lines: string[]
  }
}
```

This is **radically better for AI** than a flat command list:

- **Grouped** — 6 domains vs 173 flat items
- **Typed** — exact method signatures, no guessing parameter names
- **Examples** — JSDoc shows idiomatic usage patterns
- **Progressive** — explore `task` first, drill into `navigation` later
- **Cacheable** — types are stable; read once, use for the entire session

## Three Surfaces

With domain objects as the shared model, a command-centric app exposes three subcommands:

```bash
app code                    # interactive code notebook (Jupyter-style)
app code "<js>"             # non-interactive code eval (from args)
cat batch.jsonl | app code  # non-interactive code eval (from stdin)

app ai                      # agent mode: LLM + domain objects (stdin/stdout)
app ai "<request>"          # one-off natural language request

app repl                    # interactive REPL (for humans)
app repl <command>          # one-off command execution
```

| Surface | Audience            | Protocol          | Mixin           |
| ------- | ------------------- | ----------------- | --------------- |
| `code`  | AI agents, scripts  | JSONL (code eval) | `withCode()`    |
| `ai`    | Orchestrator agents | tRPC¹ (typed RPC) | `withAIAgent()` |
| `repl`  | Human power users   | Text (readline)   | `withRepl()`    |

_¹ tRPC = TypeScript Remote Procedure Call — end-to-end type inference with no code generation or separate schema language._

**Bundle:** `withAI() = withCode() + withAIAgent()`. One call to get the full AI surface. `withRepl()` is separate — it's a human dev tool, not part of the AI surface.

```typescript
pipe(app, withChat(), withAI()) // full AI surface
pipe(app, withChat(), withCode()) // just code, no LLM
pipe(app, withChat(), withRepl()) // human REPL (dev tool)
```

All three share the same headless app instance with the same domain objects. The differences are protocol, whether an LLM is in the loop, and interactivity.

## The Code Interface (`app code`)

The most innovative surface. AI sends JavaScript that executes in the app's sandbox — with domain objects as globals. No tool schemas, no JSON-RPC, no serialization overhead.

### Interactive Notebook (Jupyter-style)

```bash
km code
```

Reads JSONL from stdin, writes JSONL to stdout. Each line is a request/response:

```
→ {"id":1,"code":"state(s => s.columns[0].title)"}
← {"id":1,"ok":true,"result":"Inbox"}

→ {"id":2,"code":"task.toggle_done({ nodeId: 'abc' })"}
← {"id":2,"ok":true,"result":null}

→ {"id":3,"code":"invalid("}
← {"id":3,"ok":false,"error":"SyntaxError: Unexpected end of input"}
```

Variables persist across requests (like Jupyter cells). Streaming for long-running code:

```
→ {"id":4,"code":"for (const c of state(s => s.columns)) console.log(c.title)"}
← {"id":4,"stream":"Inbox"}
← {"id":4,"stream":"Today"}
← {"id":4,"stream":"Work"}
← {"id":4,"ok":true,"result":null}
```

### Non-Interactive Eval

```bash
# From args — output is JSON
km code "state(s => s.columns.map(c => ({ title: c.title, count: c.cards.length })))"

# From stdin — JSONL in, JSONL out
cat batch.jsonl | km code

# Multi-line
km code "
  const inbox = state(s => s.columns[0].cards)
  const work = inbox.filter(c => /meeting|sprint/.test(c.title.toLowerCase()))
  for (const c of work) await board.move({ nodeId: c.id, target: '@work' })
  work.length
"
# → 7
```

### The JSONL Protocol

Minimal — inspired by Jupyter's kernel protocol but stripped to essentials:

```typescript
// Request (one per line)
{ id: number, code: string }

// Response variants (one or more per request)
{ id: number, ok: true, result: any }      // success
{ id: number, ok: false, error: string }   // error
{ id: number, stream: string }             // streaming output (console.log)
```

Why not JSON-RPC 2.0? There's only one method: eval. JSONL with request IDs is sufficient.

The code runs in a sandbox (V8 isolate, Bun `vm` module, or similar) — it can call domain object methods and read state, but can't access the filesystem or network.

### Why Code?

**AI agents already know JavaScript.** It's the language they're best at generating. The difference from a normal JS runtime: the "standard library" is your app's domain objects.

**Token efficiency.** Goose (Block/Square) found that Code Mode consumed **3% of the context window** for a multi-step task, vs **16% for raw MCP tool calling** — a 5x reduction. Cloudflare's Code Mode showed an **81% token reduction** for complex tasks. The savings come from batching multiple operations into a single code block instead of separate tool-call round-trips.

**Composition.** CLI calls are stateless — each invocation is a new process. MCP calls are one-tool-at-a-time. Code has loops, conditionals, variables, error handling.

**Example: Cleaning up the Inbox.** Instead of 5 separate tool calls to filter tasks, move them, and mark done errands as complete, the AI sends one code block:

```javascript
const inbox = state((s) => s.columns[0].cards)
for (const c of inbox) {
  if (/meeting|sprint/.test(c.title)) await board.move({ nodeId: c.id, target: "@work" })
  if (c.task_status === "done") await task.archive({ nodeId: c.id })
}
```

One request, one round-trip, full language power. Compare to the MCP equivalent: `list_tasks` → filter client-side → `move_task` × N → `archive_task` × M — 5+ tool calls, 5+ round-trips, context window full of JSON schemas.

**Sessions.** Interactive apps have session state — cursor position, scroll position, selections. Stateless CLI calls lose this between invocations. The code notebook keeps a persistent session where variables and state survive across requests — like Jupyter, but for your app instead of Python.

### The LLM Training Gap

LLMs are heavily trained on bash, CLI commands, and tool-calling patterns. Code mode is a new paradigm — the AI writes JavaScript against a domain-specific API instead of invoking 20 CLI subcommands. Will LLMs naturally prefer this?

The evidence says yes, but it requires nudging:

- **LLMs already prefer code when given the choice.** Cloudflare found that models generate better code than they do tool-calling JSON — "code is the LLM's native language." The key is framing: when the AI has a `.d.ts` with examples and a `code` eval endpoint, it writes idiomatic JavaScript without prompting.
- **The `.d.ts` dump is the bridge.** LLMs are trained on millions of TypeScript definitions. Give them `interface KM { task: { toggle_done(...) } }` and they'll generate `await task.toggle_done()` as naturally as `git commit -m`. The type definitions leverage existing training rather than fighting it.
- **System prompts steer behavior.** A one-line instruction — "Use `km code` to execute JavaScript against the app's API. Prefer a single code block over multiple CLI calls." — is enough. The savings (1 code block vs 20 CLI calls) reinforce the behavior once the AI tries it.
- **The framework should make code mode the path of least resistance.** If `km code "..."` via Bash is simpler than configuring an MCP server with 173 tools, the AI will default to it. This is a design choice, not a training problem.

One caveat: the sweet spot for code mode is with capable, code-fluent models (GPT-4, Claude, Gemini, and the growing crop of open models fine-tuned on code). Smaller models with weaker code generation may still prefer structured tool calling. As models improve, this gap narrows — but it's worth noting that code mode is best-suited for the models most likely to be driving agents.

The risk isn't that LLMs can't do this — it's that tooling defaults push them toward tool-calling. Silvery's job is to make code mode the obvious, frictionless choice.

### For Claude Code

Claude Code already has Bash. Integration is zero-config:

```bash
# Discovery (cached after first call)
km code --types

# One-off eval
km code "state(s => s.columns.map(c => ({ title: c.title, count: c.cards.length })))"

# Multi-step code
km code "
  const inbox = state(s => s.columns[0].cards)
  const work = inbox.filter(c => /meeting|sprint/.test(c.title))
  for (const c of work) await board.move({ nodeId: c.id, target: '@work' })
  work.length
"
# → 7
```

No MCP server to configure. No tool schemas to load. The AI writes JavaScript — something it's better at than any tool-calling format.

### Testing with mdspec

Code mode is a natural fit for **executable documentation**. Tests written as markdown with embedded code blocks run in the same sandbox as `app code`:

````markdown
## Toggle a task

```js
await task.toggle_done({ nodeId: "abc" })
const t = state((s) => s.tasks.find((t) => t.id === "abc"))
assert(t.done === true)
```

## Batch prioritize overdue tasks

```js
const overdue = state((s) => s.columns[0].cards.filter((c) => c.due < Date.now()))
for (const c of overdue) await task.set_priority({ nodeId: c.id, priority: 1 })
assert(overdue.every((c) => state((s) => s.tasks.find((t) => t.id === c.id).priority) === 1))
```
````

The markdown IS the test suite AND the documentation. Same code, same domain objects, same sandbox — tests can't drift from the real API.

## Agent Mode (`app ai`)

The second innovative feature. The running app **IS an agent** — it has its own LLM, can reason about requests, and participates in multi-agent workflows as a peer.

```bash
km ai "triage my inbox"
# → Moved 12 work items, completed 7 done errands, flagged 3 overdue tasks.

km ai serve --port 3456
# Long-running agent accepting connections
```

Why is this different from just calling `app code` with generated JS? The agent:

- **Understands natural language.** "Triage my inbox" → the app decides which commands to run. No code generation needed from the caller.
- **Has domain expertise.** It knows its own domain objects, state schema, and data semantics better than any external agent could.
- **Can ask clarifying questions.** "You have 3 tasks marked 'meeting' — should I include '1:1 with Sarah'?"
- **Can proactively notify.** "5 tasks are overdue. Want me to reschedule?"

```
┌─────────────────────────────────────────────────────┐
│  km ai serve                                        │
│                                                     │
│  ┌──────────────┐  ┌─────┐  ┌───────────────────┐   │
│  │ Domain       │  │ LLM │  │ State             │   │
│  │ Objects      │◄─┤     ├─►│ (structured data) │   │
│  │ (what I do)  │  │     │  │ (what I know)     │   │
│  └──────────────┘  └─────┘  └───────────────────┘   │
│                                                     │
│  Interfaces:                                        │
│  • Natural language (agent-to-agent)                │
│  • Code (code interface, for direct access)         │
│  • MCP (for platforms that require it)              │
│                                                     │
│  Transports:                                        │
│  • stdio (pipes — for local agents)                 │
│  • WebSocket (for remote agents)                    │
│  • Unix socket (for local, fast)                    │
└─────────────────────────────────────────────────────┘
```

### Agent Protocol: tRPC

When serving, the agent uses a **tRPC-inspired protocol** — TypeScript-first, end-to-end type inference, no code generation:

```typescript
const appRouter = router({
  ask:      procedure.input(z.object({ text: z.string() })).mutation(...),
  eval:     procedure.input(z.object({ code: z.string() })).mutation(...),
  describe: procedure.query(...),
  state:    procedure.input(z.object({ select: z.string().optional() })).query(...),
  types:    procedure.query(...),
})
```

Why tRPC over JSON-RPC 2.0? **The types ARE the contract.** A TypeScript agent connecting to `km ai serve` gets full autocomplete and type checking — no separate schema, no code generation. Same philosophy as command-centric design: no annotation gap. It's lighter than gRPC (no `.proto` files, no compiler) and more precise than OpenAPI (no codegen step) — just define procedures in TypeScript and the contract follows.

For non-TypeScript clients, the agent also speaks JSON-RPC 2.0 and MCP — so integration with Python, Go, or platform-specific agent systems works via standard protocols.

Two protocols for two use cases:

- **`app code`** → JSONL (one method: eval. Minimal, fast.)
- **`app ai serve`** → tRPC (multi-method, typed, subscriptions, batching.)

## The Command REPL (`app repl`)

For humans who want to drive the app from the terminal. Same domain objects as code mode, but with pretty output, colors, and tab completion:

```
$ km repl
km> task.toggle_done({ nodeId: "abc" })
Toggled "Q3 report" → done
km> state(s => s.columns[0].title)
"Inbox"
km> const overdue = state(s => s.columns[0].cards.filter(c => c.due && c.due < Date.now()))
km> for (const c of overdue) await task.set_priority({ nodeId: c.id, priority: 1 })
Set priority on 7 tasks
```

One-off mode: `km repl toggle-done --node-id abc` or `km repl "state(s => s.columns.length)"`.

The REPL is the power-user interface — like Emacs `M-x` or browser DevTools console, but for your app.

## Embedded AI: The `<AIChat>` Component

For apps that want AI built into the UI:

```tsx
import { AIChat } from "@silvery/ai"

function App() {
  return (
    <Board columns={columns}>
      <AIChat model="claude-sonnet-4-6" />
    </Board>
  )
}
```

`<AIChat>` uses `withAIAgent()` internally and gets domain objects from the Silvery context automatically. When the user types a message:

1. **AIChat reads domain types** — grouped and typed, not a flat command list
2. **LLM generates code** — using domain objects (`task.*`, `board.*`, etc.)
3. **Executes in the code sandbox** — same sandbox as `app code`
4. **Results render in the chat** — state changes appear in the UI in real-time

```tsx
<AIChat
  model="claude-sonnet-4-6"
  systemPrompt="You are a task management assistant."
  domains={["task", "board"]} // restrict visible domain objects
  confirm={["task.delete", "board.archive"]} // require user confirmation
/>
```

**`<AIChat>` and `km ai` are the same thing** — one renders inside the TUI, the other runs headlessly. Same LLM, same domain objects, same sandbox.

## Multi-Agent Collaboration

When apps are agents, they can talk to each other:

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ Claude Code  │     │  km agent    │     │  cal agent   │
│ (orchestrator│────►│  (tasks)     │────►│  (calendar)  │
│  agent)      │     │              │     │              │
└──────────────┘     └──────────────┘     └──────────────┘
```

Discovery is simple: each agent exposes its domain objects and types. The orchestrator reads `km code --types` and `cal code --types` to know what each app can do — a handful of typed domain objects, not hundreds of flat commands.

**Scenario: Planning Your Week.** Claude Code is helping plan your week.

```
Claude Code → km agent: "What's overdue?"
km agent: [{ title: "Q3 report", due: "2026-03-08", priority: 1 }, ...]

Claude Code → cal agent: "What's on my calendar this week?"
cal agent: [{ title: "Sprint planning", time: "Mon 10am" }, ...]

Claude Code → km agent: "Reschedule 'Q3 report' to Wednesday"
km agent: { ok: true, newDue: "2026-03-13" }

Claude Code → cal agent: "Block 2 hours Wednesday afternoon for 'Q3 report'"
cal agent: { ok: true, event: "Wed 2-4pm: Q3 report" }
```

Each app-agent understands its own domain. The orchestrator delegates rather than scripting.

## The Agent Hub

Point-to-point connections work for 2-3 agents. At scale, you need a hub:

```
┌──────────────────────────────────────────────────────┐
│  Agent Hub                                            │
│                                                       │
│  Registry:                                            │
│    km      → ws://localhost:3456  (tasks/notes)       │
│    cal     → ws://localhost:3457  (calendar)           │
│    mail    → ws://localhost:3458  (email)              │
│    files   → ws://localhost:3459  (file manager)       │
│                                                       │
│  Discovery:                                           │
│    hub.types() → merged .d.ts from all agents         │
│    hub.domains() → { km: [task, board, ...],          │
│                       cal: [event, calendar, ...] }   │
│                                                       │
│  Orchestration:                                       │
│    "Plan my week" →                                   │
│      1. km.task: get overdue tasks                    │
│      2. cal.event: get this week's events             │
│      3. km.board: reschedule tasks around events      │
│      4. cal.event: add focus blocks                   │
│                                                       │
│  Permissions:                                         │
│    claude-code: read all, write km+cal                │
│    assistant: read all, write all                     │
│    automation: read km, write km                      │
│                                                       │
│  Audit:                                               │
│    All cross-agent communication logged               │
│    Named domain methods = auditable trail             │
└──────────────────────────────────────────────────────┘
```

- **Discovery** — `hub.types()` returns merged `.d.ts` across all agents. Explore a handful of typed domain objects, not hundreds of flat commands.
- **Routing** — "who handles calendar?" → routes to cal agent's `event` domain
- **Orchestration** — multi-step workflows across agents, with dependency ordering
- **Permissions** — which agents can read/write which domains
- **Audit** — all communication logged as named domain methods, replayable

## MCP Compatibility

For platforms that require MCP (Claude Desktop, Cursor, VS Code):

```bash
km ai serve --mcp                  # MCP over stdio
```

This wraps the same domain objects in the MCP protocol:

- `describe` and `types` are always-loaded tools (~500 tokens total)
- Each domain method is a deferred tool (Claude discovers via tool search)
- Or: `execute(domain, method, args)` is one always-loaded tool

Claude Code already implements progressive discovery for MCP — `defer_loading: true` reduces 77K tokens to ~500, and tool selection accuracy _improves_ from 49% → 74%.

But for local interaction, `km code` via Bash is simpler, faster, and needs zero configuration.

## The Complete Picture

```
                   Discovery
                   km code --types
                   (domain objects + .d.ts)
                          │
          ┌───────────────┼───────────────┐
          │               │               │
       app│code        app ai          app│repl
      (JSO│L eval)   (NL agent)      (huma│ REPL)
      with│ode()     withAIAgent()   withR│pl()
          │               │               │
        JS│NL           tRPC            Te│t
          │               │               │
          └───────────────────────────────┘
                          │
                   Same headless runtime:
                   domain objects, state, screen
                          │
              ┌───────────┼───────────┐
              │           │           │
           stdio       WebSocket    MCP
           (pipes)     (remote)     (compat)
                          │
                      Agent Hub
                   (orchestration)

withAI() = withCode() + withAIAgent()   ← the bundle
withRepl()                               ← separate (dev tool)
```

---

# Part 2: Application in Silvery

## Silvery Implementation Roadmap

```
commands + keymap()  ← exists: { fn, args? } objects, invoke(), getState()
  ↓
withCli()            ← next: auto-generated CLI from command tree
                       myapp --help, cheat sheet, man pages
  ↓
withRepl()           ← then: interactive command REPL for humans
                       myapp repl, tab completion, pretty output
  ↓
withCode()           ← then: code interface for AI/scripts
                       myapp code, JSONL, domain objects as globals
  ↓
withAIAgent()        ← then: agent mode with LLM
                       myapp ai, natural language, tRPC
  ↓
withAI()             ← bundle: withCode() + withAIAgent()
  ↓
<AIChat>             ← component: embedded AI chat panel
                       uses withAIAgent(), renders chat UI in TUI
  ↓
AgentHub             ← orchestration layer
                       discovery via merged types, routing, permissions
```

## Open Questions

- **JS interpreter choice.** Bun's `vm` module? V8 isolates? QuickJS? Needs async/await support and domain objects as globals.

- **Type generation.** Build time from CommandDef metadata, or runtime via reflection? Build time is simpler and enables IDE support; runtime enables dynamic plugins.

- **tRPC transport.** tRPC is built for HTTP/WebSocket, not stdio. Adapt tRPC's transport layer, or use a tRPC-inspired JSONL protocol that preserves the typed contract.

- **Hub discovery.** How do agents register? Well-known port? mDNS/Bonjour? `~/.agents.json`? Should be zero-config for local agents.

- **Sandbox boundaries.** `console.log` streams via JSONL. `setTimeout` probably yes. `fetch` probably no. Closer to Cloudflare than Jupyter.

- **LLM configuration.** For `withAIAgent()` and `<AIChat>`: model selection, API key management, system prompt customization. Defaults vs explicit config.

- **CRDT-backed state (TODO — worth exploring).** What if all app state lives in a CRDT (like Automerge) and every command produces a change on it? This would give us:
  - **Free undo/redo** — every change is a CRDT operation; time-travel is built-in
  - **Nothing is dangerous** — any pure state mutation (not a side effect) can be undone. The security concern ("what if the AI deletes everything?") becomes trivial: just revert the changes. Only _effects_ (sending email, calling external APIs) are truly destructive.
  - **Jupyter-style notebooks for real** — each code cell produces CRDT changes. You can re-run cells, reorder them, undo individual cells, branch the state. The notebook isn't just evaluating code — it's producing a replayable history of state transformations.
  - **Multi-agent safety** — multiple agents operating on the same app state can't corrupt each other; CRDT merges handle conflicts automatically.
  - **Sync** — CRDT state syncs across devices/instances for free. A headless agent and a TUI can share the same live state.
  - This would make the command/effect split from [TEA (The Elm Architecture) state machines](../../../../docs/design/tea.md) even more meaningful: commands that produce state changes are always safe (CRDT-backed, undoable). Commands that produce effects (send email, write file) are the only ones that need confirmation.

- **Security (TODO — needs its own design).** The building blocks are sketched (per-command confirmation via `<AIChat confirm={[...]}>`; token-based auth for `app ai serve`; Unix socket permissions for local agents; per-agent permission scopes in Agent Hub). But the full security model — what happens when an AI calls a destructive command, how permissions compose across agents, how to audit and revoke — needs a dedicated design pass. The CRDT approach above could simplify this significantly: if state mutations are always undoable, the security concern narrows to effects only.

- **Headless mode.** Booting without a terminal — just domain objects + state + storage. May need `createHeadlessApp()` that sets up the command layer without the rendering pipeline.

---

_See also: [Command-Centric Design](../v15-tea/commands.md) — the architectural foundation that makes AI Mode possible._
