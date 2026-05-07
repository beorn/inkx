---
aliases:
  - km-silvercode.local-agent-subsessions
  - km-silvercode-local-agent-subsessions
created_at: 2026-05-07T00:31:55.001Z
---

# [ ] Local-agent sub-session view and navigation @km/silvercode #feature #P0

Enable Claude-Code-style local-agent sub-session viewing in Silvercode.

Problem: local agents/sub-agents are currently only visible as running Agent/Task tool-call chips or notifications. Claude Code persists each local agent as a child sidechain transcript under the parent session and lets the user arrow through main + local agents, then Enter to view that agent's transcript in the chat pane. Silvercode needs the same model and navigation.

Model direction:

- Extend SessionHandle with child local-agent sub-sessions, e.g. `subsessions: ReadSignal<readonly SubSessionSummary[]>` plus lazy `loadSubSession(id): Promise<SubSessionHandle>`.
- Use `SubSessionHandle` casing. A SubSessionHandle is a child conversation, not a top-level process session.
- Represent selected transcript separately from process ownership: keep `activeSessionId` for the parent AgentSession, and add a selected/viewed conversation target like `{ kind: "main", sessionId } | { kind: "subsession", sessionId, subSessionId }`.
- Composer/input continues to target the parent SessionHandle unless a later feature explicitly supports messaging a sub-session.

Transcript / persistence direction:

- Discover sub-session summaries without eagerly parsing every child transcript. Sources include parent Agent/Task tool-use records, async launch tool results, task notifications, and Claude sidechain files such as `<sessionId>/subagents/<agentId>.meta.json` and `<sessionId>/subagents/<agentId>.jsonl`.
- Load an individual sub-session transcript on demand into a SessionStore when selected/viewed, then cache the SubSessionHandle.
- Handle Claude JSONL sidechain shape: `isSidechain: true`, same parent `sessionId`, per-row `agentId`, optional `slug`, and `.meta.json` fields like `agentType` and `description`.
- For live running local agents, keep the summary/status fresh and append/tail events into the loaded sub-session store when available.

Codex support / analysis:

- Codex local agents are separate rollout sessions, not Claude sidechain files. The parent rollout records the spawn; the child rollout is a normal Codex session keyed by its own thread/session id.
- Parent Codex transcript/live stream exposes local-agent creation through `event_msg.collab_agent_spawn_end` with fields such as `call_id`, `sender_thread_id`, `new_thread_id`, `new_agent_nickname`, `new_agent_role`, `prompt`, `model`, `reasoning_effort`, and `status`.
- Child Codex rollout `session_meta.payload.source.subagent.thread_spawn` points back to the parent with `parent_thread_id`, `depth`, `agent_nickname`, and `agent_role`. This is the durable relationship for session-load discovery when the parent only has partial spawn metadata.
- Session load must support both directions: parse parent `collab_*` events into sub-session summaries, and scan Codex rollout metadata under `~/.codex/sessions/**/rollout-*.jsonl` for child sessions whose `parent_thread_id` matches the parent session id.
- Streaming must normalize Codex `--stream-json` `event_msg.collab_agent_spawn_*`, `collab_agent_interaction_*`, `collab_waiting_*`, `collab_resume_*`, and `collab_close_*` events into SubSessionSummary/status updates. The current `codex-spawn.ts` stream stub only maps generic text/status and is not enough.
- Lazy load a selected Codex sub-session by `new_thread_id` using the same transcript-finding and replay path as normal Codex session resume, then wrap it in a SubSessionHandle attached to the parent SessionHandle.
- Summaries/status should combine parent `collab_*` status with child rollout facts when available: `task_started`, `agent_message`, `token_count`, `task_complete.last_agent_message`, and final completion state.
- Existing `codex-resume` behavior treats `collab_*` as ignored-known metadata; this must become modeled provider data without weakening strict schema handling for unknown rollout events.

UI direction:

- Add a local-agents focus/list surface matching the behavior in `~/Desktop/claude-agents.png`: rows for `main` and each local agent, arrow up/down selection, Enter to view selected transcript.
- Selecting a local agent swaps the chat transcript to that sub-session; selecting main swaps back to the parent transcript.
- Show useful row metadata: local agent type, description, running/completed status, elapsed time, and token count when available.
- Avoid overloading "focus" in the data model: distinguish keyboard focus, active process session, and selected conversation.

Acceptance criteria:

- Resuming a Claude session with subagents shows a main row plus local-agent rows without loading all child JSONL transcripts up front.
- Resuming a Codex parent rollout with `collab_agent_spawn_end` shows a main row plus local-agent rows without loading every child rollout transcript up front.
- Codex child discovery also works when only child rollout metadata is available, by matching `session_meta.payload.source.subagent.thread_spawn.parent_thread_id` to the parent session id.
- Entering a local-agent row loads and displays that sub-session transcript in the chat pane.
- Entering a Codex local-agent row loads and displays the child rollout session by `new_thread_id`.
- Returning to main restores the parent transcript and keeps the composer attached to the parent session.
- Navigation works with keyboard only and does not break existing pane focus, scroll, permissions, or queue behavior.
- Running local agents update status and final summaries as Claude task notifications or Codex `collab_*` stream events arrive.
- Codex stream-json support models live local-agent events; session-load support models persisted parent and child rollout files.
- Tests cover Claude parent+subagent transcript fixtures, Codex parent+child rollout fixtures, lazy load behavior, conversation switching, stream updates, and input routing remaining on the parent session.
