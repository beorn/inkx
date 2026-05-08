# ACP wrapper and client-host runtime reference

**Status**: internal hub reference draft. Snapshot 2026-05-08. This is research capture and architecture framing, not an accepted `/arch` decision and not public documentation.

**Scope**: Claude/Codex wrappers, ACP client hosts, prompt queueing, streaming block marshalling, turns, plans/steps/tasks, backgrounding, subagents, and the gap from silvercode's current runtime to a referencable L5 architecture.

**Primary local scope**: `apps/silvercode`, especially `src/controller.ts`, `packages/agent-harness/src/acp-client.ts`, `packages/agent-harness/src/acp-session.ts`, `packages/agent-harness/src/session-reducer.ts`, and the `src/chat/*` projection layer.

---

## Executive summary

The strongest reference shape is a **per-session owner/actor** that is the only component allowed to talk to the provider process. The UI edits drafts and submits typed requests. The actor owns prompt queueing, active request lifecycle, cancellation, permission routing, mode/config updates, background jobs, and child sessions. The transcript and UI status are projections, not the control plane.

silvercode currently has several good pieces:

- ACP types and a boundary module.
- A reducer with provider-neutral plan entries and statuses.
- Tool-call status rendering and tests.
- ACP client turn lifecycle guards and late-update drain behavior.
- Subagent notifications from Claude Task/Agent tool events.

The main weakness is that the runtime gate is still inferred from controller-level status and ack heuristics. Queue state is a string buffer. ACP `prompt()` can return a result, but the controller still primarily treats sending as fire-and-forget. Backgrounding is intentionally disabled because the previous implementation keyed by assistant/turn ids, which are not stable provider job ids.

The L5 target is:

```
UI draft/editor
  -> SessionActor.enqueuePrompt(...)
  -> ProviderDriver.prompt(...)
  -> raw protocol stream
  -> runtime event log
  -> rebuildable projections
```

Every accepted prompt, plan, tool call, permission request, background job, and child agent run needs an ID, an owner, a state machine, a terminal outcome, and replayable evidence.

---

## Source map

### External references

