# Multi-agent orchestration in silvercode

**Status:** v1, shipped 2026-04-26
**Bead:** `km-silvercode.acp-multi-agent`
**Reference:** [hub/silvercode/future/ai-terminal/10-agent-router-landscape.md](../../../hub/silvercode/future/ai-terminal/10-agent-router-landscape.md) § "Cross-agent cooperation"

## What this layer does

Silvercode runs **N parallel ACP sessions** (Claude Code, codex, pi, gemini)
in one host process. ACP defines the per-session conversation; it does NOT
define cross-session state, leadership, file claims, or handoffs. Silvercode
owns that layer.

Architectural rule: **agents don't talk to each other**. The host curates a
slice of cross-agent state and projects it into each agent's prompt as
ambient context. Agents mutate the state via `coordinator-mcp` tools.

## Layers

```
┌──────────────────────────────────────────────────────────────────┐
│ silvercode controller (one per host)                             │
│                                                                  │
│   CrossAgentState  (signal-backed)                               │
│     ├── claims:         FileClaim[]                              │
│     ├── handoffs:       Handoff[]                                │
│     ├── activeSessions: SessionInfo[]                            │
│     └── recentBroadcasts: TribeEvent[] (ring, cap 50)            │
│                                                                  │
│   ┌────────────────────┐   ┌────────────────────┐                │
│   │ session s1         │   │ session s2         │                │
│   │  coordinator-mcp   │   │  coordinator-mcp   │                │
│   │   (selfSessionId   │   │   (selfSessionId   │                │
│   │    = "s1")         │   │    = "s2")         │                │
│   │  prompt slice      │   │  prompt slice      │                │
│   │  (peer activity)   │   │  (peer activity)   │                │
│   └────────────────────┘   └────────────────────┘                │
└──────────────────────────────────────────────────────────────────┘
                                    │
                                    │ tribe-mcp (UDS)
                                    ▼
                          other silvercode hosts
```

`coordinator-mcp` is **per-session, in-process**. It holds a reference to
the controller's shared `CrossAgentState`. Mutating tools attribute the
mutation to the session's identity automatically — agents never spell
their own sessionId.

`tribe-mcp` (separate package, separate concern) carries cross-instance
peer messaging via the bearly tribe UDS bus. The two are complementary:
coordinator-mcp owns intra-host coordination state; tribe-mcp owns
inter-host messaging. When a tribe broadcast arrives, the controller
mirrors it into `recentBroadcasts` so the prompt-projection slice sees it.

## Tool surface

`apps/silvercode/src/coordinator-mcp.ts`:

| Tool                            | Mutating? | What it does                                        |
| ------------------------------- | --------- | --------------------------------------------------- |
| `coordinator_claim_file`        | yes       | Claim a path. Default exclusive.                    |
| `coordinator_release_file`      | yes       | Release own claim.                                  |
| `coordinator_handoff`           | yes       | Propose a handoff to another session.               |
| `coordinator_status`            | no        | Read own claims + peers on shared paths + handoffs. |
| `coordinator_active_sessions`   | no        | List live sessions.                                 |
| `coordinator_recent_broadcasts` | no        | Read recent peer activity.                          |

Mutating tools have `dangerous: true` and MUST be gated through ACP
`RequestPermission`. Read-only tools auto-approve.

## Conflict mediation

Policy: **first exclusive claim wins**. No automatic resolution.

```
s1: coordinator_claim_file({path: "/foo.ts"})        → { ok: true,  claim: ... }
s2: coordinator_claim_file({path: "/foo.ts"})        → { ok: false, conflictWith: "s1" }
```

When `ok: false`, the agent decides what to do:

- **Wait** — poll `coordinator_status` until `peerClaimsOnSharedPaths` no
  longer contains the path.
- **Handoff** — call `coordinator_handoff({to: conflictWith, content: ...})`
  to ask the holder to do the work.
- **Abandon** — pick a different file.

Advisory claims (`exclusive: false`) stack — multiple sessions may hold
advisory claims on the same path concurrently. They model "I might read
this; coordinate if you're going to write." Exclusive claims override
advisory ones (advisory holders are not blockers for an exclusive claim
attempt).

Re-claiming the same path from the same session is idempotent and does
not republish the signal — UI subscribers don't churn.

## Prompt projection

`apps/silvercode/src/prompt-cross-agent.ts` projects a slice of
`CrossAgentState` into each agent's prompt as a typed `EmbeddedResource`
ContentBlock with URI `coordinator://state/<sessionId>` and
`_meta.coordinator = true`.

Slice contents (peer-only by default):

- **Peer file claims** — paths held by other sessions, with exclusive flag.
- **Pending handoffs to you** — inbound proposals waiting for accept/reject.
- **Your pending handoffs** — outbound proposals not yet resolved.
- **Recent peer broadcasts** — last N events from the channel queue.

Body is markdown wrapped in the same `[AMBIENT — informational, do not act]`
framing the channel-queue ambient blocks use. Agents treat the slice as
context, not as instructions.

The slice is **opt-in**: callers pass `includeCrossAgent: true` to
`assembleAcpPromptWithCrossAgent`. Default off — single-session silvercode
invocations have nothing to project.

Ordering contract:

1. Cross-agent slice (most stable / curated)
2. Ambient channel-queue blocks (mid)
3. User text (always last)

## Wiring in the controller

`apps/silvercode/src/controller.ts` owns:

- One `CrossAgentState` shared across all spawned sessions
  (`controller.crossAgentState`).
- Each spawned session gets a `coordinator-mcp` instance bound to its
  identity (`SessionHandle.coordinatorMcp`).
- `addSession` / `removeSession` are called automatically by `spawnSession`
  / `closeAll` — UI panes never have to.
- `removeSession` releases all claims held by the gone session — peers see
  the path freed immediately.
- Channel-queue events fan out into `recordBroadcast` so the projection
  slice has visibility into recent peer activity even when individual
  sessions don't auto-drain the channel queue.
- Coarse session status (idle / thinking / ended) is mirrored from the
  per-session SessionStore so peers see "what is this session up to right
  now" without subscribing to per-session events.

## Transport note

Coordinator-mcp is **in-process by construction** — the server is a JS
object holding a reference to `state`. This avoids the grandchild-
subprocess shutdown drain documented in
[in-process-mcp.md](./in-process-mcp.md).

The agent-side wiring (how the spawned subprocess actually reaches an
in-process MCP server) is a separate transport concern. Track 2 (SDK)
already has `createSdkMcpServer`; Track 1 (subscription stdio) is
currently blocked on Anthropic adding a non-stdio transport for
`--mcp-config`. Until then, `createCoordinatorMcpServerSpec` returns
`{type: "in-process"}` so callers can mount it via the future transport
when it lands. Tests dispatch tool calls directly against the server's
`handle()` method.

## Future work

- **UI surfacing**: `<CrossAgentSidebar>` subscribes to
  `controller.crossAgentState.activeSessions` + `claims`. Visual polish in
  a follow-up component bead.
- **Conflict-resolution UX**: when `ok: false` is returned, surface a
  conflict toast with one-click "request handoff" / "wait" actions.
- **Track 2 SDK transport**: wire `createSdkMcpServer` around
  `coordinator-mcp` so agents on the SDK path can call coordinator tools
  in-process with no subprocess hop.
- **Handoff acceptance flow**: when a session accepts an inbound handoff,
  inject the handoff content into its next prompt automatically (today
  the agent must read it via `coordinator_status` and act on it).
