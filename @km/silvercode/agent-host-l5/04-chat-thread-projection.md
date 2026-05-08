---
aliases:
  - km-silvercode.agent-host-l5.04-chat-thread-projection
  - km-silvercode-agent-host-l5-04-chat-thread-projection
created_at: 2026-05-08T06:22:27.641Z
---

# [/] Chat thread projection and UI cutover #feature #P0 @agent/3

Make ChatTree/ChatTrack projection the production transcript path. Migrate from legacy MessageEntry/SessionUpdateList ownership, rename channel to Track, reasoning UI content to Thought, and Chat.Narration to Chat.Message/Chat.Thought.

Chunk reconciliation is in scope. Provider stream chunks are bytes/deltas, not paragraphs or UI blocks; normalization must reconcile streamed deltas, aggregate blocks, replay rows, thought chunks, tool interruptions, and provider-specific boundaries into canonical Message/Block/Thought events before projection.

## Ownership

This phase owns the display model:

- Provider chunks normalize into canonical stream/block events before UI projection.
- ChatTree is the source of transcript truth.
- ChatTrack is the projection/filter surface. Protocol channels remain provider input details only.
- `Message`, `Block`, `Thought`, `Tool`, `Plan`, `Job`, and `SubagentRun` leaves are produced by projection, not renderer inference.

## Complete Criteria

- ChatPane renders from ChatTree/ChatTrack, not `SessionUpdateList` or `MessageEntry`.
- Chunk reconciliation tests cover split markdown links, split code fences, thought deltas, tool interruption, duplicate ids, late completion, replay rows, and provider-specific block boundaries.
- Global naming greps from the L5 parent pass for projection code, with provider-boundary exceptions documented.
