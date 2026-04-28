# `org.agentroom.*` event-type spec — initial sketch

**Status:** v0 sketch / brainstorm. Not a published spec yet. Captures the agent-vocabulary that an [ACP-to-Matrix gateway](./acp-proxy.md) would emit. Eventual destination: a Matrix Spec Change (MSC) submission.

**Tracking:** related to venture #11 in [`hub/ventures/acp-proxy-2026-04-27.md`](../../../ventures/acp-proxy-2026-04-27.md).

---

## Why this spec exists

Matrix (and other chat protocols) define generic message events (`m.room.message`, `m.text`). They don't define vocabulary for agent interactions: tool calls, streaming responses, content-block typing, plan-vs-reply phases, prompt vs response distinction, permission gating.

ACP defines these primitives as JSON-RPC methods, but JSON-RPC is point-to-point and Matrix is room-shaped. To represent ACP semantics inside a Matrix room we need custom event types — the `org.agentroom.*` namespace — that:

1. **Express agent interactions natively** in the room timeline (so multiple participants can see the agent thinking/acting/replying).
2. **Are well-typed** so clients can render appropriately (streaming responses ≠ static text; tool calls need confirm/deny UI; plan steps want collapse/expand).
3. **Are standards-track** so other ACP hosts adopt the same vocabulary instead of inventing parallel namespaces.

## Naming convention

All custom events use the reverse-DNS-style namespace `org.agentroom.*`. Sub-namespaces:

**Wire / message layer (1:1 + multi-agent foundation):**

- `org.agentroom.session.*` — session lifecycle (start, end, resume)
- `org.agentroom.agent.*` — agent participation (join, leave, capability change)
- `org.agentroom.prompt.*` — user-initiated requests
- `org.agentroom.response.*` — agent text replies (streaming + final)
- `org.agentroom.tool.*` — tool calls and results
- `org.agentroom.plan.*` — per-agent plan announcements (see also `todo.*` for room-scoped shared todos)
- `org.agentroom.content.*` — typed content blocks (text, code, diff, image)
- `org.agentroom.permission.*` — permission requests and decisions

**Agent-in-the-middle layer (proxy-hosted sub-agents):**

- `org.agentroom.subagent.*` — recall-thought, critic, style-watcher, test-runner, doc-keeper sub-agent emissions

**Coordination layer (shared room state across agents):**

- `org.agentroom.todo.*` — room-scoped shared todo state (create, claim, update, complete, dependency)
- `org.agentroom.lock.*` — soft and hard locks on resources
- `org.agentroom.decision.*` — recorded decisions inherited by future sessions
- `org.agentroom.finding.*` — knowledge accumulated during work
- `org.agentroom.handoff.*` — explicit handoff between agents or to humans

## Multi-agent semantics — N agents in one session

ACP itself is strictly 1:1 (one client ↔ one agent over one stdio pair). The protocol has no concept of session participants or multi-agent routing. **Multi-agent is a room/session-substrate feature, not an ACP feature.**

The substrate (Matrix room or km JSONL session) maintains:

- **Participant list** — current agents in the session, joined via `org.agentroom.agent.join`.
- **`agent_id` on every agent-emitted event** — `response.*`, `tool.call/result`, `plan.step`, `content.block` all carry `agent_id` so consumers can attribute messages.
- **Routing policy** — when a `prompt.user` arrives, the room manager decides: broadcast to all agents, target one (`prompt_to: agent_id`), or classifier-route. Routing policy is per-room, configured in room state.
- **Per-agent ACP wire session** — the room manager opens a separate 1:1 ACP wire session with each agent and feeds them context (replay of recent room events as agent input).

This means: **every agent sees every other agent's contributions via room replay**, but the underlying ACP transport stays 1:1 unchanged. Multi-agent is purely additive at the room layer.

## Core event types (v0)

### `org.agentroom.session.start`

Marks the beginning of a session in a room. Sent by the room manager / gateway when a session is created. The session can later host multiple agents — see `org.agentroom.agent.join`.

```json
{
  "type": "org.agentroom.session.start",
  "content": {
    "session_id": "acp-session-uuid",
    "client_id": "@silvercode:matrix.example",
    "routing_policy": "broadcast",
    "format_version": "v0"
  }
}
```

