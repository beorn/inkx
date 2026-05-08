---
aliases:
  - km-silvercode.agent-host-l5.04-chat-thread-projection
  - km-silvercode-agent-host-l5-04-chat-thread-projection
created_at: 2026-05-08T06:22:27.641Z
---

# [/] Chat thread projection and UI cutover #feature #P0

Make ChatTree/ChatTrack projection the production transcript path. Migrate from legacy MessageEntry/SessionUpdateList ownership, rename channel to Track, reasoning UI content to Thought, and Chat.Narration to Chat.Message/Chat.Thought.

Chunk reconciliation is in scope. Provider stream chunks are bytes/deltas, not paragraphs or UI blocks; normalization must reconcile streamed deltas, aggregate blocks, replay rows, thought chunks, tool interruptions, and provider-specific boundaries into canonical Message/Block/Thought events before projection.

