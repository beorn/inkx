---
mentions:
  - km
id: "@km/silvercode/session-store-and-switch"
aliases:
  - km-silvercode.session-store-and-switch
  - km-silvercode-session-store-and-switch
created_by: claude:87d20187
created_at: 2026-04-28T19:07:43Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.session-store-and-switch
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T12:07:43Z
    created_by: claude:87d20187
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] ACP session store + mid-conversation agent switch with context carry-over @km/silvercode #feature #P2

blocks:: [[@km/silvercode]]

Build silvercode's session-as-first-class primitive: a persistent ACP session whose AgentInstance is replaceable mid-conversation while preserving conversation state. Closes the substrate gap for ventures #11 (gateway), #13 (coordination), #14 (agent-in-the-middle).

## Why

Today silvercode treats an ACP session and its underlying agent process as 1:1. To support the OpenACP-style mid-conversation agent switch ("start with Claude for planning, switch to Codex for implementation, switch to Gemini for review — all in one chat thread, no reconfiguration"), we need:

1. A **session store** that owns conversation history, context, permission state, IDs — independent of which agent is currently driving it
2. A **switch protocol** that atomically replaces the AgentInstance, with rollback, while threading prior context to the new agent

Without this primitive, every higher coordination feature (shared memory across agents, multi-agent rooms, agent-in-the-middle policy) is impossible.

## Reference implementation (read first)

OpenACP shipped this. `vendor/silvery/...` is not the reference — `/tmp/openacp-research-*` clone is, but the architectural notes are captured in:

- hub/silvercode/future/ai-terminal/openacp-deep-dive-2026-04-28.md (architecture + 7-step switch protocol)
- hub/silvercode/future/ai-terminal/acp-registry-support-plan.md (registry-side capability flags including supportsResume)

OpenACP's `src/core/agent-switch-handler.ts` (263 LOC, MIT) is the concrete reference for the switch protocol. Don't copy verbatim; read, then design silvercode-shaped equivalent.

## Design (initial sketch — refine in design doc)

**Session store** — persistent conversation state independent of agent process:

- `Session.id`, `Session.workingDirectory`, `Session.channelId`
- `Session.history` — append-only event log (user messages, agent responses, tool calls, permission grants)
- `Session.context` — markdown-rendered prior-conversation summary (used by switch path)
- `Session.agentName` + `Session.agentSessionId` — current agent identity
- `Session.findLastSwitchEntry(agentName)` — for resume decision
- `Session.switchAgent(toAgent, factoryFn)` — atomic replacement with rollback

**Switch protocol** (7 steps, modeled on OpenACP):

1. `agent:beforeSwitch` middleware — blocking, plugins can veto
2. Resume-vs-spawn decision — if target agent was used before in this session AND declares ACP `supportsResume` capability, reconnect to its previous subprocess; else spawn fresh
3. Bridge teardown — disconnect all SessionBridges, clear adapter-side state (skill commands, in-flight permission buttons)
4. Atomic agent replace with rollback — `session.switchAgent(toAgent, factoryFn)`; if factoryFn throws, session unchanged
5. Context injection on fresh-spawn path — `ContextManager.flushSession()` then `buildContext()` produces markdown transcript; `session.setContext(markdown)` injects as new agent's first context. `agentSwitch.labelHistory` config option marks who-said-what across boundary. **Best-effort, try/catch wrapped — switch succeeds even if context build fails.**
6. Bridge reconnect to new agent
7. `agent:afterSwitch` middleware — non-blocking, for telemetry/UI

**Concurrency**: per-session lock (`Set<sessionId>`) — second concurrent switch on same session throws.

**Eventing**: emit `AGENT_SWITCH` events with status `starting | succeeded | failed`, plus user-visible `system_message` events ("Switching from X to Y...", "Switched to Y (resumed previous session)").

## Phasing (3 phases — separate beads if grows)

**Phase 1**: session store. Persist history + context + agentName + agentSessionId. No switch yet — just prove the abstraction holds (current single-agent flow keeps working). Add tests for session lifecycle.

**Phase 2**: switch protocol. Implement 7-step flow with middleware hooks, per-session lock, atomic replace, rollback. Test happy path: switch agent A → B mid-conversation, verify B receives session.

**Phase 3**: context inject. Implement `ContextManager` (markdown transcript builder) + `session.setContext()`. Test: switch from agent A (after 5 turns) to agent B; verify B's first response shows awareness of prior turns. Wire `labelHistory` flag.

## Open questions

- How does this interact with silvercode's current Session abstraction in `apps/silvercode/src/...` ? May require refactor of existing session model.
- Does silvery's `AgentInstance` (if it exists) already declare an ACP capability surface, or does that come from the registry? Probably registry-driven; verify.
- ContextManager is best implemented as a plugin (per OpenACP) or as a core service? Lean toward core service since it's substrate.
- Should the session store be in-memory, sqlite, or markdown file (@km/_orphan/shaped)? Probably sqlite for v1 with markdown export. JSONL-as-vault-node is venture #12 — orthogonal but compatible.

## Acceptance criteria

- [ ] Session.switchAgent() implemented with atomic replace + rollback. Test: factoryFn throws → session.agentName unchanged.
- [ ] Per-session switching lock. Test: concurrent switch attempts on same session → second throws "Switch already in progress".
- [ ] `agent:beforeSwitch` and `agent:afterSwitch` middleware hooks fire in correct order. Test with mock middleware that vetoes.
- [ ] Resume path: when target agent was used previously AND declares supportsResume, reconnect to previous subprocess. Test: switch A → B → A; verify A's session resumed (not fresh spawn).
- [ ] Fresh-spawn path injects context markdown. Test: 5-turn conversation with A; switch to B; verify B receives session.context with all 5 turns.
- [ ] labelHistory config option marks turns. Test: with labelHistory=true, context has "[Claude]" and "[Codex]" prefixes.
- [ ] Context injection failure does not block switch. Test: ContextManager throws → switch still succeeds, just without context.
- [ ] Switch events emit on EventBus with correct status sequence (starting → succeeded OR starting → failed).
- [ ] /switch slash command in silvercode UI surfaces agent picker and triggers switch flow.

## /complete criteria

- `grep -rn 'switchAgent\|AgentSwitchHandler' apps/silvercode/src/` → finds implementation in `apps/silvercode/src/core/sessions/` (or wherever session lives)
- `bun vitest run apps/silvercode/tests/sessions/` → all session + switch tests pass
- `grep -rn 'supportsResume' apps/silvercode/src/` → wired to ACP capabilities
- /switch command appears in command registry and renders in UI

## Out of scope (separate beads)

- Cross-session shared memory (@km/silvercode.<TBD>-shared-memory — venture #13)
- Multi-tenant session ownership (venture #11)
- Federated/Matrix session bridge (venture #11/#12)
- JSONL session persistence as KNode files (@km/silvercode.<TBD>-session-jsonl — venture #12)

