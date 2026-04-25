# In-Process MCP for Silvercode

**Status:** design, pre-implementation
**Owner:** silvercode
**Tracking bead:** `km-silvercode.inproc-mcp`
**Date:** 2026-04-24

## Problem

On Ctrl+C, silvercode shutdown takes seconds. The controller sends SIGTERM to each Claude subprocess; each Claude in turn SIGTERMs its MCP sub-subprocesses (`km-mcp`, `tribe-mcp`), drains their stdio, and only then exits. Node can't exit until the whole chain closes.

The user has rejected two workarounds:

- `SIGKILL` to Claude (rude — skips Claude's own graceful cleanup).
- `proc.unref()` on the Claude child (abandons supervisory duty — we'd return before knowing Claude has actually shut down).

The root question: **can we eliminate the MCP subprocesses and host `km-mcp` / `tribe-mcp` in the silvercode Node process?**

## How MCP currently works in silvercode

Silvercode spawns Claude Code via `@km/agent-harness`:

```
silvercode (Node)
 └── claude (Track 1 subprocess)  [apps/silvercode/packages/agent-harness/src/spawn.ts:185]
      └── bun run apps/silvercode/packages/km-mcp-server/src/bin.ts
      └── bun run apps/silvercode/packages/tribe-mcp/src/bin.ts
```

The harness materializes a temp `mcp-config.json` [[spawn.ts:134-161](../packages/agent-harness/src/spawn.ts)]:

```json
{
  "mcpServers": {
    "tribe": {
      "command": "bun",
      "args": ["run", ".../tribe-mcp/src/bin.ts"],
      "env": { "TRIBE_SESSION_NAME": "session 1" }
    },
    "km": {
      "command": "bun",
      "args": ["run", ".../km-mcp-server/src/bin.ts"],
      "env": { "KM_DB_PATH": "/.../.km/state.db" }
    }
  }
}
```

Claude is invoked with `--mcp-config <tempfile> --strict-mcp-config`, which tells it to spawn each declared server as a child process and speak JSON-RPC 2.0 over newline-delimited JSON on stdin/stdout.

**Server code:**

- `apps/silvercode/packages/km-mcp-server/src/bin.ts` (80 lines) — opens `.km/state.db` read-only via `bun:sqlite`, wires `@km/storage`'s `search / getNode / getAllNodes` into a `KmContext`, and runs the JSON-RPC loop from `transport.ts`. Four read-only tools: `km_search`, `km_get_node`, `km_get_board`, `km_render_path`. Deps: `@km/core`, `@km/storage`, `bun:sqlite`.
- `apps/silvercode/packages/tribe-mcp/src/bin.ts` (122 lines) — reads `TRIBE_SESSION_NAME` and a JSONL bus at `~/.km/tribe-bus.jsonl`. Implements a file-backed `TribeBackend` (send / history / members) and pipes stdin → `server.handle` → stdout. Deps: `@km/agent-harness` (only for the `createTribeMcpServer` types + factory).

Both bins are thin shells around re-usable factories (`createMcpServer(ctx)`, `createTribeMcpServer(backend, sessionName)`). The factories themselves have zero transport assumptions.

## Options

### (a) Unix-domain socket / pipe transport

**Idea:** silvercode hosts `km-mcp` + `tribe-mcp` in-process, binds a UDS per session, writes the UDS paths into the mcp-config, and lets Claude connect.

**Verdict: not supported.** Claude Code's MCP config accepts exactly three transports: `stdio | sse | http`. Evidence from the Claude CLI binary (`/Users/beorn/.local/share/claude/versions/2.1.119`):

```
type==="http"
type==="sse"
type==="ws"           // internal only — not exposed via --mcp-config
type??"stdio"         // default when type omitted
type: 'url'           // alias for http
```

`claude mcp add --transport <stdio|sse|http>` is the public surface. There is no `type: "socket"` / `"unix"` / `"fd"`. If we wrote `{"type": "socket", "path": "/tmp/km.sock"}` into the config, Claude would reject it as an unknown transport.

The MCP spec (modelcontextprotocol.io) itself defines stdio, SSE, and streamable HTTP as the standard transports. UDS is not in the spec; Anthropic would have to add it.

**Pros:** would be lowest-latency in-process, reuses existing JSON-RPC handler code verbatim.
**Cons:** requires upstream Anthropic changes. Not actionable from our side.
**Effort:** infinite (blocked on Anthropic).

### (b) Run MCP servers as worker_threads inside silvercode, bridge via pipe

**Idea:** `worker_threads` instead of `spawn`. Main thread hosts a pipe pair per MCP server; Claude still sees `"type": "stdio"` but `command` points at a shim that connects the child stdio to the worker.

**Verdict: doesn't help.** The whole point of the question is that Claude speaks stdio to a process it spawned. To make Claude talk to a worker thread inside silvercode, we'd still need Claude to spawn a child — which is exactly the shutdown-latency problem we're trying to eliminate. A shim child that proxies to a worker is strictly worse than the current setup: same subprocess count, extra IPC hop, more moving parts.

**Pros:** none vs. current setup.
**Cons:** adds a shim process per MCP server; doesn't reduce subprocess count.
**Effort:** 3-5 days.
**Don't do this.**

### (c) Pre-connected fd transport (fd:3 / fd:4)

**Idea:** fork Claude with inherited file descriptors (3 and 4) already bound to an in-process JSON-RPC server. Declare in mcp-config as `{"type": "fd", "read": 3, "write": 4}` or similar.

**Verdict: not supported.** No evidence of an `fd` transport in the Claude binary. The public transport set is locked at `stdio | sse | http`. Even internally the binary has `ws` for its own DirectConnectTransport (cloud-side session connection), not an MCP transport.

**Effort:** infinite (blocked on Anthropic).

### (d) Do nothing; make shutdown faster by other means

**Sub-options:**

- **(d1) Pre-close MCP stdio from silvercode's end before SIGTERM.** We don't own those pipes — Claude does. Claude opened them when it spawned the MCP children. Silvercode has no handle to close.
- **(d2) Parallel SIGTERM to grandchildren.** Silvercode could scan its process tree (via `ps` or `/proc`) and SIGTERM `km-mcp` + `tribe-mcp` directly, alongside SIGTERMing Claude. Both would start shutting down simultaneously. Fragile: depends on ps output parsing, race conditions with Claude's own cleanup, and loses the "Claude orchestrates its own teardown" invariant the user values.
- **(d3) Send SIGTERM earlier.** Fire SIGTERM on the first React render of the exit overlay, not after it commits. Saves one render frame (~16 ms), not seconds. Marginal.
- **(d4) `--bare` the MCP servers.** Already bare — they're 80/122 line scripts with minimal imports. Already fast-exit. Not the bottleneck.
- **(d5) Replace `bun run <ts-file>` with a compiled binary.** `bun run` has cold-start cost on spawn (~50-100 ms) but the shutdown cost is the stdio drain, not startup. Won't help.

**Verdict: marginal.** None of these actually remove the grandchild subprocesses. They shave tens to hundreds of milliseconds off a multi-second problem.

### (e) Merge km-mcp + tribe-mcp into one server

**Idea:** one bin that exposes both toolsets. Reduces Claude's MCP subprocess count from 2 → 1 per session. With N sessions: `N` grandchildren instead of `2N`.

**Verdict: viable, straightforward, not the full fix.** Halves shutdown cost. No upstream dependency. ~1 day of work: create a new `@km/silvercode-mcp` package that imports both factories, picks backends based on env vars, and routes by tool-name prefix.

**Pros:** deterministic win; no Anthropic dependency; cleaner config.
**Cons:** still spawns a grandchild; still takes seconds (just half as many seconds); conflates two unrelated concerns (km data access vs. tribe messaging) in one process for deployment-only reasons.
**Effort:** 1 day.

### (f) Switch to the Claude Agent SDK with `createSdkMcpServer`

**Idea:** use `@anthropic-ai/claude-agent-sdk`'s `createSdkMcpServer()` — the SDK's first-class in-process MCP API. Silvercode already has `packages/agent-harness/src/sdk-adapter.ts` (Track 2) dynamically importing this SDK.

**Evidence from Anthropic's docs** (code.claude.com/docs/en/agent-sdk/custom-tools):

> The server runs in-process inside your application, not as a separate process.

**Evidence from the Claude CLI binary** — the SDK's config materializer (`Xv8` in agentSdk.ts):

```js
if (e)
  for (let [pH, rH] of Object.entries(e))
    if (rH.type === "sdk" && rH.instance) xH.set(pH, rH.instance)
    else LH[pH] = rH
```

SDK-type servers are held in a `Map` of live instances; stdio/sse/http configs are forwarded to the CLI subprocess. The SDK routes tool calls through the stream-json pipe to the CLI and dispatches them **back** to the in-process JS handler in the host. No grandchild subprocess per MCP server.

Usage sketch:

```typescript
import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { TOOL_DEFINITIONS, callTool, createKmContextFromStorage } from "@km/mcp-server"

// Reuse the existing factory — the transport shell is what we're replacing
const kmCtx = createKmContextFromStorage(db, { search, getNode, ... })

const kmServer = createSdkMcpServer({
  name: "km",
  version: "0.1.0",
  tools: TOOL_DEFINITIONS.map(def =>
    tool(def.name, def.description, def.inputSchema, async (args) => {
      const result = await callTool(kmCtx, def.name, args)
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }
    })
  ),
})

// Then:
for await (const msg of query({
  prompt: input,
  options: {
    mcpServers: { km: kmServer, tribe: tribeServer },
    allowedTools: ["mcp__km__*", "mcp__tribe__*"],
    ...
  },
})) { ... }
```

**Shutdown implications:**

- No `km-mcp` / `tribe-mcp` grandchildren to drain.
- SDK still spawns the Claude CLI as a subprocess (`spawnClaudeCodeProcess`) — so one child per session, not three.
- On Ctrl+C: SIGTERM Claude CLI → CLI flushes its own state and exits → SDK's async generator closes → Node exits. One drain instead of three-stage cascade.

**Pros:**

- Eliminates the MCP subprocesses (the stated goal).
- Uses Anthropic's supported in-process MCP API; no protocol changes needed.
- Tool handlers have direct access to silvercode's live state — we can bind to the same `bun:sqlite` Database, the same in-memory tribe backend (`createInMemoryTribe` in `controller.ts`) already threaded through the Controller.
- Track 2 adapter already exists in `sdk-adapter.ts`.

**Cons:**

- **Billing model switches from subscription (OAuth) to API key** on Track 2. The SDK's `options.apiKey` path is API-billing; `spawnClaude` (Track 1) is the subscription path. This is the one structural reason silvercode has two tracks. Moving MCP servers in-process for Track 1 would require Anthropic to add SDK-style in-process MCP to the bare CLI's `--mcp-config` schema — which returns us to option (a).
- The SDK bundles the CLI binary; it still spawns a subprocess internally — but it's _one_ subprocess instead of three, and the SDK owns its lifecycle so close-propagation is deterministic.
- `@anthropic-ai/claude-agent-sdk` is an optional peer dep (`sdk-adapter.ts:38`). Making it default means installing it for every user.
- Doesn't solve the problem for Track 1 users (subscription billing), who remain stuck with 2 MCP grandchildren per session.

**Effort:** 2-3 days for Track 2; wire `createSdkMcpServer` wrappers around the two existing factory APIs; update `controller.ts:defaultMcpServers` to return `{type: "sdk", instance: ...}` specs when `track === "sdk"`; add passthrough in `sdk-adapter.ts` so the SDK receives them.

## Recommendation

**Ship (e) now, and (f) for Track 2 users. (a) is blocked upstream — file a feature request.**

Concretely:

1. **(e) Merge km + tribe MCP servers** — 1 day. Halves the shutdown-latency problem immediately for Track 1 (subscription) users. Even with (f) in place, Track 1 remains the default path and benefits permanently.

2. **(f) Wire in-process MCP for Track 2 (SDK)** — 2-3 days. Eliminates the grandchild MCP subprocesses entirely for users on API-key billing. Leverages existing `sdk-adapter.ts`. Good showcase of the Agent SDK integration.

3. **(a) File an Anthropic feature request** asking for one of:
   - A `type: "sdk"` / in-process MCP path in the CLI's `--mcp-config` schema, parallel to what the Agent SDK already offers internally.
   - Or, a UDS/fd transport added to the MCP spec.

   Without this, Track 1 (the subscription path most silvercode users are on) will always have MCP grandchildren and the shutdown drain they cause. Option (e) compresses the pain; only upstream support eliminates it.

Do **not** pursue (b) (worker-thread shim), (c) (fd transport — no upstream support), or (d1-d5) (micro-optimizations that don't address the structural cause).

### Why not default-switch silvercode to Track 2?

The user's whole reason for preferring Track 1 is **subscription billing** (OAuth, uses the user's Claude Code plan). Track 2 bills per-token via API key. Forcing Track 2 to kill MCP grandchildren would be optimizing the wrong axis: users pay 10-50x more per session to save a few seconds on shutdown. Keep Track 1 the default; offer Track 2 with in-process MCP as an opt-in for users who already want SDK semantics.

## What silvercode needs to do

- [ ] **Task 1: Merge km-mcp + tribe-mcp.** New package `apps/silvercode/packages/silvercode-mcp` (or fold into `km-mcp-server`). Single bin dispatching on tool-name prefix. `controller.ts:defaultMcpServers` returns one spec instead of two.
- [ ] **Task 2: Wrap MCP factories with `createSdkMcpServer`.** Adaptor layer in `sdk-adapter.ts` (or a sibling) that takes a `KmContext` + `TribeBackend` and returns SDK-MCP instances. Passed into `spawnSdk` via `sdkOptions.mcpServers`.
- [ ] **Task 3: Feature request to Anthropic.** Post to their GitHub / feedback channel: request in-process MCP for the CLI's `--mcp-config`, or UDS/fd transport support. Reference MCP spec and this doc.

## Open questions

1. **Is the subscription-vs-API-key cost tradeoff actually blocking Track 2 default?** If not, going Track 2 everywhere (+ in-process MCP) is the simpler fix. Needs an explicit "how much does the user care about API-key cost per session?" answer.
2. **Does the Anthropic CLI have an undocumented SDK bridge that works with subscription OAuth?** The SDK's `pathToClaudeCodeExecutable` path suggests yes — the SDK bundles and spawns the same CLI binary, and the CLI binary accepts the same OAuth credentials from `CLAUDE_CONFIG_DIR/.credentials.json`. Need to verify: does `spawnSdk` with `CLAUDE_CONFIG_DIR=~/.claude` bill to the subscription, or does the SDK force API-key even when CLAUDE_CONFIG_DIR has OAuth creds? If the former, we might default-switch to Track 2.
3. **Per-session `createSdkMcpServer` instances?** SDK docs show one server per query. With N concurrent silvercode sessions, do we instantiate N SDK servers (one per query), or can one server serve many queries? (Almost certainly the former; the server is cheap — zero subprocess overhead.)
4. **Tribe semantics change.** Current `tribe-mcp` uses a file-backed bus (`~/.km/tribe-bus.jsonl`) for cross-process messaging. In-process tribe (option f) would use silvercode's `createInMemoryTribe()` directly — same-process sessions only. Cross-silvercode-host tribe (if any) needs a separate mechanism. Confirm we only need in-process tribe for now.

## References

- `apps/silvercode/packages/km-mcp-server/src/bin.ts` — km MCP stdio bin
- `apps/silvercode/packages/tribe-mcp/src/bin.ts` — tribe MCP stdio bin
- `apps/silvercode/packages/agent-harness/src/spawn.ts:134` — mcp-config materializer
- `apps/silvercode/packages/agent-harness/src/sdk-adapter.ts` — Track 2 (SDK) adapter
- `apps/silvercode/src/controller.ts:42` — `defaultMcpServers()`
- Anthropic docs: https://code.claude.com/docs/en/agent-sdk/custom-tools (createSdkMcpServer)
- Anthropic docs: https://code.claude.com/docs/en/agent-sdk/mcp (transport types)
- MCP spec: https://modelcontextprotocol.io/specification/2025-06-18