`routing_policy`: `broadcast` (every prompt goes to every agent), `target` (each prompt names a target agent via `prompt_to`), `classifier` (room-defined classifier picks one agent per prompt).

### `org.agentroom.agent.join`

An agent joins the session. Emitted when the room manager spawns a new agent ACP wire session.

```json
{
  "type": "org.agentroom.agent.join",
  "content": {
    "session_id": "acp-session-uuid",
    "agent_id": "@codex-acp:gateway.example",
    "capabilities": ["streaming", "tool_calls", "content_blocks", "plans"],
    "model": "claude-opus-4-7",
    "joined_by": "@user:matrix.example"
  }
}
```

Multiple `agent.join` events can occur in a session — that's how N agents end up in one room.

### `org.agentroom.agent.leave`

An agent leaves the session (removed by user, errored out, or auto-evicted on idle).

```json
{
  "type": "org.agentroom.agent.leave",
  "content": {
    "session_id": "acp-session-uuid",
    "agent_id": "@codex-acp:gateway.example",
    "reason": "user_removed",
    "duration_ms": 187420
  }
}
```

### `org.agentroom.prompt.user`

A user prompt sent to one or more agents. Wraps the underlying `m.room.message` so chat clients without ACP awareness still render it as text.

```json
{
  "type": "org.agentroom.prompt.user",
  "content": {
    "msgtype": "m.text",
    "body": "Refactor the function `extractBody` to use early returns.",
    "session_id": "acp-session-uuid",
    "prompt_id": "prompt-uuid",
    "prompt_to": null
  }
}
```

`prompt_to` is the multi-agent routing field. Values:
- `null` (or absent) — use the session's `routing_policy` (broadcast / classifier).
- `"@codex-acp:gateway.example"` — target a specific agent.
- `["@codex-acp:gateway.example", "@claude-acp:gateway.example"]` — target a subset.

### `org.agentroom.response.streaming`

A streaming chunk of an agent's response. Sent as `m.replace` edits to a parent placeholder message so traditional clients see the final text and ACP-aware clients see incremental updates. **`agent_id` identifies which agent emitted the chunk** — load-bearing for multi-agent rooms.

```json
{
  "type": "org.agentroom.response.streaming",
  "content": {
    "session_id": "acp-session-uuid",
    "agent_id": "@claude-acp:gateway.example",
    "prompt_id": "prompt-uuid",
    "response_id": "response-uuid",
    "chunk_index": 12,
    "delta": " — early returns reduce nesting depth from 4 to 2.",
    "final": false,
    "m.relates_to": {
      "rel_type": "m.replace",
      "event_id": "$placeholder-event-id"
    }
  }
}
```

### `org.agentroom.response.final`

The terminal chunk of a response. Equivalent to `streaming` with `final: true` but emitted as a separate event so timeline scanners can find boundaries cheaply.

### `org.agentroom.tool.call`

An agent requests a tool call. ACP-aware clients render this as a confirm/deny prompt; traditional clients see a notice. `agent_id` identifies the requesting agent in multi-agent rooms.

```json
{
  "type": "org.agentroom.tool.call",
  "content": {
    "session_id": "acp-session-uuid",
    "agent_id": "@claude-acp:gateway.example",
    "prompt_id": "prompt-uuid",
    "call_id": "call-uuid",
    "tool_name": "fs.write",
    "args": {
      "path": "/tmp/refactored.ts",
      "content": "..."
    },
    "permission_required": "writes"
  }
}
```

### `org.agentroom.tool.result`

The result of a completed tool call. Sent as a thread reply to the original `tool.call` event so clients can group them.

```json
{
  "type": "org.agentroom.tool.result",
  "content": {
    "session_id": "acp-session-uuid",
    "call_id": "call-uuid",
    "status": "ok",
    "result": { "bytes_written": 1042 },
    "duration_ms": 23,
    "m.relates_to": {
      "rel_type": "m.thread",
      "event_id": "$tool-call-event-id"
    }
  }
}
```

### `org.agentroom.plan.step`

An agent announces a step in its plan. Useful for "thinking out loud" phases that aren't yet committed actions. ACP-aware clients render as collapsible plan items. `agent_id` identifies the planning agent.

