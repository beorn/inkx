---
aliases:
  - km-silvercode.agent-host-l5.00-prior-art-and-feature-matrix
  - km-silvercode-agent-host-l5-00-prior-art-and-feature-matrix
created_at: 2026-05-08T06:22:16.510Z
---

# [/] Prior art and provider feature matrix #docs #P0 @agent/3

Study ACPX, Zed ACP host, Claude/Codex wrappers, ACP providers, OpenClaw/OpenACP-style systems, and background-agent models. Produce the canonical feature matrix against providers and identify which prior-art invariant Silvercode adopts, adapts, or rejects.

Prior-art gate: implementation phases should default to ACPX vocabulary/runtime invariants where they fit, use Zed for host/product concepts such as Thread/Mention/Subagent thread views, and record every divergence as adopted/adapted/rejected with a reason.

## Deliverable

A concise matrix covering:

- Thread/session/turn concepts.
- Prompt queue and turn ownership.
- Streaming block marshaling and chunk reconciliation.
- Mentions/context insertion.
- Permissions, plans/tasks, tool calls, statuses, usage, config.
- Backgrounding, jobs, subagents, child sessions/threads.
- Persistence, resume/load, traffic logs, replay/debug surfaces.
- Test setup and conformance strategy.

## Complete Criteria

- The hub reference doc has a feature matrix with ACPX, Zed ACP host, Claude wrapper, Codex wrapper, OpenACP/OpenClaw-style systems, opencode/Kilo, and fakes.
- Every row has a Silvercode decision: adopted, adapted, rejected, or unsupported with reason.
- Later phase beads link to this phase instead of restating prior-art summaries.