- [ACP official overview](https://agentclientprotocol.com/protocol/overview)
- [ACP prompt turn lifecycle](https://agentclientprotocol.com/protocol/prompt-turn)
- [ACP agent plan](https://agentclientprotocol.com/protocol/agent-plan)
- [ACP tool calls](https://agentclientprotocol.com/protocol/tool-calls)
- [ACPX](https://github.com/openclaw/acpx)
- [Agent Shell](https://github.com/xenodium/agent-shell)
- [acp-plugin](https://github.com/strato-space/acp-plugin)
- [Claude Agent ACP](https://github.com/agentclientprotocol/claude-agent-acp)
- [Codex ACP](https://github.com/zed-industries/codex-acp)
- [OpenClaw](https://github.com/openclaw/openclaw)
- [Agent Client Protocol clients list](https://agentclientprotocol.com/get-started/clients)
- [Zed ACP page](https://zed.dev/acp)
- [OpenACP product/repo context](https://openacp.ai/), [OpenACP repo](https://github.com/openacpai/openacp)

### Local silvercode references

- `apps/silvercode/src/controller.ts`:
  - prompt queue, outbound ack gate, background job storage, disabled backgrounding, interrupt behavior, subagent notification wiring.
- `apps/silvercode/packages/agent-harness/src/acp-client.ts`:
  - ACP process client, JSON-RPC mapping, `prompt(content)`, legacy `send(text)`, turn lifecycle wrapper, late update handling.
- `apps/silvercode/packages/agent-harness/src/acp-types.ts`:
  - local ACP type mirror.
- `apps/silvercode/packages/agent-harness/src/acp-boundary.ts`:
  - only direct SDK boundary.
- `apps/silvercode/packages/agent-harness/src/acp-session.ts`:
  - ACP-shaped reactive session facade over legacy `AgentEvent`.
- `apps/silvercode/packages/agent-harness/src/session-reducer.ts`:
  - canonical legacy session state, tool calls, plans/todos, status transitions.
- `apps/silvercode/src/chat/*`:
  - chat-domain normalization, event store, projection leaves.
- `apps/silvercode/src/notification-adapters/subagent.ts`:
  - Claude Task/Agent tool-use/result to notification events.
- `apps/silvercode/src/claude-subagent-sessions.ts`:
  - file-based discovery of Claude Code subagent transcripts.

---

## Vocabulary

**Agent**: the model/tool loop doing work.

**Wrapper / adapter**: a subprocess or library that exposes one agent through ACP or silvercode's legacy `AgentSession` interface. Examples: `claude-agent-acp`, `codex-acp`, `@km/claude-acp`.

**Client host**: the UI/runtime that launches or connects to wrappers. Examples: silvercode, Agent Shell, acp-plugin, Zed.

**Session**: long-lived conversation container. Keep distinct IDs:

- `localSessionId`: silvercode's UI/session key.
- `acpSessionId`: ACP session id from `session/new` or `session/load`.
- `providerSessionId`: Claude/Codex native id when available.

**Request**: one accepted prompt submission to a provider. It has a `requestId` whether or not the provider has a durable turn concept.

**Turn**: ACP uses "prompt turn" as the request-response lifecycle around `session/prompt`. It is not a globally durable transcript entity. In silvercode, `TurnId` is currently a presentation/provenance id, not a cross-provider contract.

**Run / job / task**: detached or background work. A background job must not be keyed only by transcript message or assistant turn id. It needs a `jobId` or `runId`, plus source request/session/child-session provenance.

**Plan**: current snapshot of an agent's intended steps. ACP requires complete replacement on every plan update.

**Step / plan entry**: one plan item with status. ACP status set is `pending | in_progress | completed`; silvercode currently also permits `cancelled`.

**Tool call**: provider-reported work unit, keyed by `toolCallId`, with status `pending | in_progress | completed | failed`.

**Permission request**: client-mediated user decision for a tool call. Must be request-scoped and cancelled on prompt cancellation.

---

## ACP protocol facts that matter

ACP is JSON-RPC over stdio for coding-agent client/agent integration. A typical session:

1. `initialize`
2. `session/new` or `session/load`
3. `session/prompt`
4. `session/update` notifications while the prompt is active
5. `session/prompt` response with `stopReason`

The prompt response is the authoritative terminal signal for the prompt turn. Notifications are progress; they are not themselves the final result.

ACP `session/update` includes:

- `agent_message_chunk`
- `agent_thought_chunk`
- `user_message_chunk`
- `tool_call`
- `tool_call_update`
- `plan`
- `available_commands_update`
- `current_mode_update`
- config / usage / session info updates depending on SDK version and extensions

ACP plans are full snapshots. A plan update replaces the current plan completely, and every entry carries `content`, `priority`, and `status`.

ACP tool calls are incremental. `tool_call` creates or starts the tool state, `tool_call_update` patches it. Updates may include status, content blocks, diffs, locations, raw input/output, or terminal references.

Cancellation has two obligations:

- Client sends `session/cancel`.
- Client marks non-finished tool calls as cancelled locally and resolves pending permission requests with cancelled outcome.

The agent may still send updates after cancel, but those updates should be accepted until the prompt response resolves as `cancelled`.

---

## Backend study notes

### ACPX

ACPX is the best reference for runtime architecture.

Important ideas:

- A per-session owner process owns the ACP client.
- Thin callers submit requests to the owner over IPC.
- The owner serializes prompt access and owns cancel/mode/config controls.
- It distinguishes raw ACP transcript, local reliability state, and derived session state.
- It records raw JSON-RPC messages as the authoritative protocol ledger.
- `session.json` is a derived checkpoint/index, not a second event protocol.
- Request lifecycle returns an event stream plus a result promise.
- The runtime drains late updates after prompt success.
- Conformance cases cover structured prompt blocks, background prompt/await, and post-success drain.

Steal this:

- `SessionOwner` / actor per session.
- Request handles with `events`, `result`, `cancel`.
- Separate raw ACP ledger from runtime/control ledger.
- Conformance suite for prompt, cancel, late update, structured content, and background cases.

Avoid:

- Treating CLI output format as the internal model. ACPX has human/json/quiet output layers, but the runtime model underneath is the important part.

### Agent Shell

Agent Shell is the best reference for editor/TUI host behavior.

Important ideas:

- Bootstraps initialize/auth/session/mode/model before prompt-ready.
- Renders ACP block families directly: agent text, thought chunks, tool calls/updates, plans, mode/config, usage.
- Logs ACP traffic and supports replaying traffic files.
- Builds prompt content blocks from editor mentions:
  - images become image blocks,
  - small files become resource blocks,
  - unavailable/large files become resource links,
  - plain user text stays text.
- Stale updates that do not match active request context are logged, not rendered as live output.
- Adjacent message chunks are grouped for display, but grouping is a projection.

Steal this:

- Traffic log viewer/replay as a first-class debug tool.
- Block-aware prompt construction.
- Stale/out-of-context update quarantine.
- UI projections that preserve ACP block kind before rendering.

Avoid:

- Treating "background shell/no focus" as provider backgrounding. It is a UI concern, not detached job ownership.

### Zed threads and mentions

Zed is the best reference for rich client-host semantics.

Important ideas:

- **Thread** is the user-facing workstream. It contains transcript entries,
  active turn state, draft prompt, plan, token usage, terminals, available
  commands, work dirs, title, checkpoints, and optional parent session id.
- **Session** is the ACP/runtime identity behind a thread.
- **Turn** is the active prompt lifecycle inside the thread.
- **Mention** is typed context inserted into the prompt editor, not just text.
- Mention targets are encoded as durable URIs:
  - file,
  - directory,
  - pasted image,
  - symbol with line range,
  - selection with optional file path,
  - thread,
  - rule/prompt,
  - diagnostics,
  - fetched URL,
  - terminal selection,
  - git diff,
  - merge conflict.
- The prompt editor stores visible text plus inline "crease" decorations for
  mentions. Each crease maps to a `MentionUri` and an async resolver task.
- On send, Zed walks the editor text and crease ranges in order and builds ACP
  `ContentBlock[]`:
  - plain text ranges become `Text`,
  - resolved text mentions become `Resource` with embedded text when the agent
    supports embedded context,
  - otherwise they become `ResourceLink`,
  - image mentions become `Image`.
- The thread sends those content blocks in one ACP `PromptRequest`, then
  optimistically appends a user transcript entry and creates a git checkpoint.
- Mention resolution also tracks buffers that were read, so the action log can
  record context reads.

Steal this:

- `MentionUri` as the durable identity of context, separate from resolved
  mention content.
- `MentionSet` / context registry keyed by editor span id.
- Async mention resolution with visible failure.
- Prompt composition from ordered text spans plus mention spans into typed ACP
  content blocks.
- Support both embedded resources and resource links depending on backend
  capabilities.
- Thread/session/turn separation:

```text
Thread
  -> Session
    -> Turn
      -> PromptRequest(ContentBlock[])
      -> SessionUpdate stream
```

Avoid:

- Copying Zed implementation details like GPUI creases directly. The concept is
  "decorated prompt spans with stable mention ids"; silvercode can implement
  that with its own TUI editor model.
- Treating thread as a replacement for runtime session id. Thread is product
  state; session is protocol/runtime state.

### acp-plugin

acp-plugin is a useful minimum viable ACP host.

Important ideas:

- Spawns ACP process, wires raw traffic logging, initializes, creates session, sends messages, cancels.
- It maps ACP updates into UI events:
  - message chunks -> stream chunks,
  - thought chunks -> thinking,
  - tool calls -> tool events,
  - plans/mode/commands into dedicated UI events.
- It has a visible queued message UX in its input component.

Steal this:

- Simple host adapter shape.
- ACP traffic logging that cannot break the connection.
- Visible queue editing/deleting affordances.

Avoid:

- Queue correctness living in the chat input. Runtime queueing belongs in the session actor; the input should only expose/edit drafts and local queued entries.

### Claude Agent ACP

Claude Agent ACP is the best Claude Code wrapper reference.

Important ideas:

- Redirects normal logging to stderr so stdout remains pure ACP.
- Advertises `promptQueueing` capability.
- Converts ACP prompt content into Claude SDK/user messages with a UUID.
- If a prompt arrives while one is running, it pushes into Claude's input queue and stores a pending resolver.
- Handoff is detected by seeing the queued user UUID echoed/replayed by Claude, not by guessing from UI status.
- If no handoff happens, finally blocks resolve pending prompts so the queue cannot wedge.
- `TodoWrite` is mapped to ACP `plan`.
- `Bash` can use terminal metadata when the client supports terminal output.
- `Task`/`Agent` tools are rendered as task-like tool calls.
- Task-notification followups are autonomous background work and are excluded from the user prompt lifecycle.

Steal this:

- Capability-driven prompt queueing.
- UUID-based handoff for queued prompts.
- Pure stdout discipline.
- TodoWrite -> plan, Bash -> terminal, Task -> task/subagent mapping.
- Explicit distinction between user prompt turns and task-notification followups.

Avoid:

- Letting Claude-specific queue semantics leak into all drivers. Model it as a driver capability.

### Codex ACP

Codex ACP is the best Codex wrapper reference.

Important ideas:

- Thread is actor-like. Public APIs send `ThreadMessage`s and await oneshots.
- `PromptState` owns submission id, active commands, permission interactions, seen text/reasoning deltas, result resolution, and pending command state.
- Streaming deltas are deduped against final message events.
- Codex `PlanUpdate` maps to ACP `plan`.
- Exec command events map to ACP tool calls and terminal output metadata.
- Permission requests are mapped to ACP permission requests.
- `TurnComplete` resolves the prompt result; aborted/shutdown resolves cancelled.
- Background/collab agent events exist in Codex's event stream but are currently ignored/TODO in the adapter.

Steal this:

- Actor-style thread loop.
- Prompt-local state object.
- Dedupe between streaming deltas and final messages.
- Rich terminal/tool-call mapping.

Watch:

- Codex exposes background/collab events. A serious client host should not ignore them forever; they should map to background task/subagent activity.

### OpenClaw

OpenClaw is the best background-agent/task orchestration reference.

Important ideas:

- Background tasks are records, not schedulers.
- ACP runs, subagent spawns, cron executions, and CLI runs all create task records.
- Task lifecycle is `queued -> running -> terminal`, where terminal is `succeeded | failed | timed_out | cancelled | lost`.
- Completion is push-driven, not polling-driven.
- Delivery can be direct to a channel or queued to the requester session/heartbeat.
- Subagents run in child sessions and report completion back to the parent/requester.
- Follow-up messages in a bound child conversation route directly to that child session; management commands remain local.
- Queueing is lane-aware: main lane, subagent/background lane, concurrency caps.
- Steering is separate from followup: steering injects at model/runtime boundary when supported.
- Completion handoff uses stable idempotency keys.
- Orphan recovery and tombstones prevent stale jobs from re-wedging the system after restarts.
- Cancellation cascades to children.

Steal this:

- `BackgroundTaskRegistry` as a durable runtime ledger.
- Parent-owned child sessions for background agents.
- Push completion and idempotent delivery.
- Foreground/background lanes and caps.
- Lost/timed-out state, not infinite running.
- Bound child-session followups.

Avoid:

- Sending internal metadata envelopes through external ACP transcript. Convert internal metadata to safe plain prompt/context when crossing protocol boundaries.

### OpenACP

OpenACP is product-level prior art for ACP bridge/gateway behavior rather than a local editor host.

Important ideas from the earlier deep dive:

- Session abstraction is agent-portable.
- Mid-conversation agent switch uses resume when possible and context injection when fresh-spawning.
- Adapter framework handles Telegram/Discord/Slack.
- Permission, streaming, warm pool, plugin middleware, tunnel, doctor, and REST/SSE surfaces are all production concerns for a gateway.

Steal this:

- Session-as-first-class above agent instance.
- Context carry across backend switch.
- Middleware/plugin points for permission and routing.

Avoid:

- Optimizing silvercode for chat-platform bridge semantics. silvercode is an editor/TUI client host first.

---

## Mapping to ACPX

ACPX is the closest concrete prior art for the proposed silvercode runtime.
The proposed architecture is best understood as "ACPX's runtime spine, plus a
TUI-grade event store, task registry, and subagent model".

### Concept mapping

| Proposed silvercode concept | ACPX concept | Notes |
| --- | --- | --- |
| `ProviderDriver` | `AcpClient` plus agent registry/command resolution | ACPX's driver boundary owns process launch, JSON-RPC, session load/new, prompt, cancel, mode/model/config controls. Silvercode should keep this boundary similarly narrow. |
| `SessionActor` | `AcpRuntimeManager.startTurn` for embedded runtime; queue-owner process for warm shared sessions | ACPX splits "one runtime turn" and "long-lived queue owner" paths. Silvercode should make this split explicit: one actor per live provider session, optionally backed by a warm owner. |
| `PromptRequest` | `AcpRuntimeTurnInput` | ACPX has `text`, `attachments`, `mode`, `requestId`, timeout, and abort signal. Silvercode should add UI provenance, lane, parent job/subagent ids, and enqueue policy outside the protocol payload. |
| `TurnHandle` | `AcpRuntimeTurn` | ACPX exposes `requestId`, `events`, `result`, `cancel`, and `closeStream`. This is almost exactly the right public shape. Silvercode should add durable turn metadata and keep the stream projection separate. |
| `output gate` | Queue owner turn controller plus active prompt controller | ACPX gates on `idle -> starting -> active -> closing`, with `pendingCancel` during startup and direct cancel once `hasActivePrompt()` is true. Silvercode's output gate should be this, not "queue empty" or "assistant text done". |
| `drain window` | `runPromptTurn` post-success idle wait | ACPX waits briefly after prompt completion for late `session/update` notifications and treats "agent reply arrived after prompt timeout" as a success source. This is a key robustness pattern to copy. |
| Protocol ledger | Raw ACP stream NDJSON | ACPX's session model is strict: raw JSON-RPC only, no wrapper envelopes, no key renaming. Silvercode should preserve this as the proof ledger. |
| Runtime ledger | ACPX local reliability state | ACPX keeps queue owner pid/health, locks, leases, retries, diagnostics outside the ACP stream. Silvercode should promote this to a first-class event ledger for UI/debuggability. |
| Projection store | ACPX `session.json` checkpoint/index | ACPX treats the checkpoint as derived from replay plus local runtime state. Silvercode should do the same for chat, tool, plan, task, and notification views. |
| Canonical IDs | ACPX `acpx_record_id`, `acp_session_id`, `agent_session_id`, `request_id` | This ID separation is exactly right. Silvercode should keep those and add `localSessionId`, `turnId`, `jobId`, `subagentRunId`, and `planId` where needed. |
| Plan/steps | ACP plan update tags and projected runtime events | ACPX can surface plan-like updates, but plans are not its central domain model. Silvercode needs a stronger plan snapshot model with replacement semantics and stale-step handling. |
| Tool calls | `session/update` projected to `tool_call` runtime events | ACPX's public event shape is intentionally small. Silvercode should preserve the full raw update, then derive compact UI rows from it. |
| Background work | Queue owner, background prompt conformance, OpenClaw task runtime | ACPX has strong queue/owner primitives and background-prompt test cases, but not a full product task registry. Silvercode should combine ACPX's owner model with OpenClaw-style durable task/subagent bookkeeping. |
| Subagents | Parent/child runtime provenance, mostly outside ACPX core | ACPX gives the right request/session id vocabulary, but child agents need first-class silvercode entities: parent session, child session, trigger tool call, lifecycle, transcript, and cancellation cascade. |

### Flow mapping

The proposed foreground prompt flow maps almost directly to ACPX:

```text
silvercode submit
  -> create PromptRequest with requestId
  -> SessionActor accepts or rejects by lane/backpressure
  -> ProviderDriver session/new or session/load
  -> session/prompt
  -> session/update stream
  -> prompt response
  -> drain late updates
  -> terminal turn result
  -> derived projections
```

In ACPX terms, this is:

```text
AcpRuntime.ensureSession
  -> AcpRuntime.startTurn / runTurn
  -> AcpClient.prompt
  -> onSessionUpdate / onClientOperation
  -> runPromptTurn waitForSessionUpdatesIdle
  -> AcpRuntimeTurnResult
```

For queued/warm sessions, ACPX's queue owner is the stronger reference:

```text
client submits queued task
  -> queue owner lease
  -> QueueOwnerTurnController.beginTurn
  -> markPromptActive
  -> apply pending cancel/control changes
  -> run prompt turn
  -> endTurn
  -> refresh lease / next task
```

Silvercode should copy the ownership invariant: exactly one writer owns a live
provider session at a time; queued work talks to that owner, not directly to the
provider process.

### Where silvercode should match ACPX exactly

- Keep the raw ACP transcript append-only and protocol-pure.
- Treat checkpoints/projections as rebuildable derived state.
- Keep local reliability state out of the protocol transcript.
- Distinguish local record id, ACP session id, provider/native session id, and request id.
- Use a real output gate around active prompt lifecycle, not text-stream heuristics.
- Support cancellation before prompt start via pending cancel, and during prompt via active controller.
- Drain late `session/update` notifications after prompt completion.
- Make strict stdout/stderr/process hygiene part of conformance.

### Where silvercode should intentionally go beyond ACPX

- ACPX's public `AcpRuntimeEvent` stream is deliberately compact and somewhat lossy. Silvercode should keep full raw updates and derive UI events from them.
- ACPX's turn state is enough for automation. Silvercode needs richer observable states: `accepted`, `queued`, `starting`, `active`, `draining`, `completed`, `cancelled`, `failed`, `lost`.
- ACPX's queue owner is a robust execution primitive, but silvercode needs a product-level `BackgroundTaskRegistry` with durable jobs, lanes, caps, completion delivery, and restart recovery.
- ACPX does not make subagents a first-class product model. Silvercode should model subagent runs explicitly instead of treating them as only notification rows.
- ACPX surfaces plan/tool events through runtime events. Silvercode should maintain canonical plan snapshots, tool-call state, and stale/replacement rules in its projection layer.
- ACPX is optimized for CLI/gateway/automation runtime boundaries. Silvercode is an interactive client host, so it needs tighter integration with input focus, transcript rendering, notification routing, and user-visible pending work.

### The architectural translation

The proposed L5 silvercode architecture can be framed as four ACPX-inspired
layers:

1. **Protocol layer**: raw ACP JSON-RPC stream and strict subprocess contract.
2. **Runtime layer**: session actor, turn gate, queue owner, cancellation, drain,
   lease/heartbeat, and recovery.
3. **Domain layer**: turns, tool calls, plans, tasks, subagents, permissions,
   and background jobs as durable typed records.
4. **UI projection layer**: transcript rows, status bars, notifications,
   task lists, plan panels, and debug/replay views.

ACPX covers layers 1 and 2 well. It has useful precedents for layer 3, but does
not fully own silvercode's domain concepts. Layer 4 is mostly silvercode's
responsibility.

The clean L5 target is therefore not "be ACPX"; it is "make the silvercode
runtime ACPX-compatible at the protocol/runtime boundary, then add richer
product semantics above it without polluting the ACP stream".

---

## ACPX domain vocabulary inventory

This section is intentionally vocabulary-first. ACPX contains many useful
implementation names, but silvercode should standardize only the terms that
make sense across Claude, Codex, ACP wrappers, background work, and the TUI.

### Names to adopt

| Term | Meaning | Why adopt |
| --- | --- | --- |
| **Agent** | The coding-agent backend being driven through ACP or a wrapper. | Neutral across Claude, Codex, Gemini, OpenCode, etc. |
| **Session** | Durable conversation container scoped to agent/cwd/name. | Matches ACP, ACPX, Zed, Claude, Codex, and user intuition. |
| **Named session** | A parallel workstream under the same cwd/agent. | Clearer than "thread slot" for this layer. |
| **Session key** | Stable lookup tuple for session routing. | Good abstraction for `(agentCommand, cwd, optional name)` without over-exposing storage ids. |
| **Record** | Local persisted metadata/checkpoint for a session. | Useful distinction from live ACP session. |
| **Turn** | One accepted unit of agent work around a prompt lifecycle. | This should be our core unit, replacing loose "message queue" language. |
| **Turn input** | The request payload submitted to start a turn. | Better than "prompt request" when attachments, mode, provenance, and control metadata are present. |
| **Turn event** | A live event emitted while a turn is running. | Separates streaming/progress from final result. |
| **Turn result** | Terminal outcome of a turn. | Lets completion/cancel/failure be a promise/result, not a magic final stream event. |
| **Turn handle** | Live control/read surface for a turn. | Matches ACPX `AcpRuntimeTurn`: `events`, `result`, `cancel`, `closeStream`. |
| **Prompt mode** | How the submitted text is interpreted, e.g. `prompt` vs `steer`. | ACPX's `prompt`/`steer` split is a useful domain distinction. |
| **Session mode** | Persistence mode, e.g. `persistent` vs `oneshot`. | Avoids overloading "mode" with agent behavior. |
| **Queue owner** | The single live owner for a session's queued turns and controls. | Very good name for the single-writer actor. |
| **Owner lease** | The local ownership token proving which process owns a session. | Precise term for crash/recovery and stale-owner handling. |
| **Owner generation** | Monotonic/random generation token for owner incarnation. | Excellent stale-response/race prevention term. |
| **Queue task** | One queued request delivered to a queue owner. | Fine for internal queue mechanics. Do not call foreground prompts "tasks" unless actually queued/background. |
| **Control** | Non-turn session mutation: cancel, set mode, set model, set config, status, close. | Cleaner than mixing these into prompt/turn vocabulary. |
| **Capability** | Backend-advertised supported controls/features. | ACP-native and useful for UI gating. |
| **Status** | Local/live health summary of a session or runtime. | Keep distinct from turn result and plan step status. |
| **Checkpoint** | Derived session projection/index rebuilt from stream plus local state. | Better than treating projection JSON as another event source. |
| **Stream** | Raw append-only ACP message log or live event stream, depending qualifier. | Use qualified forms: protocol stream, turn event stream, output stream. |
| **Replay** | Rebuild state from a stream/checkpoint. | Important for proofs, tests, and recovery. |
| **Permission mode** | Policy for permission requests: approve-all, approve-reads, deny-all. | Clear and already proven in ACPX. |
| **Non-interactive permission policy** | What to do when permission UI cannot be shown: deny or fail. | Critical for background/CI/subagent work. |
| **Flow** | Multi-step workflow above turns. | Useful if silvercode grows planned/background orchestration. |
| **Node** | One step definition inside a flow graph. | Good for flow authoring, but do not use for chat turns. |
| **Step** | One executed node attempt/result in a flow. | Better for run history than "message". |
| **Run** | One execution of a flow. | Good for background workflows and replay. |
| **Artifact** | Durable file/blob produced by a run/step. | Useful for background jobs and audits. |

### Names to adapt

| ACPX name | Silvercode name | Reason |
| --- | --- | --- |
| `acpxRecordId` | `localRecordId` or `sessionRecordId` | We should keep ACPX-specific field names only when interoperating with ACPX. Inside silvercode, use product-neutral names. |
| `acpxSessionId` / `backendSessionId` | `acpSessionId` | ACPX uses both in different public surfaces. Silvercode should use the protocol name directly. |
| `agentSessionId` | `providerSessionId` with alias `agentSessionId` at ACPX boundary | "Provider" is clearer inside silvercode when Claude/Codex native ids are involved. |
| `runtimeSessionName` | `runtimeHandleName` or encoded `handleState` | The ACPX field is useful for embedding, but too opaque for our main domain vocabulary. |
| `AcpRuntime` | `AgentRuntime` or `AcpRuntime` only at ACP boundary | If the runtime is ACP-only, keep `AcpRuntime`; if it also wraps stream-json Claude, call it `AgentRuntime`. |
| `AcpRuntimeEvent` | `TurnEvent` | Domain should lead with turn, then include protocol provenance. |
| `AcpRuntimeStatus` | `RuntimeStatus` / `SessionStatus` | Avoid protocol prefix outside adapters. |
| `SessionQueueOwner` | `TurnQueueOwner` or `SessionOwner` | If it owns the whole session, `SessionOwner`; if it owns queueing only, `TurnQueueOwner`. Pick based on implementation boundary. |
| `QueueSubmitRequest` | `TurnSubmitRequest` | Submitting to the owner creates or enqueues a turn; "queue" is transport, "turn" is domain. |
| `SessionSendResult` | `TurnResult` plus updated `SessionRecord` | "Send" is transport-era language. |
| `SessionEnqueueResult` | `TurnEnqueueResult` | Preserve the distinction between accepted queued work and completed work. |
| `OutputFormatter` | `OutputRenderer` or `OutputSink` | In TUI, this is rendering/sink logic, not the domain model. |
| `FlowNodeResult` | `StepResult` | Users care that a step completed; node is graph definition, step is execution. |
| `FlowStepTrace` | `StepTrace` | Good concept; drop redundant prefix inside flow subsystem. |
| `FlowSessionBinding` | `SessionBinding` | Useful general concept: binds a workflow/background run to a session. |

### Names not to adopt as domain terms

These are valuable implementation names but should not become the product
vocabulary:

- `send`, `message`, `submit_prompt` as the main work unit. Use **turn**.
- `backendSessionId` unless specifically wrapping ACPX. Use **acpSessionId** or **providerSessionId**.
- `runtimeSessionName` in UI/domain code. Treat it as encoded runtime handle state.
- `QueueOwnerAcceptedMessage`, `QueueOwnerEventMessage`, etc. Keep as IPC protocol names only.
- `ownerGeneration` in user-facing copy. It is an internal race-prevention token.
- `eventVersion` envelopes for ACP streams. ACPX moved away from this; raw ACP JSON-RPC is the proof stream.
- `node` for normal chat/task execution. Reserve node for flow graph definitions.

### Proposed silvercode canonical vocabulary

Core objects:

- **Agent**: backend/tool loop identity.
- **Provider**: implementation family such as Claude Code, Codex ACP, Gemini ACP.
- **Adapter**: process/library that converts provider protocol to silvercode/ACP.
- **Runtime**: owns sessions, turns, controls, recovery, and protocol I/O.
- **Thread**: durable user-facing conversation/workstream.
- **Thread record**: persisted product metadata for a thread: title, draft, work dirs, UI state, and active/runtime binding pointers.
- **Session**: backend/provider runtime binding for a thread. Normally one active session per thread, plus historical bindings for resume/migration/recovery.
- **Session record**: persisted checkpoint and metadata for a provider session binding.
- **Session owner**: single live actor for one active provider session.
- **Turn**: accepted unit of agent work.
- **Turn input**: submitted payload/provenance/control options.
- **Turn event**: streamed update while a turn runs.
- **Turn result**: terminal outcome.
- **Turn handle**: live object exposing events/result/cancel/close.
- **Message**: transcript artifact with role and ordered blocks.
- **Message block**: typed content unit inside a message: text, thought, attachment, tool reference, etc.
- **Thought**: assistant thought/reasoning content surfaced as transcript-adjacent content. Use "thought" for the UI/domain object; reserve "reasoning" for provider knobs such as `reasoning_effort` and raw provider event names.
- **Track**: named projection/filter over a thread timeline, used to group leaves for display and visibility. This replaces the current `ChatChannel` concept; it is not a chat room/channel.
- **Control**: non-turn operation against a session.
- **Capability**: supported feature/control advertised by adapter/runtime.
- **Protocol stream**: raw append-only ACP JSON-RPC.
- **Projection**: rebuildable UI/domain state derived from streams and records.

Execution/lifecycle states:

- **Session status**: `running | idle | dead | no-session | closed`.
- **Turn state**: `accepted | queued | starting | active | draining | completed | cancelled | failed | lost`.
- **Owner state**: `idle | starting | active | closing`.
- **Flow run status**: `running | waiting | completed | failed | timed_out | cancelled`.
- **Step outcome**: `ok | timed_out | failed | cancelled`.
- **Plan step status**: `pending | in_progress | completed | cancelled`.
- **Tool call status**: `pending | in_progress | completed | failed`.

Identity fields:

- **localSessionId**: silvercode UI/session identity.
- **threadId**: silvercode durable user-facing thread identity.
- **sessionRecordId**: local durable record id.
- **acpSessionId**: ACP wire session id.
- **providerSessionId**: Claude/Codex/native session id, optional.
- **requestId**: transport/request correlation id.
- **turnId**: silvercode durable turn identity.
- **toolCallId**: provider/protocol tool-call id.
- **jobId**: detached background work id.
- **subagentRunId**: child-agent execution id.
- **flowRunId**: workflow execution id.
- **stepId / attemptId**: workflow step identity and retry attempt.

The important rule: **Turn is the lifecycle boundary; message is a transcript
artifact.** A user prompt may create a user message, but the runtime accepts a
turn. Assistant text, thoughts, tool calls, plan updates, and permission
requests are events/projections inside that turn.

Another rule: **Track is a display projection, not an event store.** A track
selects leaves from a single thread timeline. Execution queue lanes are a
different concept and should stay named `QueueLane`/`TurnLane` when we need
foreground, background, steer, or subagent scheduling policy.

### Recommended naming changes in silvercode

- Rename public queue language around prompts to turn language:
  - `queuedMessage` -> `queuedTurn` or `pendingTurn`.
  - `sendMessage` at runtime boundary -> `startTurn` / `submitTurn`.
  - `AgentEvent` stream at wrapper boundary -> `TurnEvent` stream, with legacy alias during migration.
- Keep ACPX method names where they are already crisp:
  - `ensureSession`
  - `startTurn`
  - `runTurn` only as compatibility
  - `getCapabilities`
  - `getStatus`
  - `setMode`
  - `setConfigOption`
  - `cancel`
  - `close`
- Use "task/job" only for detached/background work:
  - foreground interaction: **turn**
  - queued foreground follow-up: **queued turn**
  - background execution: **job**
  - workflow execution: **run**
  - child agent execution: **subagent run**
- Rename current chat projection language:
  - `ChatChannelId` -> `ChatTrackId`.
  - `ChatChannelState` -> `ChatTrackState`.
  - `ChatLeaf.channel` -> `ChatLeaf.track`.
  - `defaultChatChannels()` -> `defaultChatTracks()`.
  - `setChannelVisible()` -> `setTrackVisible()`.
- Rename text/thought projection names:
  - `ChatBlock.type === "reasoning"` -> `ChatBlock.type === "thought"`.
  - `ChatLeaf.type === "reasoning"` -> `ChatLeaf.type === "thought"`.
  - `ChatLeaf.type === "user-text" | "assistant-text"` should collapse to `ChatLeaf.type === "message"` with `role`, or migrate first through `user-message` / `assistant-message` if a staged rename is safer.
- Rename rendering components around transcript semantics:
  - Current `Chat.Message` is a wrapper; rename it to `Chat.MessageGroup` or `Chat.EntryGroup`.
  - `Chat.Prompt` -> `Chat.UserMessage` or `Chat.Message role="user"`.
  - `Chat.Narration` -> `Chat.Message role="assistant"`.
  - Muted reasoning rendering -> `Chat.Thought`.

---

## Could silvercode just use ACPX?

Yes, for the runtime spine. Not as a full replacement for silvercode's TUI
state, projections, background-job UX, or Claude subscription wrapper.

### Strong case for using ACPX

ACPX already owns several hard problems we were about to design:

- ACP subprocess lifecycle and strict stdio discipline.
- Persistent sessions and scoped session lookup.
- Named sessions for parallel workstreams.
- Single-writer queue owner with lease, socket, owner generation, and idle TTL.
- Turn API: `ensureSession`, `startTurn`, `runTurn`, `TurnHandle`, `TurnResult`.
- Cooperative cancel and control routing through the owner.
- `set-mode`, `set model`, `set_config_option`, and capability/status surfaces.
- Crash reconnect: reload session if possible, fall back to new session when necessary.
- Raw ACP JSON-RPC protocol stream as the authoritative transcript.
- Derived session record/checkpoint model.
- Conformance tests and queue/runtime/persistence test coverage.
- Flows for multi-step ACP work.

Using ACPX would likely delete more architecture risk than it adds, especially
for Codex/Gemini/OpenCode-style ACP backends.

### What ACPX would not replace

Silvercode would still need:

- TUI session state and render projections.
- Full-fidelity ACP `SessionUpdate` preservation for rich UI blocks.
- Claude Code subscription-compatible wrapper path. ACPX's built-in `claude`
  currently targets the official `claude-agent-acp` package, while silvercode's
  maintained subscription path is `@km/claude-acp` wrapping the real `claude`
  binary. We could run that wrapper through ACPX as a custom agent command.
- Subagent/task notification model.
- Background job registry and completion delivery UX.
- Local permission UI integration for interactive TUI decisions.
- Migration from existing silvercode sessions/transcripts.

### Integration options

#### Option A: Use ACPX as a CLI subprocess

Silvercode shells out to `acpx --format json --json-strict ...`.

Pros:

- Fastest spike.
- Uses ACPX exactly as shipped.
- Clear process boundary and easy rollback.

Cons:

- Harder to integrate rich interactive permission UI.
- Harder to access non-public runtime details.
- More serialization/process overhead.
- We must parse ACP JSON-RPC stream and reconstruct turn handles ourselves.

Best use: early Codex proof-of-concept and conformance comparison.

#### Option B: Embed ACPX's runtime API

Silvercode imports ACPX runtime types and uses `AcpRuntime.ensureSession()` and
`AcpRuntime.startTurn()` behind our runtime interface.

Pros:

- Direct mapping to our desired Turn vocabulary.
- Reuses queue owner, session store, controls, status, and doctor.
- Cleaner cancellation and result handling than CLI scraping.

Cons:

- ACPX marks itself alpha; runtime APIs may churn.
- We need a package/version pin or vendor strategy.
- Public `AcpRuntimeEvent` is compact; we may need lower-level access to full
  ACP updates for high-quality UI projection.

Best use: production direction if the spike validates API stability.

#### Option C: Vendor/fork ACPX runtime pieces

Silvercode vendors the runtime, queue owner, and conformance cases while keeping
the UI/domain layer local.

Pros:

- Maximum control and ability to expose full-fidelity events.
- Lets us tune queue policy for interactive TUI use.
- Avoids upstream API churn.

Cons:

- We inherit maintenance burden.
- We lose some benefit of a referenceable external architecture unless we stay
  close and upstream fixes.

Best use: only if embedding hits stability or event-fidelity blockers.

### Recommended path

Use ACPX as the default ACP runtime candidate, but keep a silvercode-owned
domain interface above it:

```ts
interface AgentRuntime {
  ensureSession(input: EnsureSessionInput): Promise<SessionHandle>
  startTurn(input: TurnInput): TurnHandle
  getStatus(session: SessionHandle): Promise<SessionStatus>
  getCapabilities(session?: SessionHandle): Promise<RuntimeCapabilities>
  setMode(session: SessionHandle, mode: string): Promise<void>
  setConfigOption(session: SessionHandle, key: string, value: string): Promise<void>
  cancel(session: SessionHandle, reason?: string): Promise<void>
  close(session: SessionHandle, reason: string): Promise<void>
}
```

Then implement:

1. `AcpxRuntimeAdapter` for Codex/Gemini/OpenCode-style ACP agents.
2. `AcpxRuntimeAdapter` pointed at `@km/claude-acp` for Claude subscription
   users.
3. Existing direct Claude stream-json path only as fallback/migration until the
   ACP wrapper path proves equivalent.

The rule should be: **silvercode owns product semantics; ACPX owns ACP session
runtime mechanics.**

### Spike acceptance criteria

Use ACPX directly only if a spike proves:

- Codex turn streams render with correct text/tool/plan ordering.
- `@km/claude-acp` works through ACPX with real Claude Code session ids.
- Cancellation works in `starting`, `active`, and post-output drain windows.
- No prompt is left "thinking" after errors, timeouts, or close.
- Full ACP updates can be preserved or recovered for TUI projection.
- Queue owner does not impose unwanted foreground backlog semantics.
- Session resume/load works after process death.
- Permission requests can be routed through silvercode's UI.
- Existing silvercode tests can be ported to ACPX conformance-style cases.

If those pass, the most elegant architecture is likely:

```text
silvercode TUI
  -> silvercode domain/projection store
  -> silvercode AgentRuntime interface
  -> ACPX runtime adapter
  -> ACP server wrapper: codex-acp / @km/claude-acp / gemini --acp / etc.
```

### Library/vendorization facts

ACPX is already importable as a TypeScript/ESM library. As of the current
source and npm metadata:

- Package name: `acpx`.
- Current version observed: `0.7.0`.
- Node engine: `>=22.12.0`.
- Public exports include:
  - `acpx/runtime`
  - `acpx/flows`
  - `acpx` CLI entrypoint
- `acpx/runtime` exports:
  - `createAcpRuntime`
  - `createRuntimeStore`
  - `createFileSessionStore`
  - `createAgentRegistry`
  - `AcpxRuntime`
  - `AcpRuntime`, `AcpRuntimeTurn`, `AcpRuntimeTurnInput`,
    `AcpRuntimeTurnResult`, `AcpRuntimeEvent`, `AcpRuntimeHandle`,
    `AcpRuntimeOptions`
  - handle-state helpers and runtime errors

That means we have three realistic vendor strategies:

1. **npm dependency pin**: depend on `acpx@0.7.0` and import `acpx/runtime`.
2. **git submodule under `vendor/acpx`**: consistent with km's vendor model,
   easy to patch locally and upstream later.
3. **source copy/extraction**: highest control, worst upstreamability.

Recommendation: use a git submodule or package override first, not a source
copy. Keep all silvercode-facing imports behind one local adapter module so
upstream churn is contained.

### Where ACPX may be too limited for silvercode

These are the likely extension points if we vendorize or contribute upstream.

#### 1. Runtime event fidelity

ACPX's public `AcpRuntimeEvent` is intentionally compact:

- `text_delta`
- `status`
- `tool_call`
- compatibility `done`
- compatibility `error`

That is good for a headless runtime, but silvercode needs full-fidelity
`SessionUpdate` data for UI rendering and replay:

- message ids,
- structured content blocks,
- thought chunks,
- tool call inputs/outputs/content,
- diffs,
- terminal references,
- usage updates,
- config/mode/session info updates,
- plan entries with stable replacement semantics,
- raw JSON-RPC provenance.

Extension wanted:

- add a lossless `raw_session_update` or `session_update` event variant, or
- expose a lower-level hook from `AcpRuntimeManager` / `AcpClient` that lets
  silvercode record raw ACP notifications before projection.

#### 2. TUI permission integration

ACPX runtime options expose policy-level permission modes:

- `approve-all`
- `approve-reads`
- `deny-all`
- non-interactive `deny` / `fail`

Its filesystem and terminal handlers are CLI-oriented. Silvercode needs a
callback-driven permission bridge so a TUI modal can approve/deny a specific
request without pretending the process is an interactive terminal.

Extension wanted:

- `permissionHandler?: (request) => Promise<PermissionResponse>`
- lifecycle cancellation for pending permission prompts when a turn cancels,
- UI-friendly permission options, including "allow once" / "deny once" and
  possibly "always for this session" if supported by the adapter.

#### 3. Storage root and queue root control

`createFileSessionStore({ stateDir })` makes session records configurable, but
other ACPX paths still default to home/tmp conventions:

- session event logs under `~/.acpx/sessions`,
- queue lock files under `~/.acpx/queues`,
- sockets under `/tmp/acpx-<home-hash>`.

Silvercode may need everything under its own app state directory for portable
profiles, tests, cleanup, and multi-worktree isolation.

Extension wanted:

- one `stateDir` / `runtimeDir` option that controls records, streams, queues,
  sockets, locks, and temp files.
- test helpers that guarantee no writes to the real user home.

#### 4. Queue policy and interactive turn lanes

ACPX queueing is session-serial and CLI-friendly: when a turn is active,
subsequent prompts queue through the owner and optionally `--no-wait`.

Silvercode needs more nuanced policy:

- foreground user turn,
- steer/interrupt turn,
- background job turn,
- subagent child turn,
- queued follow-up,
- maybe replace/drop/coalesce pending turns.

Extension wanted:

- `TurnLane`: `foreground | steer | background | subagent`.
- `enqueuePolicy`: `reject | queue | replace_pending | interrupt_active`.
- bounded queues per lane with clear backpressure errors.
- owner status that reports active turn plus queued turn summaries.

#### 5. Richer turn state

ACPX exposes terminal result statuses:

- `completed`
- `cancelled`
- `failed`

Internally it has owner states like `idle | starting | active | closing`, and
it does a post-success drain. Silvercode needs those observable for TUI
correctness and debugging.

Extension wanted:

- public turn lifecycle events:
  `accepted | queued | starting | active | draining | completed | cancelled | failed | lost`.
- drain start/end timestamps and timeout reason.
- "lost" or "orphaned" state when owner/process disappears without a clean
  result.

#### 6. Background jobs and subagents

ACPX has queue owners and flows, but not silvercode's full product model for:

- background jobs,
- child agent sessions,
- subagent notifications,
- parent/child cancellation cascade,
- completion delivery to a foreground transcript,
- durable job list UI.

Extension wanted:

- `BackgroundJobRegistry` above ACPX turns.
- first-class `parentTurnId`, `jobId`, `subagentRunId`, `childSessionId`
  provenance on `TurnInput`.
- owner support for child-session lifecycle and cancellation cascade.

#### 7. Claude Code subscription path

ACPX's built-in `claude` registry currently points at the official
`claude-agent-acp` package. Silvercode's maintained subscription-compatible
path is `@km/claude-acp`, which wraps the real Claude Code binary.

Extension wanted:

- local agent registry override that points `claude` or `claude-code` to
  `@km/claude-acp`.
- conformance case that verifies real Claude session ids survive
  `session/new`, `session/load`, and resume.

#### 8. UI projection ownership

ACPX's `session.json` is a derived checkpoint/index. That is correct. But
silvercode should not expose ACPX's checkpoint directly as its UI model.

Extension wanted:

- silvercode-owned projection store rebuilt from raw ACP stream plus runtime
  events.
- explicit adapters from ACPX session record to silvercode session metadata.
- migration path from existing silvercode transcript/session state.

#### 9. API stability and dependency ownership

ACPX is marked alpha and likely to change. Vendorization solves immediate
control but creates maintenance responsibility.

Extension wanted:

- one local `AcpxRuntimeAdapter` module as the only import boundary.
- version pin plus periodic upstream merge cadence.
- patch log documenting every local divergence.
- upstream PRs for generic improvements: raw update event, stateDir coverage,
  permission callback, richer turn status.

### Vendorization recommendation

Vendor ACPX if we commit to one of these two stances:

1. **Close-to-upstream vendor**: use `vendor/acpx` as a submodule, patch only
   small generic runtime gaps, and upstream them. This keeps the architecture
   referenceable.
2. **Runtime fork**: extract ACPX's runtime/queue/conformance packages into a
   silvercode-owned package. This gives maximum control but stops being ACPX
   as a reference implementation.

The better first move is close-to-upstream vendorization. The extension list
above is mostly upstreamable, and the parts that are silvercode-specific can
stay above ACPX in our adapter/projection layer.

### Alternatives that may be better than ACPX

There is no obviously better all-in-one replacement. ACPX is the strongest
headless ACP session runtime found so far. The alternatives are better only in
specific dimensions.

#### Alternative 1: Own runtime on official ACP TypeScript SDK

Use `@agentclientprotocol/sdk` directly and build silvercode's runtime around
`ClientSideConnection`, preserving full ACP messages from the start.

Better than ACPX when:

- full-fidelity `SessionUpdate` preservation is non-negotiable,
- TUI permissions must be designed first-class from day one,
- we want all state under silvercode-controlled stores,
- queue lanes/background/subagent semantics should be product-specific,
- we want no dependency on ACPX's alpha runtime API.

Worse than ACPX when:

- we would need to rebuild owner leases, queue IPC, crash recovery, status,
  resume fallback, controls, conformance harnesses, and flow persistence.

Verdict:

- Best fallback if ACPX cannot expose the hooks we need.
- Highest design control, highest implementation risk.

#### Alternative 2: Zed ACP host architecture

Zed is the most mature interactive ACP client host. It has real editor
threading, UI integration, tool rendering, agent following, and ACP client
behavior in a production editor.

Better than ACPX when:

- studying interactive thread/message/UI projection semantics,
- designing editor/TUI affordances,
- modeling mentions, checkpoints, thread persistence, and rendering,
- thinking about how ACP feels to a human user.

Worse than ACPX when:

- we need a TypeScript runtime library,
- we need a headless queue owner,
- we need vendorable local process/session mechanics.

Verdict:

- Best UI/product reference.
- Not a practical runtime dependency for silvercode.

#### Alternative 3: Silvercode current harness plus targeted refactor

Keep `@km/agent-harness`, `@km/claude-acp`, and the existing ACP client, then
rename/refactor around Turn without adopting ACPX internals.

Better than ACPX when:

- Claude Code subscription compatibility is the dominant concern,
- we need exact control over stream-json quirks,
- we want a smaller migration,
- we want no external runtime ownership change.

Worse than ACPX when:

- the current state machine is already showing brittleness,
- we still need durable owner/queue/recovery/test architecture,
- Codex/Gemini/OpenCode ACP support should be first-class and uniform.

Verdict:

- Best short-term safety path for Claude.
- Not the cleanest L5 architecture by itself.

#### Alternative 4: OpenClaw product runtime / gateway patterns

OpenClaw's broader runtime is stronger product-level prior art for background
agents, channel bindings, task routing, and durable orchestration.

Better than ACPX when:

- background jobs and subagent/task delivery dominate the roadmap,
- remote/chat-channel operation matters,
- task registry, completion delivery, and orphan recovery are core.

Worse than ACPX when:

- silvercode needs a local TUI runtime, not a gateway product,
- the dependency surface would be much larger,
- we want ACP session mechanics without importing an entire assistant platform.

Verdict:

- Borrow task/subagent patterns.
- Do not use as the core local ACP runtime unless silvercode becomes a
  gateway/orchestrator.

#### Alternative 5: Agent Shell / acp-plugin / other editor plugins

These are useful client-host examples, but they are not stronger runtime
foundations.

Better than ACPX when:

- looking for small, readable client-host UI examples,
- comparing how lightweight clients map ACP updates to buffers/views,
- validating our terminology against simpler implementations.

Worse than ACPX when:

- we need robust queueing, persistence, controls, crash recovery, or tests.

Verdict:

- Good examples.
- Not better architecture foundations for L5 silvercode.

#### Alternative 6: OpenACP-style bridge/gateway

OpenACP-like systems are better references for chat-platform bridges and remote
agent dispatch.

Better than ACPX when:

- target product is Discord/Slack/Telegram/browser routing,
- multi-tenant remote sessions and adapter middleware matter,
- gateway REST/SSE surfaces are primary.

Worse than ACPX when:

- silvercode is a local TUI/editor client host,
- process ownership, TUI permissions, and local transcript projection matter
  more than chat routing.

Verdict:

- Useful gateway reference.
- Not a better local runtime base.

### Decision matrix

| Choice | Runtime robustness | UI fit | Event fidelity | Background/subagent fit | Maintenance risk | Overall |
| --- | --- | --- | --- | --- | --- | --- |
| ACPX vendored close to upstream | High | Medium | Medium unless extended | Medium | Medium | Best default |
| Official ACP SDK + own runtime | Medium initially | High | High | High | High | Best if ACPX hooks fail |
| Zed architecture | High as product | High | High | Medium | High/not TS | Best UI reference |
| Current silvercode harness refactor | Medium | High | High for Claude | Medium | Medium | Best incremental path |
| OpenClaw product runtime | High | Low/medium | Medium | High | High | Best task/gateway reference |
| Agent Shell / acp-plugin | Low/medium | Medium | Medium | Low | Low | Reference only |

Recommendation:

1. Spike **ACPX as vendored runtime**.
2. In parallel, define the silvercode-owned `AgentRuntime`/`Turn` interface so
   ACPX is replaceable.
3. If ACPX cannot expose full raw updates, TUI permissions, and state-root
   control without invasive forking, fall back to **official ACP SDK + own
   runtime**, while still copying ACPX's queue-owner/session-model tests and
   naming.

---

## Feature matrix

Legend:

- **Yes**: implemented as a first-class concept.
- **Partial**: present but lossy, limited, or not shaped for silvercode.
- **Ref**: useful reference, not a dependency candidate.
- **No**: absent or not relevant.
- **Need**: silvercode must implement this above or beside the candidate.

### Reference/runtime matrix

| Feature | silvercode current | ACPX | Zed ACP host | Agent Shell | acp-plugin | OpenClaw/OpenACP | L5 owner |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ACP wire client | Yes | Yes | Yes | Yes | Yes | Yes | Runtime |
| Raw ACP transcript | Partial | Yes | Partial | Yes-ish traffic logs | Partial | Partial | Runtime ledger |
| Strict JSON/stdout hygiene | Partial | Yes | N/A UI app | Partial | Partial | N/A | Runtime |
| Persistent session record | Partial | Yes | Yes thread/session store | Editor-local | Extension-local | Yes | Runtime + projection |
| Named/parallel sessions | Partial | Yes | Yes threads | Yes buffers | Yes tabs/views | Yes channels/tasks | Product/session layer |
| Thread/workstream UI model | Partial | No | Yes | Yes buffer | Partial | Channel/thread model | silvercode |
| Turn as lifecycle unit | Partial | Yes | Yes running turn | Partial | Partial | Partial | Runtime |
| Turn handle: events/result/cancel | No | Yes | UI task-owned | Partial | Partial | Partial | Runtime |
| Queue owner/single writer | Ad hoc | Yes | Per-thread connection | Actor-ish but light | No | Yes-ish | Runtime |
| Queue lanes/backpressure | No | Partial FIFO | UI send/interrupt | No | No | Partial | silvercode extension |
| Cancellation during startup/active/drain | Partial | Yes | Yes-ish | Partial | Partial | Partial | Runtime |
| Post-success drain | Partial | Yes | UI stream handling | Partial | Unknown | Partial | Runtime |
| Full `SessionUpdate` fidelity | Partial | Partial public API | Yes | Yes | Partial | Partial | Projection layer |
| Streaming text/thought blocks | Yes | Partial event projection | Yes | Yes | Yes | Yes | Projection layer |
| Tool call rich state | Partial | Partial public API | Yes | Yes | Partial | Yes-ish | Projection layer |
| Plan replacement semantics | Partial | Partial | Yes | Yes | Partial | Partial | Projection layer |
| Usage/config/mode/session info | Partial | Partial | Yes | Yes | Partial | Partial | Projection layer |
| Mentions/context insertion | Limited | No | Yes | Yes | Partial | No | silvercode |
| Embedded resources/images | Partial | TurnInput attachments only | Yes | Yes | Partial | Partial | Prompt composer |
| Prompt capabilities gating | Partial | Partial | Yes | Partial | Partial | Partial | Prompt composer |
| TUI permission UI | Partial | No CLI policy | Yes | Editor prompt | VS Code UI | Gateway policy | silvercode |
| Non-interactive permission policy | Partial | Yes | N/A | Partial | Partial | Yes | Runtime |
| FS/terminal client methods | Partial | Yes | Yes | Partial | Partial | Yes | Runtime/client bridge |
| Checkpoints/retry/rewind | Partial | Flow/session only | Yes git checkpoint | No | No | Partial | Product/runtime |
| Background jobs | Disabled/partial | Queue/flow only | Parallel threads | No | No | Yes | silvercode |
| Subagent runs | Notification-only | No first-class | Partial parent session id/meta | No | No | Yes | silvercode |
| Flow/workflow graph | No | Yes | No | No | No | Yes-ish | Optional runtime |
| Status/doctor/probe | Partial | Yes | UI status | Partial | Partial | Yes | Runtime |
| Conformance suite | Partial | Yes | Product tests | ERT tests | Extension tests | Broad tests | Tests |
| Replay/debug viewer | Partial | Yes flows/replay + raw stream | Thread persistence | Traffic replay | Partial | Yes | Tests/debug |

### Provider/backend matrix

| Provider/backend path | Strengths | Known gaps | Preferred role |
| --- | --- | --- | --- |
| Direct Claude stream-json (`spawnClaude`) | Best Claude Code subscription fidelity; rich Claude-specific events; existing silvercode integration | Not ACP-native; bespoke turn lifecycle; weak queue/session owner; harder to unify with Codex/Gemini | Migration fallback and source for Claude-specific features |
| `@km/claude-acp` | ACP-shaped wrapper over real Claude Code binary; subscription-compatible; can expose real Claude session ids; replay via JSONL | Needs ACPX conformance through custom command; currently drops non-text prompt blocks; subagents mostly notification/projection | Preferred Claude backend if ACPX can drive it |
| Official `claude-agent-acp` | Standard ACP package; likely works in Zed/ACPX | Blocks Claude.ai Pro/Max subscription path; less useful for silvercode users | Compatibility/testing only |
| `@zed-industries/codex-acp` | Standard Codex ACP path; ACPX built-in; good for conformance | Feature parity with native Codex CLI may lag; plan/mode quirks need testing | First ACPX spike backend |
| Gemini CLI ACP | Native ACP mode; good ecosystem test | stdout noise/trust quirks observed in hosts; capabilities vary | Secondary conformance backend |
| OpenCode ACP | Useful open agent backend; native-ish ACP support | Needs provider-specific behavior audit | Additional matrix backend |
| ACPX custom agent command | Lets us route local/private wrappers through ACPX | Requires registry/config UX and robust command resolution | Mechanism for `@km/claude-acp` and experiments |

### Feature-by-feature implementation map

| Feature area | Adopt from | Silvercode work required | Test shape |
| --- | --- | --- | --- |
| Domain vocabulary | ACPX `Turn`, Zed `Thread`, ACP protocol terms | Rename architecture around Thread/Session/Turn/Message/Mention/Job | Type-level API tests and glossary lint |
| Runtime interface | ACPX `AcpRuntime` | Local `AgentRuntime` facade with ACPX adapter behind it | Fake runtime contract tests |
| Session identity | ACPX id split | Map `sessionRecordId`, `acpSessionId`, `providerSessionId`, `localSessionId` | Persistence/replay tests with id divergence |
| Turn lifecycle | ACPX `startTurn` | Expose lifecycle states to TUI; add `lost/draining` if missing | State-machine/property tests |
| Queue owner | ACPX | Add lane/backpressure policy above owner | Queue concurrency and cancel race tests |
| Raw protocol ledger | ACPX session model | Store raw ACP JSON-RPC under silvercode runtime dir; do not mix local events | Replay validator tests |
| Runtime event ledger | silvercode | Record owner decisions, queueing, permission, background/subagent lifecycle | Crash/recovery tests |
| Projection store | Zed + silvercode chat layer | Derive transcript/tool/plan/task views from raw/runtime ledgers | Snapshot projection tests |
| Streaming blocks | Zed/Agent Shell | Preserve full `SessionUpdate`; only compact at render edge | Golden update-stream tests |
| Mentions/context | Zed | Build `MentionUri`, `MentionSet`, async resolvers, prompt composer | Prompt composition tests with files/images/symbols |
| Permissions | Zed UI + ACPX policies | Callback bridge from runtime to TUI modal; noninteractive fallback | Permission approve/deny/cancel tests |
| Tool calls | Zed/Agent Shell | Full tool-call model with status/content/raw input/output | Tool update ordering tests |
| Plans | ACP spec + Zed | Replacement semantics, completed-plan snapshots, stale-step handling | Plan replacement tests |
| Controls | ACPX | Wire mode/model/config/status through runtime capabilities | Capability-gated UI tests |
| Background jobs | OpenClaw + silvercode | Durable job registry, foreground/background lanes, completion delivery | Restart/orphan/job-delivery tests |
| Subagents | Zed meta + OpenClaw tasks + Claude notifications | First-class `SubagentRun` with parent/child session provenance | Parent-child cancellation/replay tests |
| Checkpoints/retry/rewind | Zed | Decide git checkpoint integration and transcript truncation semantics | Retry/rewind integration tests |
| Conformance | ACPX | Port/extend cases to silvercode runtime adapters | Data-driven provider matrix tests |

### Must-have L5 feature checklist

These are the features we should explicitly track to avoid hidden gaps:

1. **Thread/workstream**
   - durable title,
   - draft prompt,
   - transcript projection,
   - active turn,
   - work dirs,
   - parent session id for child runs.

2. **Session/runtime**
   - local record id,
   - ACP session id,
   - provider session id,
   - owner lease,
   - status/doctor,
   - close/recover/replay.

3. **Turn**
   - input,
   - handle,
   - events,
   - result,
   - lifecycle states,
   - cancel,
   - drain,
   - timeout/lost handling.

4. **Prompt composition**
   - text,
   - attachments,
   - mentions,
   - embedded resources,
   - resource links,
   - images,
   - capability gating.

5. **Streaming projection**
   - user chunks,
   - agent chunks,
   - thought chunks,
   - tools,
   - plans,
   - usage,
   - mode/config/session info,
   - stale update quarantine.

6. **Controls/permissions**
   - cancel,
   - interrupt/steer,
   - set mode,
   - set model,
   - set config,
   - permission request/decision lifecycle.

7. **Background/subagents**
   - job registry,
   - child session,
   - subagent run,
   - completion notification,
   - cancellation cascade,
   - restart recovery.

8. **Proof/testing**
   - raw protocol replay,
   - runtime ledger replay,
   - conformance cases,
   - race/property tests,
   - provider matrix CI,
   - visual/TUI projection snapshots.

### How to use this matrix

For each feature row:

1. Pick the source of truth: ACP spec, ACPX, Zed, Agent Shell, OpenClaw, or
   silvercode.
2. Decide the owner package/module in silvercode.
3. Decide whether ACPX must be extended, wrapped, or bypassed.
4. Add one conformance/golden test before implementation.
5. Mark the feature as one of:
   - `reuse`,
   - `wrap`,
   - `extend upstream`,
   - `own above runtime`,
   - `own instead of ACPX`.

---

## Testing references

### Best test setups to reference

#### 1. ACPX: best protocol/runtime conformance setup

ACPX has the most directly reusable test architecture for silvercode's ACP work.

What it has:

- `conformance/README.md`
- `conformance/spec/v1.md`
- `conformance/cases/*.json`
- `conformance/profiles/*.json`
- `conformance/runner/run.ts`
- Runtime, queue owner, IPC, persistence, prompt, permission, output, replay viewer, and CLI tests.

Why it matters:

- The conformance runner is data-driven instead of a pile of one-off tests.
- Cases are stable protocol artifacts that can run against mock or real adapters.
- It already has the categories we need:
  - initialize,
  - session/new,
  - prompt,
  - update stream,
  - cancel,
  - invalid params,
  - permission denial/approval,
  - structured prompt blocks,
  - background prompt completion,
  - cancel then followup,
  - post-success drain.

What to borrow:

- A `silvercode-acp-core-v1` conformance profile.
- JSON case files with declarative steps/checks.
- Adapter command injection, e.g. run same cases against fake ACP, Codex ACP, Claude ACP.
- Machine-readable report output.
- Post-success drain case as a first-class invariant.

#### 2. OpenClaw: broadest operational/live/e2e setup

OpenClaw has the most battle-tested looking test ecosystem. It is much larger than silvercode needs, but its shape is valuable.

What it has:

- Unit/integration/e2e/live suites.
- Docker runners.
- Live provider lanes.
- Mock-provider lanes.
- Package acceptance / upgrade survivor lanes.
- QA-lab scenarios.
- Gateway restart/inflight scenarios.
- Channel-specific delivery tests.
- Subagent hook tests for Discord and Feishu.
- Docker live ACP/backend lanes for Claude, Codex, Gemini, opencode.

Why it matters:

- It tests operational reality: installed package, Docker, live provider auth, restart, delivery, channel routing, process cleanup.
- It has explicit live tests for subagent probes in the Codex app-server harness.
- It treats testing as an operating system for the product, not just a unit-test suite.

What to borrow:

- A small "runtime QA scenario" harness for silvercode.
- Docker/lifecycle tests for clean home/state dirs.
- Restart/inflight recovery tests.
- Live-provider smoke lanes behind env flags.
- Task/subagent delivery tests.
- Timing and artifact summaries for long-running lanes.

#### 3. Codex ACP: best focused wrapper unit tests

Codex ACP's test surface is narrower than ACPX/OpenClaw, but its internal tests hit the right adapter risks.

What it tests well:

- Actor/thread prompt flow.
- Delta deduplication: streaming delta plus final message should not duplicate output.
- Parallel exec command tool calls: begin/end ids match.
- Permission request routing.
- MCP elicitation routing to permission requests.
- Unsupported elicitations decline automatically.
- Blocked approval should not block followup/shutdown events.

What to borrow:

- Prompt-state unit tests around tricky event ordering.
- Deduplication tests for streaming deltas vs final messages.
- Permission deadlock tests.
- Parallel tool-call identity tests.

#### 4. Claude Agent ACP: best wrapper mapping regression tests

Claude Agent ACP has useful mapping tests and opt-in integration tests.

What it tests well:

- Tool-use/result to ACP tool updates.
- `TodoWrite` emits plan instead of ordinary tool update.
- Terminal output metadata split across output and exit updates.
- `TodoWrite` undefined input regression.
- Session config/mode options.
- Auth/settings/session load behavior.
- Opt-in subprocess integration via `RUN_INTEGRATION_TESTS`.

What to borrow:

- Provider-specific marshalling regression tests.
- Terminal `_meta` tests.
- TodoWrite -> plan tests.
- "do not crash on malformed/undefined provider input" tests.
- Optional live/subprocess integration gate.

#### 5. Agent Shell: best traffic/replay and UI projection reference

Agent Shell does not have the broadest automated test suite, but it has very good debugability primitives.

What it has:

- ERT tests for formatting, mentions, diffs, command prefixes, provider helpers.
- ACP traffic buffer and traffic viewing.
- Replay-oriented workflow for `.traffic` files.
- Stale/out-of-context update logging.

What to borrow:

- Traffic capture as a daily debugging surface.
- Replay files attached to bug reports.
- Tests for plan/status formatting.
- Tests for prompt mention parsing into structured blocks.

#### 6. acp-plugin: useful baseline host tests

acp-plugin has a modest but practical setup:

- Runtime shared unit tests for config, content blocks, ACP update mapping.
- VS Code extension tests.
- Playwright e2e for extension modes.
- Webview/unit bridge tests.

What to borrow:

- Baseline UI-host bridge tests.
- Attachment-to-content-block tests.
- Simple e2e harness for host surface.

### Recommended silvercode test stack

#### Ring 0: pure model/statechart tests

Fast, deterministic tests for:

- `PromptRequest` state machine.
- `ToolCall` state machine.
- `Plan` replacement snapshots.
- `BackgroundTask` / `SubagentRun` lifecycle.
- Delivery state machine.
- Illegal transitions rejected.
- Terminal states do not downgrade.

These should run in milliseconds and not spawn providers.

#### Ring 1: driver contract tests

One suite per provider driver:

- Fake ACP driver.
- Claude ACP driver.
- Codex ACP driver.
- Legacy Claude stream-json driver if retained.

Each driver must prove:

- prompt start/result,
- cancel,
- structured content blocks,
- text/thought chunks,
- tool calls/updates,
- plans,
- permissions,
- terminal output,
- malformed provider events,
- stdout noise,
- process death.

#### Ring 2: conformance cases

Data-driven ACP/client-host conformance:

- initialize/session/new/session/load.
- single prompt.
- prompt with structured blocks.
- text + thought stream.
- plan update.
- tool call pending/in_progress/completed/failed.
- permission approval/denial/cancel.
- cancel in-flight.
- cancel then followup.
- prompt queue handoff.
- late post-result drain.
- background prompt completes.
- unknown session/invalid params.

This should look more like ACPX than normal unit tests.

#### Ring 3: projection/replay tests

Input:

- raw protocol log,
- runtime log.

Assert:

- same transcript,
- same tool call states,
- same plan state,
- same queue/task state,
- no duplicate messages,
- no leaked internal metadata,
- late updates attached/quarantined consistently.

These are the tests that make the architecture provable.

#### Ring 4: UI rendering tests

Focused silvery tests for:

- queue entries,
- plan drawer,
- active subagents drawer,
- background task panel,
- tool call terminal output,
- permission prompt,
- transcript leaves from canonical projection.

Keep UI tests downstream of projection fixtures so they do not become provider lifecycle tests.

#### Ring 5: process/e2e tests with fake providers

Spawn real subprocesses, but fake the provider:

- fake ACP server with scripted cases,
- fake Claude stream-json process,
- fake Codex event stream,
- provider exits early,
- provider emits non-JSON stdout,
- provider hangs,
- provider sends late events,
- provider sends duplicate final messages.

This catches stdio/process bugs without live model cost.

#### Ring 6: opt-in live smoke tests

Small, expensive, explicitly gated:

- real Claude ACP smoke,
- real Codex ACP smoke,
- real opencode/Gemini ACP smoke if installed,
- live subagent probe when credentials permit,
- live resume/load smoke,
- live permission/cancel smoke.

Run nightly or manually, not on every local change.

### Tests that matter most for the current silvercode weakness

The most valuable tests for the queue/output gate refactor are:

1. Prompt result before final update.
2. Final update after prompt result inside drain window.
3. Tool update after prompt result inside drain window.
4. Generic status update must not ack/flush a queued prompt.
5. ACP no-queueing driver rejects or host-queues concurrent prompt.
6. Claude queueing driver accepts concurrent prompt only after UUID handoff.
7. Cancel resolves pending permissions.
8. Cancel followed by prompt does not inherit stale busy state.
9. Provider process death transitions active request to `lost` or `failed`.
10. Replay of raw log rebuilds the same queue/request/task projection.

### Tests that matter most for subagent support

1. Claude Task tool start creates `SubagentRun`.
2. Claude Task result terminalizes the matching run by tool id.
3. Claude Task failure terminalizes as failed.
4. Codex background/collab event creates/updates subagent run.
5. ACP child session spawn returns task id and child session id.
6. Child completion delivery is idempotent.
7. Parent busy with no steering queues completion.
8. Parent active with steering injects completion.
9. Cancel child does not kill parent unless driver only supports whole-session cancel and reports that limitation.
10. Restart recovery marks missing child backing state as `lost`.

---

## Elegance and robustness ranking

### Most elegant architecture

1. **ACPX**
   - Cleanest separation of owner, request lifecycle, raw protocol stream, runtime state, and output formatting.
   - The data-driven conformance suite reinforces the architecture instead of merely testing functions.

2. **Codex ACP**
   - Elegant inside the adapter: actor-like thread loop, prompt-local state, oneshot responses, and careful event mapping.
   - Strong handling of streaming dedupe, parallel tool calls, and blocked permissions.

3. **Claude Agent ACP**
   - Elegant where Claude is hard: provider queue handoff by UUID, TodoWrite/terminal/task mapping, pure stdout discipline.
   - More provider-specific and less generally architectural than ACPX.

4. **Agent Shell**
   - Elegant host UI/debug model: traffic logging, replay, stale update handling, block-aware prompt mentions.
   - Less of a runtime architecture reference.

5. **acp-plugin**
   - Simple and useful, but not an L5 architecture reference.

### Most battle-tested / robust-looking

1. **OpenClaw**
   - By far the broadest operational test setup: unit, e2e, live, Docker, package acceptance, provider lanes, channel delivery, subagent hooks, upgrade survivor.
   - Strongest background/subagent/task operational story.
   - It is large and complex, so it is not the elegance winner, but it is the robustness reference.

2. **ACPX**
   - Best focused robustness for ACP runtime/client behavior.
   - Queue owner, leases, IPC, conformance, replay, persistence, and prompt lifecycle are directly relevant.

3. **Codex ACP**
   - Robust adapter internals for one provider; good tests around common deadlocks/duplication.
   - Less broad than ACPX/OpenClaw.

4. **Claude Agent ACP**
   - Good wrapper regression suite and integration gate.
   - Handles many hard Claude-specific cases, but the testing story is less comprehensive than ACPX/OpenClaw.

5. **Agent Shell**
   - Likely useful in real editor use and excellent for diagnostics, but automated lifecycle coverage is lighter.

6. **acp-plugin**
   - Good baseline and e2e smoke, not enough to prove hard lifecycle behavior.

### What silvercode should emulate

Use a hybrid:

- **ACPX for protocol conformance and session owner architecture.**
- **OpenClaw for background/subagent/task/recovery/live operational testing.**
- **Codex ACP for prompt-state unit tests.**
- **Claude Agent ACP for provider-specific marshalling regressions.**
- **Agent Shell for traffic/replay/debug UX.**

The silvercode-specific bar should be: every queue/background/subagent bug must be reproducible from a small raw-protocol fixture plus runtime log, without a live provider.

---

## Current silvercode model

### Prompt queue and output gate

Current shape:

- `queues` is `Map<string, string>`.
- Multiple queued prompts are joined with `\n\n`.
- `outboundTurns` tracks locally optimistic sends waiting for backend ack.
- `canSubmitNow(handle)` combines:
  - store status (`idle`, `ended`, `thinking`, `tool-running`),
  - ACP vs non-ACP behavior,
  - outbound ack state.
- ACP sessions are effectively single-flight.
- Non-ACP sessions can accept while `thinking`/`tool-running` after ack.
- `isOutboundAckEvent(event)` treats many event kinds as "backend ack".
- Queue flush happens when ack/status conditions look safe.

Interpretation:

The gate is a useful shim, but it is not an authoritative output gate. It relies on projected transcript/store status and a broad ack list. This is the "fickle state machine" feeling: the control plane is inferred from UI-adjacent state.

### ACP client

Current shape:

- `prompt(content)` exists and returns `Promise<PromptResponse>`.
- Legacy `send(text)` still exists and is the controller-facing path.
- ACP has no separate durable wire-level turn id, so `acp-client.ts` wraps `agent.prompt()` with local `turn-start` / `turn-end`.
- There is a stuck-turn watchdog and late straggler handling.
- Non-JSON stdout lines are filtered before JSON-RPC parse.
- ACP `SessionUpdate`s are mapped down to legacy `AgentEvent`s.

Interpretation:

The ACP client is doing important reliability work, but the controller is not taking full advantage of its result promise. The legacy event path also loses information.

### Streaming blocks

Current shape:

- ACP content block types are modeled locally.
- Legacy `AgentEvent` supports text, thinking, tool_use, tool_result, image-ish raw content.
- ACP `agent_message_chunk` with text maps to `text-delta`.
- ACP `agent_thought_chunk` with text maps to `thinking-delta`.
- ACP non-text message chunks often degrade into `status`/diagnostic events.
- `_meta` is stripped or not preserved in enough paths.
- Tool calls map reasonably well, but terminal metadata and diff/content richness are not canonical end-to-end.

Interpretation:

The canonical store needs to be ACP-shaped first, with legacy projections derived from it. Non-text content and `_meta` should not disappear at the runtime boundary.

### Plans and todos

Current shape:

- Legacy `AgentEvent` has `plan-update` with `entries`.
- `AgentPlan` includes source, version, status, entries, order, priority, parentId, timestamps, and source refs.
- `TodoWrite` and provider `update_plan` are normalized into plans.
- ACP `plan` maps to `plan-update`.
- `todos` are a compatibility projection.
- Chat projection stores `plan.updated`, then renders a plan update leaf and bottom plan drawer.

Interpretation:

Plans are one of the stronger current areas. The missing piece is a durable plan/step ledger with identity/provenance across snapshots and a clear relationship to tasks/jobs. The UI already understands step statuses, but the runtime does not treat plan steps as first-class lifecycle objects.

### Background jobs and subagents

Current shape:

- `BackgroundJob` exists in the controller.
- Synthetic Ctrl-B style backgrounding is disabled.
- Reason: assistant message/turn ids were not stable provider job ids across tool-call boundaries.
- `backgroundActiveJob()` is a no-op.
- `interruptActiveJob()` locally applies synthetic `turn-end` and drops later stream chunks for that interrupted turn.
- `cancelBackgroundJob()` marks local job state but cannot cancel a provider turn.
- Subagent adapter watches `Task`/`Agent` tool-use and tool-result events and emits notification events.
- Claude subagent session discovery reads `~/.claude/.../subagents` transcript metadata.

Interpretation:

silvercode has notification-level subagent awareness, not runtime-owned background agents. The correct next model is a task/job registry backed by provider-native job ids, child session ids, or explicit driver-owned run ids.

---

## Subagent support

Subagents need to be modeled as more than tool-call rows and more than notifications. A subagent is detached or semi-detached agent work with its own identity, lifecycle, transcript, permissions, delivery behavior, and parent relationship.

### Provider shapes

Known provider shapes:

- **Claude Code Task / Agent tool**
  - Parent model invokes `Task` or `Agent`.
  - Claude creates an opaque child/subagent run.
  - Parent stream sees a tool call and final tool result.
  - Claude may also write subagent transcript metadata under the parent session's `subagents/` directory.
  - `claude-agent-acp` maps Task/Agent as tool calls and treats task-notification followups as autonomous work separate from the user prompt lifecycle.

- **Codex background / collab events**
  - Codex's event stream has background and collaboration-agent event families.
  - `codex-acp` currently ignores these with TODO comments.
  - A robust host should map them to subagent/background task activity instead of dropping them.

- **ACP child session / background prompt**
  - ACP itself is primarily one client/agent session, but runtimes like ACPX/OpenClaw build background prompt and child session semantics above it.
  - This is the right shape for silvercode-owned subagents: explicit child session plus task registry record.

- **OpenClaw parent-owned subagent**
  - Parent spawns child session.
  - Spawn returns immediately with a run id.
  - Child completion is pushed back to requester.
  - Completion delivery is idempotent and can wake/steer/queue into the parent.
  - Lost/stale children are audited and transitioned to `lost`.

### Current silvercode subagent behavior

Current behavior is useful but shallow:

- `src/notification-adapters/subagent.ts` watches `Task` and `Agent` tool-use/tool-result.
- It emits `source: "subagent"` notifications for `started`, `completed`, and `failed`.
- It correlates start/result by `tool_use_id`.
- It carries description, agent label, summary, source session id, and tool use id.
- `src/claude-subagent-sessions.ts` can discover Claude subagent transcript metadata on disk.
- The chat/notification UI can show activity, but the runtime does not own the child run.

This means silvercode cannot yet:

- Cancel a specific subagent through a runtime handle.
- Route followup messages into a subagent session.
- Prove a child run's terminal state after restart.
- Distinguish a provider-native child session from a plain long-running tool call.
- Retry or dedupe completion delivery.
- Apply separate concurrency caps to subagents.

### Target subagent model

Use two related entities:

1. `BackgroundTask`: the activity ledger record.
2. `SubagentRun`: the agent-specific child-run/session record.

```ts
type SubagentRun = {
  subagentRunId: string
  taskId: string
  parentSessionId: string
  parentRequestId?: string
  parentToolCallId?: string
  childSessionId?: string
  providerRunId?: string
  providerAgentName?: string
  agentKind: "claude-task" | "codex-collab" | "acp-child" | "silvercode-native" | "unknown"
  prompt: AcpContentBlock[]
  description: string
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | "lost"
  transcriptRef?: string
  protocolLogRef?: string
  resultSummary?: string
  resultBlocks?: StreamBlock[]
  createdAt: number
  startedAt?: number
  completedAt?: number
}
```

`BackgroundTask` answers "what detached work happened?" `SubagentRun` answers "which child agent did it and where is its transcript?"

### Subagent spawn flow

```
parent request/tool asks for subagent
  -> actor records subagent.spawn_requested
  -> BackgroundTask created: queued
  -> SubagentRun created
  -> if provider exposes child session:
       create/load child session
       store childSessionId/providerRunId
     else if provider only exposes Task tool:
       bind to parentToolCallId and discover transcript opportunistically
  -> status running
  -> child stream updates child projection/log
  -> parent receives progress notification according to policy
  -> child terminal result
  -> task/subagent terminal result
  -> delivery to parent/requester
```

### Followup routing

Subagent followup messages must be explicit. Three modes:

| Mode | Meaning | When to use |
|---|---|---|
| `parent-followup` | Message goes to the parent session as ordinary context | Default chat behavior |
| `child-followup` | Message routes to a bound child session | User is conversing with a spawned subagent |
| `management` | Message controls the run: cancel, status, show transcript, foreground | UI/task command behavior |

Never infer child routing from freeform text alone. The UI should carry a selected child session/task id, or the command should name the task.

### Parent completion delivery

Subagent completion should not be a raw provider tool result stuffed into parent chat. It should be normalized:

```ts
type SubagentCompletion = {
  taskId: string
  subagentRunId: string
  parentSessionId: string
  childSessionId?: string
  status: "succeeded" | "failed" | "timed_out" | "cancelled" | "lost"
  title: string
  summary: string
  resultBlocks: StreamBlock[]
  transcriptRef?: string
  idempotencyKey: string
}
```

Delivery policy:

- If parent is active and driver supports steering, wake/steer the completion into the parent.
- If parent is busy and steering is unsupported, queue a system event.
- If parent is idle, append a normalized completion event.
- If direct delivery fails, retry with same idempotency key.
- If duplicate completion arrives, suppress duplicate transcript insertion.

### Subagent UI surfaces

Minimum useful surfaces:

- Active subagents drawer:
  - title/description,
  - agent kind,
  - status,
  - elapsed time,
  - parent session,
  - cancel/show controls.
- Subagent transcript view:
  - child stream,
  - tool calls,
  - plan,
  - result.
- Parent transcript event:
  - started,
  - completed/failed/timed out/lost,
  - short summary,
  - link/ref to child transcript.
- Queue/task status sidebar:
  - foreground request,
  - queued prompts,
  - background tasks,
  - subagents.

### Subagent policy

Policy should be capability-driven:

- `supportsChildSessions`: can create independent child session.
- `supportsProviderSubagents`: provider emits native subagent events.
- `supportsSubagentCancel`: can cancel one child without killing parent.
- `supportsSubagentFollowup`: can route user input to the child.
- `supportsSubagentTranscript`: can expose child transcript/log.

Concurrency:

- Subagents should not consume the foreground prompt lane.
- Default separate lane/cap, e.g. `subagentConcurrency = 4` or `8`.
- Parent session should track child count and depth.
- Nesting/depth limits prevent runaway trees.

Security/safety:

- Child sessions inherit a restricted tool policy unless explicitly elevated.
- Parent-to-child context should be explicit and sanitized.
- Child-to-parent completion should be normalized; do not leak internal control envelopes into external ACP transcript.
- Thinking/tool XML/control tokens should be stripped from summarized completion messages.

Recovery:

- On restart, reconcile task registry against provider child sessions and transcript refs.
- If backing state is gone beyond grace period, mark `lost`.
- If a task repeatedly reappears without terminal proof, tombstone it.
- Terminal status should never downgrade, e.g. a later "success" cannot turn an already-cancelled task into succeeded.

### Subagent acceptance criteria

L5 subagent support exists when:

- Every subagent has `taskId` and `subagentRunId`.
- Provider-native ids and child session ids are preserved when available.
- Start, progress, terminal, delivery, and cancellation are represented as runtime events.
- Parent transcript shows normalized completion, not raw internal metadata.
- Duplicate completion is idempotent.
- Restart can classify active subagents as running, terminal, or lost.
- The UI can cancel/show a specific subagent without guessing by title or tool text.
- Tests cover Claude Task, Codex background/collab events, ACP child session, unsupported provider, delivery failure, duplicate completion, parent busy, and restart recovery.

---

## Canonical runtime architecture

### Layers

```
┌──────────────────────────────────────────────────────────────┐
│ UI surfaces                                                   │
│ composer, queue editor, transcript, plan drawer, task panel   │
└───────────────────────────┬──────────────────────────────────┘
                            │ typed commands
┌───────────────────────────▼──────────────────────────────────┐
│ SessionActor / owner                                          │
│ prompt queue, active request, permissions, jobs, child runs    │
└───────────────────────────┬──────────────────────────────────┘
                            │ driver API
┌───────────────────────────▼──────────────────────────────────┐
│ ProviderDriver                                                │
│ ACP driver, Claude stream-json driver, Codex driver, fake      │
└───────────────────────────┬──────────────────────────────────┘
                            │ stdio / SDK / HTTP
┌───────────────────────────▼──────────────────────────────────┐
│ Provider process/runtime                                      │
│ claude, codex, gemini, opencode, zed ACP agent, fake server    │
└──────────────────────────────────────────────────────────────┘
```

### Ledgers

Keep these separate:

1. **Protocol ledger**
   - Raw ACP JSON-RPC messages or raw provider stream events.
   - Append-only.
   - Used for replay, audits, conformance, vendor bug reports.

2. **Runtime ledger**
   - Local control-plane events:
     - request accepted,
     - queued,
     - started,
     - prompt result,
     - cancel requested,
     - permission resolved,
     - backgrounded,
     - child spawned,
     - delivery attempted,
     - orphan recovered.
   - This is not sent to the provider as transcript.

3. **Projection store**
   - Transcript messages.
   - Streaming block grouping.
   - Tool calls.
   - Plans.
   - Jobs/tasks.
   - UI status.
   - Rebuildable from ledgers.

### SessionActor API sketch

```ts
type PromptMode = "normal" | "followup" | "steer" | "interrupt"

interface SessionActor {
  enqueuePrompt(request: PromptRequest, opts?: PromptOptions): TurnHandle
  steer(request: SteeringRequest): Promise<SteerResult>
  cancel(target?: RequestId | JobId | "active" | "queued"): Promise<CancelResult>
  respondPermission(id: PermissionRequestId, outcome: PermissionOutcome): Promise<void>
  setMode(modeId: string): Promise<ModeResult>
  setConfig(optionId: string, value: unknown): Promise<ConfigResult>
  background(target?: RequestId | "active", opts?: BackgroundOptions): Promise<JobHandle>
  spawnChild(request: SpawnChildRequest): Promise<JobHandle | ChildSessionHandle>
  close(): Promise<void>
  snapshot(): SessionRuntimeSnapshot
  events(): AsyncIterable<RuntimeEvent>
}

interface TurnHandle {
  requestId: RequestId
  localTurnId: LocalTurnId
  providerTurnId?: string
  status(): PromptRequestStatus
  events: AsyncIterable<RuntimeEvent>
  result: Promise<PromptResult>
  cancel(): Promise<CancelResult>
  background(): Promise<JobHandle>
}
```

### ProviderDriver API sketch

```ts
interface ProviderDriver {
  readonly capabilities: DriverCapabilities
  initialize(): Promise<InitializeResult>
  newSession(opts: NewSessionOptions): Promise<DriverSession>
  loadSession?(opts: LoadSessionOptions): Promise<DriverSession>
}

interface DriverSession {
  prompt(request: DriverPromptRequest): DriverPromptHandle
  cancel(target?: DriverCancelTarget): Promise<void>
  setMode?(modeId: string): Promise<void>
  setConfig?(optionId: string, value: unknown): Promise<void>
  close(): Promise<void>
}

interface DriverPromptHandle {
  providerRequestId?: string
  providerTurnId?: string
  updates: AsyncIterable<ProviderUpdate>
  result: Promise<PromptResult>
}
```

### Driver capabilities

```ts
interface DriverCapabilities {
  promptQueueing: "none" | "provider" | "host"
  structuredPromptBlocks: boolean
  loadSession: boolean
  listSessions: boolean
  closeSession: boolean
  forkSession: boolean
  terminalOutput: boolean
  toolDiffs: boolean
  planSnapshots: boolean
  modeSwitching: boolean
  configOptions: boolean
  promptSteering: boolean
  backgroundPrompt: boolean
  childSessions: boolean
  providerTurnIds: boolean
}
```

Capabilities decide behavior. UI status should not.

---

## Core flows

### Prompt submit

```
UI composer
  -> actor.enqueuePrompt({ contentBlocks, attachments, clientRequestId })
  -> runtime log: prompt.accepted
  -> if actor idle: start immediately
  -> else if driver promptQueueing=provider: hand off to driver queue
  -> else host queue
  -> driver.prompt(...)
  -> runtime log: prompt.started
  -> provider updates stream into protocol ledger
  -> projection updates transcript/tool/plan/status
  -> driver prompt result resolves
  -> actor enters drain window
  -> actor terminal result: completed/cancelled/failed
  -> actor starts next queued prompt
```

### Output gate

The output gate should be:

```
actor.activeRequest == null
  OR activeRequest.acceptsFollowup == true
  OR request.mode == "steer" and driver.capabilities.promptSteering
```

It should not be:

```
store.state.status in ["idle", "ended"]
  plus no outbound ack
  plus "event kind looked like ack"
```

Status is projection; request state is authority.

### Provider queue handoff

For Claude-like provider queueing:

1. Host assigns `requestId`.
2. Driver embeds a provider-visible UUID/message marker.
3. Prompt is pushed to provider input while current prompt runs.
4. Driver resolves "accepted/handoff" only when provider echoes/replays that UUID.
5. The next prompt's lifecycle starts from that provider handoff.

This prevents a false flush on generic output.

### Steering

Steering is not the same as queueing a followup.

```
steer request
  -> actor records steer.intent
  -> if driver supports runtime steer: inject at model/tool boundary
  -> else policy:
       fallback to followup
       or reject with unsupported
       or interrupt+restart
```

OpenClaw's lane/steer model is the best reference here.

### Cancellation

```
user cancels active request
  -> actor marks cancel requested
  -> driver.cancel(active)
  -> actor resolves pending permission requests as cancelled
  -> projection marks non-terminal tools as cancelled
  -> accept late provider updates until prompt result
  -> driver result must be cancelled or mapped to cancelled
  -> actor terminal: cancelled
```

If driver only supports whole-session cancellation, the runtime must say so and choose between session close, local interrupt, or unsupported.

### Permission request

```
provider requests permission
  -> actor creates PermissionRequest record
  -> projection renders permission UI
  -> user decision
  -> actor.respondPermission(...)
  -> driver resolves JSON-RPC request / legacy callback
  -> projection records decision
```

Permission requests must be scoped to request/tool/session and cancelled with the prompt.

### Streaming block marshalling

```
ProviderUpdate
  -> canonical SessionUpdate / ProviderUpdate store
  -> block projection
  -> chat leaves / transcript spans
```

Rules:

- Preserve non-text content blocks.
- Preserve `_meta`.
- Preserve `toolCallId`.
- Preserve provider event ids and provider turn ids when available.
- Group adjacent text chunks only in projection.
- Deduplicate final whole-message events against prior streaming deltas.
- Late updates after prompt result attach to the closed request during drain window; after drain, quarantine as late diagnostics.

### Plan update

```
provider plan snapshot
  -> PlanSnapshot { planId, version, source, entries, provenance }
  -> replace current plan snapshot
  -> derive changed step ids
  -> update plan drawer and timeline leaf
```

ACP requires complete replacement. If a driver sends deltas, normalize to complete snapshots before projection.

### Background child agent

```
user/agent requests child background work
  -> actor.spawnChild(...)
  -> BackgroundTaskRegistry creates task queued
  -> child session created
  -> task running
  -> child emits stream to its own protocol/runtime logs
  -> parent gets summarized progress or no progress depending policy
  -> child completes
  -> task terminal: succeeded/failed/timed_out/cancelled/lost
  -> delivery:
       if parent active and steering supported: steer/wake
       else queue system event
       else direct channel/notification if configured
```

Completion delivery needs idempotency keys so retries do not duplicate parent transcript output.

---

## Data model proposal

### Runtime session

```ts
type RuntimeSession = {
  localSessionId: string
  acpSessionId?: string
  providerSessionId?: string
  cwd: string
  driverId: string
  status: RuntimeSessionStatus
  activeRequestId?: string
  queueDepth: number
  activeJobIds: string[]
  childSessionIds: string[]
  createdAt: number
  updatedAt: number
}
```

### Prompt request

```ts
type PromptRequest = {
  requestId: string
  localTurnId: string
  providerRequestId?: string
  providerTurnId?: string
  sessionId: string
  content: AcpContentBlock[]
  mode: "normal" | "followup" | "steer" | "interrupt"
  status:
    | "accepted"
    | "queued"
    | "starting"
    | "active"
    | "draining"
    | "completed"
    | "cancelled"
    | "failed"
    | "lost"
  stopReason?: string
  error?: RuntimeError
  createdAt: number
  startedAt?: number
  completedAt?: number
}
```

### Streaming block

```ts
type StreamBlock = {
  blockId: string
  requestId?: string
  messageId?: string
  providerEventId?: string
  kind:
    | "user_text"
    | "assistant_text"
    | "thought"
    | "image"
    | "audio"
    | "resource"
    | "resource_link"
    | "tool_call"
    | "tool_update"
    | "plan"
    | "usage"
    | "status"
  content: unknown
  meta?: Record<string, unknown>
  ts: number
}
```

### Tool call

```ts
type RuntimeToolCall = {
  toolCallId: string
  requestId?: string
  parentToolCallId?: string
  title: string
  kind: "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "other"
  status: "pending" | "in_progress" | "completed" | "failed" | "cancelled"
  content: ToolCallContent[]
  locations: ToolLocation[]
  rawInput?: unknown
  rawOutput?: unknown
  terminalId?: string
  createdAt: number
  updatedAt: number
  completedAt?: number
}
```

### Plan and step

```ts
type RuntimePlan = {
  planId: string
  sessionId: string
  requestId?: string
  source: "acp-plan" | "claude-todowrite" | "codex-plan" | "opencode-plan" | "manual"
  version: number
  status: "active" | "completed" | "abandoned"
  entries: RuntimePlanEntry[]
  provenance: PlanProvenance
  updatedAt: number
}

type RuntimePlanEntry = {
  stepId: string
  providerEntryId?: string
  content: string
  activeForm?: string
  priority: "high" | "medium" | "low"
  status: "pending" | "in_progress" | "completed" | "cancelled"
  parentStepId?: string
  order: number
  startedAt?: number
  completedAt?: number
}
```

### Background task

```ts
type BackgroundTask = {
  taskId: string
  runId?: string
  source: "user-background" | "subagent" | "acp-background" | "provider-task" | "cron" | "cli"
  parentSessionId: string
  childSessionId?: string
  sourceRequestId?: string
  sourceToolCallId?: string
  title: string
  status: "queued" | "running" | "succeeded" | "failed" | "timed_out" | "cancelled" | "lost"
  notifyPolicy: "done_only" | "state_changes" | "silent"
  delivery: DeliveryState
  transcriptRef?: string
  protocolLogRef?: string
  runtimeLogRef?: string
  idempotencyKey: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  error?: RuntimeError
}
```

### Delivery

```ts
type DeliveryState = {
  status: "pending" | "delivered" | "retrying" | "failed" | "silent"
  target: "parent-session" | "direct-channel" | "notification" | "none"
  attempts: number
  lastAttemptAt?: number
  deliveredAt?: number
  error?: RuntimeError
}
```

---

## State machines

### Prompt request

```
accepted
  -> queued
  -> starting
  -> active
  -> draining
  -> completed

active -> cancelling -> cancelled
active -> failed
queued -> cancelled
starting -> failed
draining -> failed      # rare, e.g. protocol parse failure during drain
active -> lost          # owner/provider died without terminal result
queued -> lost          # owner recovery cannot prove request ownership
```

### Tool call

```
pending
  -> in_progress
  -> completed

pending -> failed
in_progress -> failed
pending -> cancelled     # client-synthesized on prompt cancel
in_progress -> cancelled # client-synthesized on prompt cancel
```

### Plan

```
none
  -> active
  -> completed

active -> abandoned      # new incompatible plan or session end without completion
active -> active         # replacement snapshot
```

Step status:

```
pending -> in_progress -> completed
pending -> completed     # provider may skip explicit in_progress
pending -> cancelled
in_progress -> cancelled
```

### Background task

```
queued -> running -> succeeded
queued -> cancelled
queued -> lost
running -> failed
running -> timed_out
running -> cancelled
running -> lost
```

### Delivery

```
pending -> delivered
pending -> retrying -> delivered
retrying -> failed
pending -> silent
```

---

## Gap analysis against L5

| Area | Current | Gap | L5 target |
|---|---|---|---|
| Session ownership | Controller, session, store, reducer all participate | No single owner for provider writes/control | One `SessionActor` per session |
| Queue model | String buffer and controller status gate | No typed request IDs/results | Typed prompt queue with request handles |
| Output gate | Ack-event heuristic + projected status | Can wedge or flush on wrong signal | Gate from active request state and driver capabilities |
| ACP prompt result | `prompt()` exists but controller uses legacy send semantics | Terminal result underused | Actor awaits driver result and drain |
| Turns | Synthetic local turns in ACP client; legacy `TurnId` presentation-ish | Cross-provider ambiguity | Request id as lifecycle authority; provider turn id preserved when present |
| Streaming blocks | Legacy mapping loses non-text and `_meta` | Rich ACP content cannot be replayed faithfully | Canonical ACP-shaped update store |
| Tool calls | Good rendering, partial canonical model | Terminal/diff/meta not fully preserved | Tool call ledger with content/diff/terminal |
| Plans | Strong reducer; UI drawer exists | No durable plan/step ledger or changed-step tracking as control data | Versioned plan snapshots and step provenance |
| Permissions | Existing UI and event path | Not actor-owned/cancel-scoped enough | Actor-scoped permission records |
| Backgrounding | Disabled no-op for active job; local storage remains | No provider/native job identity | BackgroundTaskRegistry with real run/child ids |
| Subagents | Notifications from Task/Agent tool events | Not owned tasks; no child session control | Subagent jobs/child sessions with delivery/cancel/recovery |
| Persistence | Session logs/projections; not raw protocol as authority | Hard to prove/replay provider behavior | Raw protocol ledger + runtime ledger |
| Observability | Debug logs and tests | No traffic viewer/replay | Traffic viewer/export/replay/conformance |
| Conformance | Many focused tests | No external backend conformance matrix | ACP wrapper/client-host conformance suite |

---

## L5 implementation plan

### Phase 0: Decision record and statecharts

Deliverables:

- Hub/ADR draft for `SessionActor` and runtime IDs.
- Statecharts for prompt, tool, plan, task, delivery.
- Driver capability matrix.
- Conformance matrix.

Exit criteria:

- The team agrees on terms: session/request/turn/job/task/plan/step/tool.
- No code needs to infer runtime writability from chat projection status.

### Phase 1: Introduce `SessionActor` behind current controller

Deliverables:

- `runtime/SessionActor` wrapper around existing `AgentSession`.
- Typed `RuntimeEvent`.
- Typed `PromptRequest`.
- No behavior change in UI.

Exit criteria:

- Existing tests still pass.
- Every call to provider send goes through actor internals.

### Phase 2: Replace string queue with typed queue

Deliverables:

- `PromptQueue` with entries, ids, content blocks, createdAt, status.
- Queue UI reads typed entries.
- `popQueueHead` and `\n\n` joining removed or compatibility-only.

Exit criteria:

- Queue tests assert request ids and terminal outcomes.
- No prompt is merged with another unless user explicitly asks for batching.

### Phase 3: Move output gate to actor

Deliverables:

- Actor starts next prompt only after active request reaches terminal/drained or provider handoff proves acceptance.
- Controller `outboundTurns`, `isOutboundAckEvent`, and `canSubmitNow` become obsolete.

Exit criteria:

- ACP and non-ACP behavior both pass same queue conformance cases.
- Busy UI status can be wrong without corrupting prompt lifecycle.

### Phase 4: Canonical streaming update store

Deliverables:

- Store raw ACP `SessionUpdate` or provider-equivalent update as canonical.
- Preserve image/audio/resource/resource_link/diff/terminal/meta.
- Legacy `AgentEvent` becomes projection for old surfaces.

Exit criteria:

- Structured prompt blocks round-trip in tests.
- Non-text chunks do not degrade to generic status except at explicit lossy boundaries.

### Phase 5: Plan/step ledger

Deliverables:

- `RuntimePlanStore` with versioned snapshots.
- Step identity/provenance/change detection.
- Chat leaves include changed step ids, not just count.
- Plan drawer can show active/pending/completed/cancelled accurately.

Exit criteria:

- ACP plan replacement semantics tested.
- Claude TodoWrite and Codex update_plan both produce same canonical plan model.

### Phase 6: Background task/subagent registry

Deliverables:

- `BackgroundTaskRegistry`.
- Driver capability for background prompt or child sessions.
- Claude Task/Agent tool events create task records with tool-call provenance.
- Provider-native Codex background/collab events map to task/subagent activities when available.
- Delivery policy and idempotency keys.

Exit criteria:

- `backgroundActiveJob()` is either supported with a real provider/driver id or explicitly unavailable by capability.
- Cancelling a task has a clear provider effect or returns unsupported.
- Restart/lost recovery tests exist.

### Phase 7: Persistence, replay, conformance

Deliverables:

- Raw protocol log.
- Runtime event log.
- Replay tool/viewer.
- Fake ACP servers for conformance.
- Fixture cases borrowed from ACPX patterns:
  - structured prompt blocks,
  - late post-success updates,
  - cancel with pending permission,
  - provider stdout noise,
  - provider crash,
  - prompt queue handoff,
  - background child completion,
  - duplicate final message after deltas.

Exit criteria:

- A bug report can include raw traffic + runtime log + projection snapshot.
- Projections are rebuildable.

### Phase 8: Reference docs and proof

Deliverables:

- Public-ish architecture doc after `/arch` acceptance.
- Backend capability matrix.
- Conformance scorecard per backend.
- "Why this cannot wedge" invariants.

Exit criteria:

- The architecture is referencable/provable, not just elegant in code.

---

## Invariants for a robust runtime

1. Only the session actor writes to the provider.
2. Every accepted prompt has a `requestId`.
3. Every accepted prompt reaches terminal state or bounded `lost`.
4. Prompt queue state is typed and inspectable.
5. UI status never controls provider writes directly.
6. Provider capabilities decide whether queueing, steering, backgrounding, and child sessions are supported.
7. Raw protocol events are preserved before lossy projection.
8. Runtime control events are not mixed into provider transcript.
9. Plans are replacement snapshots, not text decorations.
10. Tool calls are merged by `toolCallId`, not display order.
11. Permission requests are request/tool scoped and cancel with the prompt.
12. Background jobs are keyed by job/run/child-session ids, not assistant message ids.
13. Completion delivery is idempotent.
14. Late updates are attached during drain or quarantined after drain.
15. Replaying protocol + runtime ledgers rebuilds the same projection.

---

## Corner cases to test

### Queue / prompt lifecycle

- Prompt submitted while idle.
- Prompt submitted while active and driver has no queueing.
- Prompt submitted while active and driver has provider queueing.
- Provider accepts queued prompt but current turn has not ended.
- Provider emits user echo without UUID/handoff marker.
- Prompt result arrives before final text chunk.
- Final text chunk arrives after prompt result during drain.
- Tool update arrives after prompt result during drain.
- Update arrives after drain window.
- Provider emits duplicate final whole-message after text deltas.
- Provider emits status noise but no meaningful ack.
- Provider exits before ack.
- Provider exits after ack before result.
- Host restarts with queued prompts.

### Streaming blocks

- Text, image, audio, resource, resource_link prompt blocks.
- Agent sends non-text message chunk.
- Thought chunks interleave with text chunks.
- Tool diff arrives before tool title.
- Terminal output arrives before terminal tool call content.
- `_meta.terminal_output` / `_meta.terminal_exit` preserved.
- Unknown `_meta` preserved and hidden from normal UI.
- Raw provider update cannot be parsed into known shape.

### Plans/steps/tasks

- ACP plan snapshot replaces prior entries.
- Plan entry removed in later snapshot.
- Plan entry text changes but provider id stable.
- Provider sends duplicate step ids.
- Claude TodoWrite with `activeForm`.
- Codex update_plan with pending/in_progress/completed.
- All steps completed clears compatibility todos.
- Cancelled step remains visible in plan history but not active todos.
- Plan update after prompt terminal during drain.

### Permissions

- Permission request while active.
- Prompt cancelled while permission request pending.
- Permission response arrives after cancel.
- Provider asks permission for unknown tool id.
- Multiple permission requests in one prompt.

### Background/subagents

- User backgrounds active provider-supported prompt.
- User attempts background on unsupported driver.
- Claude Task tool starts and completes.
- Claude Task tool fails.
- Child session completes while parent active.
- Child session completes while parent idle.
- Completion delivery fails and retries.
- Duplicate completion delivery suppressed by idempotency key.
- Child session lost after restart.
- Running child times out.
- Parent cancel cascades to children.
- Bound child followup routes to child session, not parent.

---

## Recommended next doc split

This reference is intentionally broad. If this line of work becomes active, split it into:

1. `agent-runtime-statecharts.md`
2. `provider-driver-contract.md`
3. `streaming-block-marshalling.md`
4. `plans-steps-tasks-model.md`
5. `background-agent-runtime.md`
6. `acp-conformance-scorecard.md`

Only promote any of those out of `hub/` after `/arch` and implementation proof.

---

## Open questions

1. Should silvercode store raw ACP traffic per session by default, or only under debug?
2. Should the actor live in `apps/silvercode/src/runtime` first, or in `packages/agent-harness`?
3. Should legacy stream-json Claude be modeled as a `ProviderDriver`, or should Claude always go through ACP once the wrapper is stable?
4. How much of OpenClaw's background task model belongs in silvercode versus a shared km runtime?
5. Should plan steps become actionable tasks in km/beads, or remain session-local unless promoted?
6. What is the correct user-visible vocabulary: "queued prompt", "turn", "task", "job", "subagent", "run"?
7. How long should the post-result drain window be, and should it be capability-specific?
8. Do we need a durable local owner process like ACPX, or is an in-process actor enough for silvercode v1?

---

## Bottom line

The architecture that survives the corner cases is not a bigger state machine in the controller. It is a smaller controller and a stronger runtime owner.

The controller should not decide whether the backend can accept output by reading chat status. The actor should know whether it has an active request, whether the driver supports provider queueing or steering, whether pending permissions exist, whether the active request has a terminal result, and whether late updates are still inside the drain window.

The same principle applies to plans and background agents. Plans are snapshots with step statuses, not text summaries. Background agents are tasks with child sessions and delivery state, not transcript decorations. Once those entities are explicit, most of the current fickleness has nowhere to hide.
