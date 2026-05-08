---
aliases:
  - km-silvercode.agent-host-l5.05-context-mentions-and-prompt-composition
  - km-silvercode-agent-host-l5-05-context-mentions-and-prompt-composition
created_at: 2026-05-08T06:22:31.234Z
---

# [/] Context mentions and prompt composition #feature #P1 @agent/3

Build Zed-inspired MentionUri/MentionSet semantics and a typed prompt composer for files, dirs, selections, symbols, diagnostics, threads, images, URLs, terminal selections, git diffs, ambient context, and attachments.

## Ownership

This phase owns input/context shape before it becomes a turn:

- `MentionUri` and `MentionSet` are typed and replayable.
- Prompt composition emits structured attachments/context plus display text.
- Context insertion is provider-neutral; provider parsers/adapters decide how to serialize it.
- Ambient context has provenance and token accounting.

## Complete Criteria

- Tests cover mention parsing, insertion, removal, display, serialization, and replay across fake Claude/Codex/ACP providers.
- Prompt composer tests prove structured context does not leak as user-visible assistant text or duplicate prompts.
- Provider-specific prompt formatting is quarantined at the provider boundary.
