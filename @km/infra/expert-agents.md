---
id: "@km/infra/expert-agents"
aliases:
  - km-infra.expert-agents
  - km-infra-expert-agents
created_by: Bjørn Stabell
created_at: 2026-04-12T18:14:25Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-infra.expert-agents
    depends_on_id: km-infra
    type: parent-child
    created_at: 2026-04-12T11:14:44Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Expert agents: persistent specialists with accumulated domain knowledge @km/infra #task #P2

blocks:: [[@km/infra]]

Complex subsystems need expert agents, not instruction skills. An expert agent loads all relevant context (CLAUDE.md, source, lessons, commit history) and accumulates knowledge across sessions (failed approaches, regression patterns, invariant violations, perf characteristics).

First candidates:
- pipeline — silvery render pipeline (5000 LOC, dirty flags, scroll tiers, STRICT)
- layout — flexily algorithms (caching, fingerprinting, fit-content)
- perf — performance across the stack (timing, cache, startup, bundle)
- storage — SQLite, sync, materialization, workers
- selection — cursor, text selection, multi-select, focus

Replaces: /perf (shallow checklist → deep expertise), /troubleshoot (generic → delete), /silvery (partial → full pipeline agent), /flexily (partial → full layout agent)

Key difference from skills: skills give instructions, agents give understanding. Agents remember what was tried, what failed, what the invariants are, why decisions were made.

Architecture: .claude/agents/expert/<domain>.md with system prompt loading full context. Knowledge accumulation via append-only log or beads.