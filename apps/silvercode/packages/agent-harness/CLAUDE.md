# @km/agent-harness

Typed harness for spawning agent CLIs (Claude Code, Codex, etc.) and exposing them as a uniform `AgentSession` to silvercode. Lives at `apps/silvercode/packages/agent-harness/`.

## Two parallel typed surfaces

This package has **two** typed event/message surfaces. They co-exist intentionally:

1. **Legacy `AgentEvent`** — `src/events.ts`. The Claude-CLI-shaped, turn-oriented union (`session-init`, `turn-start`, `text-delta`, `tool-use`, etc.). Produced by `parse.ts` (stream-json normalizer) and consumed by `session-store.ts`. Most existing silvercode UI binds to this.
2. **Canonical ACP-shaped types** — `src/acp-types.ts`. Silvercode's owned `SessionUpdate` / `ToolCall` / `Plan` / `ContentBlock` / capabilities surface, structurally compatible with `@agentclientprotocol/sdk` v1. New work targets this surface; existing legacy paths migrate one feature at a time.

The boundary between ACP and silvercode lives in **one** module: `src/acp-boundary.ts`. It is the only file allowed to import from `@agentclientprotocol/sdk`. Everywhere else in silvercode imports from `acp-types.ts`.

## Why two surfaces

Stream-json from `claude --bare -p` is a _superset_ of ACP's `SessionUpdate` (it carries Claude-Code-specific concerns ACP has no native vocabulary for: hooks, skills, plugin manifests, compaction events). Translating directly from stream-json to ACP would either drop information (if we only emit ACP variants) or stuff it into `ExtNotification` (if we wrap escapes). Neither is satisfying; both lose typing.

The plan: keep `AgentEvent` for the rich Claude-specific path, add ACP-shaped `SessionUpdate` for cross-agent components. Adapters for ACP-speaking agents (Goose, Codex via `@zed-industries/codex-acp`, Gemini, Copilot) emit `SessionUpdate` directly — no `AgentEvent` indirection. Components that only need ACP-modelled features (tool calls, plans, permissions) consume `SessionUpdate`. Components that need Claude-only features keep consuming `AgentEvent`. Migration is gradual.

## Design rules

- **Boundary discipline**: only `acp-boundary.ts` imports `@agentclientprotocol/sdk` types. If any other file imports from that package, push the import down into `acp-boundary.ts` and re-export the silvercode-shaped equivalent.
- **Discriminator names match ACP exactly**: `sessionUpdate: "tool_call"` not `kind: "tool-call"`. Same field names, same string-literal values. The whole point of the layer is to be _structurally_ identical at v1 so the boundary adapter is mostly identity.
- **Brand ids**: silvercode's `SessionId`, `ToolCallId`, `PermissionOptionId`, `SessionModeId` are branded strings. ACP's are bare strings. Casts live only in `acp-boundary.ts`.
- **Round-trip every variant**: every `SessionUpdate` variant, every `ToolKind`, every `PermissionOptionKind`, every `ContentBlock` variant, every `ToolCallContent` variant has a round-trip test in `tests/acp-boundary.test.ts`. When you add a variant, add its fixture.
- **No business logic in the boundary**: the adapter is field rename + brand cast + variant dispatch. Anything else (filtering, debouncing, normalization) belongs in the per-agent stream-json adapter or the session store, not in `acp-boundary.ts`.

## Promotion criterion — when to drop the silvercode-types layer

Re-evaluate **quarterly**. Promote ACP types to canonical (drop `acp-types.ts`, replace silvercode imports with direct `@agentclientprotocol/sdk` imports) when **both** are true:

