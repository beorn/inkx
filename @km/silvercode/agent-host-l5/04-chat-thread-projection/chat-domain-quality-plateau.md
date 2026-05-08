---
aliases:
  - km-silvercode.chat-domain-quality-plateau
  - km-silvercode-chat-domain-quality-plateau
created_at: 2026-05-07T05:32:11.697Z
---

# [/] Chat domain quality plateau tracker #epic #P1 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/04-chat-thread-projection]]

This older chat-domain plateau tracker is now folded into the L5 agent-host plan. It remains as the local projection sub-epic, but the canonical vocabulary and MECE phase split live in `@km/silvercode/agent-host-l5`.

## Current Plateau Definition

The chat path reaches L5 when live rendering uses one model:

`AgentEvent -> AgentSignal/ProtocolNotification -> ChatEvent -> ChatSession -> ChatTree -> ChatTrack -> Chat.Pane`

Legacy `SessionUpdateList`, `MessageEntry`, renderer-owned grouping, chat `channel` names, and UI/domain `reasoning` names are cleanup targets, not target architecture.

## Open Projection Work

- `chunk-reconciliation-normalization`: normalize provider deltas before projection.
- `l5-canonical-event-contract`: every transcript-affecting fact has a canonical event and track.
- `l5-reactive-chat-session-store`: ChatSession is the live projected state.
- `l5-project-transcript-rules`: grouping, disclosure, width, summaries, and Debug track policy.
- `l5-chatblock-cutover`: ChatPane renders from ChatTree/ChatTrack.
- `l5-legacy-quarantine`: isolate or delete legacy transcript routing.
- `l5-visual-replay-parity`: prove projection with captured sessions.

Historical long-form notes were pruned on 2026-05-08 because they duplicated pre-L5 vocabulary. Use git history for archaeology.

## Complete Criteria

- Phase 04 complete criteria pass.
- Phase 10 cleanup beads delete the known legacy projection fossils.
- Projection tests and traffic replay cover the regressions that originally motivated this tracker: stuck thinking, prompt echo, missing/duplicated subagents, notification duplication, lifecycle marker ordering, and chunk-boundary corruption.