```json
{
  "type": "org.agentroom.plan.step",
  "content": {
    "session_id": "acp-session-uuid",
    "agent_id": "@claude-acp:gateway.example",
    "prompt_id": "prompt-uuid",
    "step_index": 3,
    "summary": "Read extractBody from packages/km-tree/src/util.ts",
    "rationale": "Need to see current implementation before refactoring."
  }
}
```

### `org.agentroom.content.block`

A typed content block — code, diff, image, plan-tree, etc. — emitted alongside text. Clients can render specially based on `block_type`. `agent_id` identifies the emitting agent.

```json
{
  "type": "org.agentroom.content.block",
  "content": {
    "session_id": "acp-session-uuid",
    "agent_id": "@claude-acp:gateway.example",
    "response_id": "response-uuid",
    "block_id": "block-uuid",
    "block_type": "code.diff",
    "language": "typescript",
    "body": "@@ -10,5 +10,3 @@\n  function extractBody(...) {\n-   if (...) { ... } else { ... }\n+   ...\n  }",
    "title": "Proposed change to extractBody"
  }
}
```

`block_type` values include:
- `text` — plain text (default if omitted)
- `code` — code with `language` field
- `code.diff` — unified diff
- `image` — `mxc://` reference
- `plan` — structured plan tree
- `error` — error message with stack
- `metadata` — internal/debug info, hidden from non-ACP clients

### `org.agentroom.permission.request`

The agent (via the gateway) requests permission for something the room policy doesn't auto-approve. Renders as an accept/deny UI.

```json
{
  "type": "org.agentroom.permission.request",
  "content": {
    "session_id": "acp-session-uuid",
    "request_id": "perm-uuid",
    "scope": "writes",
    "context": "Tool call fs.write to /tmp/refactored.ts",
    "expires_at": "2026-04-27T22:00:00Z"
  }
}
```

### `org.agentroom.permission.decision`

A user's decision on a permission request. Sent as a thread reply to the request.

```json
{
  "type": "org.agentroom.permission.decision",
  "content": {
    "request_id": "perm-uuid",
    "decision": "allow",
    "decided_by": "@user:matrix.example",
    "scope_granted": "writes",
    "expires_at": "2026-04-27T23:00:00Z",
    "m.relates_to": {
      "rel_type": "m.thread",
      "event_id": "$permission-request-event-id"
    }
  }
}
```

### `org.agentroom.session.end`

The session terminates (clean exit, error, timeout). Includes summary stats useful for observability.

```json
{
  "type": "org.agentroom.session.end",
  "content": {
    "session_id": "acp-session-uuid",
    "reason": "user_closed",
    "duration_ms": 187420,
    "prompt_count": 14,
    "tool_call_count": 27,
    "tokens_input": 18452,
    "tokens_output": 4391,
    "cost_usd": 0.4271
  }
}
```

## Sub-agent events (agent-in-the-middle layer)

The proxy hosts persistent in-session sub-agents (recall-thought, critic, style-watcher, test-runner, doc-keeper) that emit observations into the room without being foreground agents. These events make the sub-agent's activity transparent to humans and other agents.

### `org.agentroom.subagent.thought`

A sub-agent surfaces an insight unprompted (e.g., recall-thought notices a thematic match with a past session).

```json
{
  "type": "org.agentroom.subagent.thought",
  "content": {
    "session_id": "acp-session-uuid",
    "subagent_id": "recall-thought:default",
    "subagent_kind": "memory",
    "thought_id": "thought-uuid",
    "title": "Similar refactor in last month's session",
    "body": "When you refactored `parseTokens` 27 days ago, you used the same early-return pattern...",
    "confidence": 0.78,
    "references": [{"session_id": "old-session-uuid", "summary": "parseTokens refactor"}]
  }
}
```

### `org.agentroom.subagent.delta`

A sub-agent injects a context delta into a foreground agent's prompt. Visible to humans for transparency (they see what's being added to the agent's context).

```json
{
  "type": "org.agentroom.subagent.delta",
  "content": {
    "session_id": "acp-session-uuid",
    "subagent_id": "recall-thought:default",
    "target_agent_id": "@claude-acp:gateway.example",
    "delta_kind": "context_inject",
    "body": "[recall-thought]: extractBody is also called from packages/km-render/src/columns.ts:142",
    "size_tokens": 18,
    "rationale": "Foreground agent didn't grep all call sites"
  }
}
```

### `org.agentroom.subagent.alert`

A sub-agent flags a concern (critic mode warning, style violation, failing test, etc.).