1. **Zed reaches 100% spec coverage in its own ACP client.** Currently (2026-04-26): session resume doesn't replay history, permission requests are under-implemented, plan updates are limited. Independently verified by OpenClaw's ACP gap audit and by `pi-mono` issues #241 / #836.
2. **ACP `protocolVersion` bumps to 2 with a real deprecation policy.** Currently: wire `protocolVersion` is pinned at 1, but the TypeScript SDK type surface has churned twice in 5 months (`@agentclientprotocol/sdk` v0.7.0 → v0.8.0). Wire is stable, types are not. v2 with a deprecation policy means breaking type churn becomes manageable rather than silent.

Until both conditions hold, keep the layer. The cost is ~50 LOC of mostly-identity adapter; the benefit is that one file absorbs every breaking SDK change and the rest of silvercode never has to look at a `_meta` field or worry about `optional vs nullable` SDK churn.

## File map

```
src/
  acp-types.ts       # silvercode's canonical ACP-shaped types (no @agentclientprotocol/sdk import)
  acp-boundary.ts    # bidirectional adapter — ONLY file importing @agentclientprotocol/sdk
  acp-client.ts      # connectAcp(scope, opts): scope-bound ClientSideConnection for external ACP servers
  events.ts          # legacy AgentEvent union (Claude stream-json shaped, turn-oriented)
  parse.ts           # stream-json → AgentEvent normalizer (legacy path)
  session-store.ts   # AgentEvent consumer; emits signals for silvery components
  spawn.ts           # spawnClaude(): subprocess + stream-json parser
  sdk-adapter.ts     # spawnSdk(): @anthropic-ai/claude-agent-sdk path
  codex-spawn.ts     # spawnCodex(): codex CLI subprocess
  injectors.ts       # context injection (active bead, cwd, channel digest)
  event-log.ts       # append-only event log (file or memory)
  index.ts           # public exports
tests/               # vitest tests, including round-trip acp-boundary.test.ts
```

## Consuming an external ACP server (Codex, Gemini CLI, Copilot CLI, pi-acp)

`connectAcp(scope, opts)` spawns an ACP server child process and returns an
`AcpAgentSession` — same shape as the legacy `AgentSession`, so the existing
`session-store.ts` / `MessageList` / `ToolCallBlock` UI works unchanged.

```ts
import { connectAcp, connectAcpRegistry } from "@km/agent-harness"
import { createScope } from "@silvery/scope"

await using scope = createScope("agent-codex")

// Direct command:
const session = await connectAcp(scope, {
  command: "npx",
  args: ["-y", "@zed-industries/codex-acp"],
  cwd: process.cwd(),
  clientCapabilities: { fs: { readTextFile: true, writeTextFile: true } },
  fsHandler: {
    async readTextFile({ path }) {
      return { content: await Bun.file(path).text() }
    },
    async writeTextFile({ path, content }) {
      await Bun.write(path, content)
      return {}
    },
  },
  permissionHandler: async (req) => {
    const choice = await ui.askPermission(req)
    return choice ? { outcome: { outcome: "selected", optionId: choice.id } } : { outcome: { outcome: "cancelled" } }
  },
})

// Or via the registry (same effect for known agents):
const session = await connectAcpRegistry(scope, "codex", { cwd: process.cwd() })

// Use the legacy AgentSession surface:
session.subscribe((e) => console.log(e.kind, e))

// Or call the typed ACP wrappers directly:
const result = await session.prompt([{ type: "text", text: "fix the failing test" }])
console.log(result.stopReason)
```

Disposing the scope kills the child process, closes the JSON-RPC stream, and
aborts in-flight prompts. **Do not call `connectAcp` outside a scope** — the
factory is fire-and-forget without one.

This client is for **external ACP servers**. Wrapping Claude Code (so it
speaks ACP) is a separate bead (`acp-adapter-claude`) — Claude's
subscription auth path is bespoke and doesn't ride the generic ACP wire.

## Tests

```bash
bun vitest run apps/silvercode/packages/agent-harness/                    # full suite
bun vitest run apps/silvercode/packages/agent-harness/tests/acp-boundary  # boundary only
```

The boundary test suite is the canonical example of "round-trip every variant" — copy its structure when adding new ACP-shaped types.
