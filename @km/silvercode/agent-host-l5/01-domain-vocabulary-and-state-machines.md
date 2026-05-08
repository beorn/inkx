---
aliases:
  - km-silvercode.agent-host-l5.01-domain-vocabulary-and-state-machines
  - km-silvercode-agent-host-l5-01-domain-vocabulary-and-state-machines
created_at: 2026-05-08T06:22:19.048Z
---

# [/] Domain vocabulary and state machines #P0

Lock the domain model and names before implementation: Thread, Session, Turn, Message, Block, Thought, Track, Mention, Tool, Permission, Plan, Job, SubagentRun/Subthread. Define closed state machines and naming grep gates aligned with docs/principles.md.

## Target Vocabulary

- `Thread`: user-facing conversation/workstream, Zed-style. Owns visible history and may have one or more provider session bindings over time.
- `SessionBinding`: one provider session/process/server binding attached to a Thread.
- `Turn`: an owned runtime lifecycle around submitted work, cancel/drain/result, and quiescence.
- `Message`: user or assistant prose.
- `Block`: typed message content unit.
- `Thought`: model thought/reasoning content in Silvercode UI/domain vocabulary. Provider knobs may still say `reasoning`.
- `Track`: projection/filter lane for normal/debug/queue/system/background content. Replaces chat `channel`.
- `Mention`: typed context insertion handle.
- `Plan`, `PlanStep`: provider-normalized task/plan state.
- `Job`: background/detached work.
- `SubagentRun` or `Subthread`: child agent execution with parent provenance.

## State Machines

Define closed transition tables for `Connection`, `SessionBinding`, `Turn`, `PermissionRequest`, `PlanStep`, `ToolCall`, `Job`, and `SubagentRun`. Illegal transitions must fail focused tests or dev-mode invariants.

## Complete Criteria

- `apps/silvercode/docs` contains the canonical domain inventory in present tense.
- `rg -n "ChatChannel|ChatLeaf\\.channel|assistant-text|user-text|Chat\\.Narration|\\breasoning\\b" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs` has zero live-domain hits, except documented provider-boundary `reasoning` config/raw names.
- Every later L5 phase uses these names or links here when discussing legacy replacements.