```json
{
  "type": "org.agentroom.subagent.alert",
  "content": {
    "session_id": "acp-session-uuid",
    "subagent_id": "critic:default",
    "subagent_kind": "critic",
    "alert_id": "alert-uuid",
    "severity": "warning",
    "title": "Plan looks risky",
    "body": "The plan to delete the migration runner skips the verification step. In 3 prior cases, this caused data loss.",
    "suggested_action": "Add an explicit pre-check before deletion."
  }
}
```

### `org.agentroom.subagent.metric`

Periodic sub-agent state report (cache size, knowledge entries active, etc.). Mostly for observability.

```json
{
  "type": "org.agentroom.subagent.metric",
  "content": {
    "session_id": "acp-session-uuid",
    "subagent_id": "recall-thought:default",
    "metric_kind": "state_summary",
    "values": {
      "cache_tokens": 47830,
      "knowledge_entries_active": 142,
      "thoughts_emitted": 7,
      "deltas_injected": 3
    }
  }
}
```

## Coordination events (shared room state)

Room-scoped state shared across all agents. Mutations are atomic at the gateway; events are append-only on the wire/log.

### `org.agentroom.todo.create`

Create a new todo item in the room. Items live as KNodes under the room node (markdown `[ ]` items).

```json
{
  "type": "org.agentroom.todo.create",
  "content": {
    "session_id": "acp-session-uuid",
    "todo_id": "todo-uuid",
    "title": "Refactor extractBody to use early returns",
    "priority": "high",
    "status": "pending",
    "created_by": "@user:matrix.example",
    "depends_on": [],
    "knode_path": "rooms/refactor-extractbody/todos/01"
  }
}
```

### `org.agentroom.todo.claim`

An agent (or human) atomically claims a todo. Gateway rejects duplicate claims; first writer wins.

```json
{
  "type": "org.agentroom.todo.claim",
  "content": {
    "todo_id": "todo-uuid",
    "claimed_by": "@claude-acp:gateway.example",
    "claim_token": "atomic-claim-uuid",
    "estimated_duration_s": 600
  }
}
```

### `org.agentroom.todo.update`

Status / priority / progress updates on a claimed todo.

```json
{
  "type": "org.agentroom.todo.update",
  "content": {
    "todo_id": "todo-uuid",
    "updated_by": "@claude-acp:gateway.example",
    "status": "in_progress",
    "progress_pct": 30,
    "note": "Identified all 7 call sites; rewriting first 3"
  }
}
```

### `org.agentroom.todo.complete`

Mark a todo as done; release any associated locks.

```json
{
  "type": "org.agentroom.todo.complete",
  "content": {
    "todo_id": "todo-uuid",
    "completed_by": "@claude-acp:gateway.example",
    "outcome": "ok",
    "summary": "Refactored extractBody; all tests pass; PR #4231",
    "duration_s": 542
  }
}
```

### `org.agentroom.lock.acquire`

Soft (advisory) or hard (enforced) lock on a resource. Hard locks rejected by gateway if conflict.

```json
{
  "type": "org.agentroom.lock.acquire",
  "content": {
    "lock_id": "lock-uuid",
    "resource": "file:src/util/extractBody.ts",
    "lock_kind": "soft",
    "acquired_by": "@claude-acp:gateway.example",
    "rationale": "Refactoring; please don't edit",
    "expires_at": "2026-04-27T23:00:00Z"
  }
}
```

### `org.agentroom.lock.release`

Release a previously-acquired lock. Auto-released on agent disconnect or expiry.

```json
{
  "type": "org.agentroom.lock.release",
  "content": {
    "lock_id": "lock-uuid",
    "released_by": "@claude-acp:gateway.example",
    "reason": "completed"
  }
}
```

### `org.agentroom.decision.record`

Record a decision inherited by future sessions. Materializes as a `#decision`-tagged sub-node under the room KNode.

```json
{
  "type": "org.agentroom.decision.record",
  "content": {
    "decision_id": "decision-uuid",
    "title": "Use early returns in extractBody",
    "rationale": "Reduces nesting from 4 to 2; matches codebase convention in 11 of 14 similar functions",
    "decided_by": ["@user:matrix.example", "@claude-acp:gateway.example"],
    "alternatives_considered": ["Guard clauses + named returns", "Restructure as iterator"],
    "knode_path": "rooms/refactor-extractbody/decisions/01"
  }
}
```

