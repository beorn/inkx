---
mentions:
  - km
---

# @km/tribe-mcp

MCP server exposing tribe's cross-session messaging bus as agent-callable
typed tools. Mounted by silvercode in every spawned ACP session so the
agent inside can talk to peer sessions, discover them, claim leadership,
and read history.

This is the agent-facing wrapper. The tribe **transport** (UDS or JSONL)
is owned by silvercode/bearly; this package just maps tribe operations
onto MCP tools and adds permission gating.

## Pattern

Modelled on OpenClaw's `sessions_send` / `sessions_list` /
`sessions_history` tools, with the same per-tool scope policy and
"dangerous tool" permission gate. See
[`hub/silvercode/future/ai-terminal/10-agent-router-landscape.md`][router]
§ "How OpenClaw does it" for the full mapping.

## Tools

| Tool                | Mutating? | Description                                               |
| ------------------- | --------- | --------------------------------------------------------- |
| tribe_send          | dangerous | Direct message to a known peer.                           |
| tribe_broadcast     | dangerous | Broadcast to all peers in scope.                          |
| tribe_join          | dangerous | Register the current session as a tribe peer.             |
| tribe_claim_chief   | dangerous | Attempt to take the chief role (leader-election).         |
| tribe_release_chief | dangerous | Release the chief role if held.                           |
| tribe_members       | read-only | List peers visible at the chosen scope (with isChief).    |
| tribe_history       | read-only | Recent messages, filterable by from, to, contains, since. |

Every tool definition carries an explicit `dangerous: boolean` field. The
host (silvercode acp-client) MUST trigger ACP `RequestPermission` before
dispatching any tool with `dangerous: true`. Read-only tools auto-approve.

The actual permission flow lives in acp-client, not here — this package
just declares which tools are dangerous so the host knows what to gate.

## Scope policy

Every tool accepts an optional `scope` argument:

| Scope | Reach                                                             |
| ----- | ----------------------------------------------------------------- |
| self  | Only the calling session.                                         |
| tree  | Calling session + parent + descendants + siblings (default).      |
| agent | All sessions sharing the same agentId (e.g. all Claude sessions). |
| all   | Any tribe peer.                                                   |

Default is `tree`, mirroring OpenClaw. Override per-call via the `scope`
argument or per-server via the `TRIBE_SCOPE` env var. Sends to peers
outside scope are rejected with an `out of scope` error.

## Mounting in silvercode

Spawned per-session by the agent harness. silvercode passes the binary in
`session/new { mcpServers }`:

```jsonc
{
  "name": "tribe",
  "command": "bun",
  "args": ["run", "<path>/tribe-mcp/src/bin.ts"],
  "env": {
    "TRIBE_SESSION_NAME": "<session-id>",
    "TRIBE_AGENT_ID": "claude",
    "TRIBE_PARENT": "<parent-session-id>",
    "TRIBE_SCOPE": "tree",
  },
}
```

The harness wires identity via env so the binary needs no flags. See
`apps/silvercode/packages/agent-harness/src/spawn.ts` for the integration
point.

## Backends

Selected via `TRIBE_BACKEND`:

- `jsonl` (default) — file-backed bus at `TRIBE_BUS_PATH`
  (default `~/.km/tribe-bus.jsonl`) with sibling `tribe-state.json` for
  chief and peer registry. Cross-process via filesystem; works without a
  daemon. Used when all sessions are siblings under the same silvercode
  host.
- `daemon` — bearly tribe over UDS. Hook only — not implemented yet.

## What this package does NOT do

Subscription to incoming tribe events for UI surfacing is a silvercode-app
concern (see bead `km-silvercode.acp-channels`). silvercode subscribes
directly to the tribe bus to populate `crossAgentState$` and inject
broadcasts into agent prompts; this package only exposes the
**outbound**/active query surface to the agent itself.

## Tests

```bash
bun vitest run apps/silvercode/packages/tribe-mcp/tests/
```

`tools.test.ts` covers the JSON-RPC surface, dangerous-flag invariants,
scope filtering, history filter + pagination, chief leadership, and
JSONL backend persistence across restarts.