### `org.agentroom.finding.share`

Knowledge accumulated during work. Materializes as a `#finding`-tagged sub-node, indexed by FTS5 for cross-room search.

```json
{
  "type": "org.agentroom.finding.share",
  "content": {
    "finding_id": "finding-uuid",
    "shared_by": "@claude-acp:gateway.example",
    "title": "extractBody is called from 7 sites",
    "body": "Sites: packages/km-render/src/columns.ts:142, ...",
    "tags": ["call-graph", "refactoring-prep"],
    "confidence": 1.0,
    "knode_path": "rooms/refactor-extractbody/findings/01"
  }
}
```

### `org.agentroom.handoff`

Explicit handoff from one agent (or human) to another. Often follows `todo.complete` to signal "your turn."

```json
{
  "type": "org.agentroom.handoff",
  "content": {
    "handoff_id": "handoff-uuid",
    "from": "@claude-acp:gateway.example",
    "to": "@codex-acp:gateway.example",
    "context": "Refactor done; please write integration tests",
    "related_todo_id": "todo-uuid",
    "related_findings": ["finding-uuid"]
  }
}
```

## Power levels (governance)

Matrix's existing power-level mechanism gates who can emit which event types. We propose:

| Power level | Default | Permitted |
|---|---|---|
| 0 (default member) | view all events | none of `org.agentroom.*` |
| 50 (moderator) | view all | emit `org.agentroom.permission.decision` for own requests |
| 75 (operator) | view all | emit any `org.agentroom.*` event; configure room policies |
| 100 (admin) | view all | full control including agent invitation/eviction |

Agent service accounts run at PL 50 (moderator) — high enough to emit prompts on behalf of agents, low enough that humans retain final authority.

## Backward compatibility

Every `org.agentroom.*` event MUST also be representable as a fallback `m.room.message` event with `msgtype: m.notice` (or `m.text` for prompts/responses). This means:

- Element/Cinny/etc. without ACP awareness see a degraded but functional conversation.
- Bridges (matrix-appservice-slack etc.) propagate the fallback message to other channels.
- The richer ACP-aware UI is purely additive.

The fallback content lives in standard `body` / `formatted_body` fields. ACP-aware clients prefer the typed `org.agentroom.*` content; non-aware clients use the fallback.

## Versioning

The spec ships at `org.agentroom.v1.*`. Breaking changes go to `org.agentroom.v2.*` etc. Within a version, additive changes are permitted; field removals require a version bump.

The gateway negotiates version at session start via the `capabilities` field on `org.agentroom.session.start`. ACP itself is also evolving — the gateway is responsible for translation between ACP wire-protocol versions and event-type versions.

## Path to standardization

1. **Ship the gateway** (venture #11 v1) emitting `org.agentroom.v0.*` events. v0 = "we reserve the right to change this; not yet stable."
2. **Iterate the spec from real wire bytes** — every gap discovered while building real session-room mappings updates this doc.
3. **Bump to v1** when the schema is stable across 3+ months of production gateway use.
4. **Open-source the spec** at `github.com/beorn/acp-event-spec` (or similar). Decoupled from the gateway implementation so other vendors can adopt without a runtime dependency.
5. **Submit MSC** to matrix.org's governance process. See [matrix-spec-proposals](https://github.com/matrix-org/matrix-spec-proposals) for the process. Realistic timeline: 6-12 months from MSC submission to inclusion in the Matrix spec.
6. **Encourage ecosystem adoption**. Reach out to Zed (ACP authors), Continue.dev (open-source coding host), Element (Matrix's flagship client) — propose joint editorship on the MSC. Joint editorship is what made MCP successful (Anthropic + Microsoft + others co-developed it).

## JSONL persistence (km vault)

The same `org.agentroom.*` event vocabulary serves as the canonical on-disk session format. ACP itself doesn't standardize a session format (each agent does its own thing — claude-code's per-session `.jsonl`, codex-acp's CLI store, etc.). km can fill that gap by persisting `org.agentroom.*` events as JSONL.

### Layout

```
~vault/chats/<room-slug>/
  session.jsonl       ← one event per line, append-only, source of truth
  session.md          ← rendered markdown view (bidirectional, like km's other docs)
  attachments/        ← referenced binaries (uploaded files, generated diffs, images)
```

### Format

Each `.jsonl` line is a single `org.agentroom.*` event with two outer fields:

```jsonl
{"ts":"2026-04-27T22:14:03.182Z","event":{"type":"org.agentroom.prompt.user","content":{...}}}
```

- `ts` — ISO-8601 timestamp; used for ordering when no Matrix `origin_server_ts` exists.
- `event` — the same envelope as the Matrix event (with `type` + `content`).

### Equivalence to Matrix

The JSONL event content is byte-identical to the Matrix event content. The only difference is the outer envelope (Matrix wraps with room/sender/event_id metadata; JSONL uses `ts` + `event`). A tiny adapter converts between the two:

```typescript
// Matrix → JSONL
const jsonlLine = { ts: matrixEvent.origin_server_ts, event: { type: matrixEvent.type, content: matrixEvent.content } }

// JSONL → Matrix
const matrixEvent = { type: jsonlLine.event.type, content: jsonlLine.event.content, /* + sender/event_id at publish time */ }
```

### Implications

- **Cross-transport portability** — `tail -f session.jsonl | gateway-publish-to-matrix-room` ↔ `gateway-listen-on-matrix-room | append-to-jsonl`. The session is replayable in either direction.
- **Cross-agent portability** — replay JSONL against any agent's ACP session as initial context. Switching from Claude → Codex mid-session is purely a re-feed operation.
- **Markdown round-trip** — `session.md` is the human view (one chat room → one renderable file in the vault). km's existing markdown ↔ tree pipeline extends naturally: edit `.md` → events appear in `.jsonl`; events arrive in `.jsonl` → `.md` re-renders.
- **Import from existing agents** — Claude Code's `~/.claude/projects/<proj>/<session-id>.jsonl` is *almost* this format. A small adapter lets km consume an entire existing Claude history as historical chat rooms.

### Storage size + rotation

JSONL is append-only and grows linearly with conversation length. For long sessions:

- Default: keep entire session in one file. Long-running sessions might hit ~MB scale; still trivially fast to read.
- Rotation: when a `session.jsonl` exceeds N MB, archive to `session-<ISO-date>.jsonl` and start fresh, with a `org.agentroom.session.continue` event linking back. (Implementation detail, not v0 scope.)

## Open questions

- **`org.agentroom.*` vs vendor-prefixed**? `org.beorn.acp.*` would be more humble but less likely to be adopted as a community standard. The `org.agentroom.*` namespace asserts community ownership from day 0; we'd register it through whoever owns the ACP protocol identity (Zed Industries).
- **Encryption** — within an E2E-encrypted room, custom event types are encrypted by default in Matrix. Good. But ACP-aware clients need to decrypt + render typed content; we'd need to verify Element's encrypted-event-type rendering works for `org.agentroom.*`. JSONL on-disk encryption is separate (vault-level, not event-level).
- **Cross-client rendering** — what does Cinny render when it sees `org.agentroom.tool.call`? Probably the fallback. We'd need to write a small Cinny/Element widget that adds ACP-awareness as a plugin (Element supports widgets).
- **Tool result schema** — should `result` be opaque JSON or have a typed schema per tool? Probably opaque v1, typed-schema v2 once we have a tool registry.
- **Conflict resolution in multi-agent rooms** — two agents both want to call `fs.write` on the same path. Spec doesn't currently say. Probably: room manager serializes; second tool call is queued or rejected. v1 territory.

## References

- [Matrix Specification](https://spec.matrix.org/)
- [Matrix Spec Change process (MSC)](https://github.com/matrix-org/matrix-spec-proposals)
- [Custom event types](https://spec.matrix.org/v1.11/client-server-api/#types-of-room-events)
- [`hub/silvercode/future/ai-terminal/acp-proxy.md`](./acp-proxy.md) — the larger gateway / proxy strategy
- [`hub/ventures/acp-proxy-2026-04-27.md`](../../../ventures/acp-proxy-2026-04-27.md) — venture #11 + spec-authorship moat analysis
- [MCP (Model Context Protocol)](https://github.com/modelcontextprotocol) — the analogous Anthropic-authored standard for tool calls
- [Anthropic Computer Use](https://www.anthropic.com/news/3-5-models-and-computer-use) — agent capability standardization precedent
