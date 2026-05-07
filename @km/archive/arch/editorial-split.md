---
mentions:
  - km
  - claude
id: "@km/arch/editorial-split"
aliases:
  - km-arch.editorial-split
  - km-arch-editorial-split
created_by: claude:87d20187
created_at: 2026-04-27T17:42:37Z
closed_at: 2026-04-27T18:25:16Z
close_reason: >-
  Implemented: hub/futures.md created with 7 sub-sections (TEA effect-emission
  shape, Matrix federation, withMCPServer alternative surfaces, Per-namespace
  file routing in loggily, km+silvercode convergence, Signal-store API,
  Plugin/factory abstractions explicitly rejected). hub/architecture.md
  scrubbed: convergence section moved to futures, (TBD)/(pending) annotations
  removed, phantom obligations removed from km/storage prose, See-also link
  added. hub/composition.md: TEA outer-bus and signal-store TBDs reframed to
  point at futures.md. .claude/skills/pm/create.md and SKILL.md: Acceptance
  bullet rule added (every Acceptance bullet must name a current consumer;
  scaffold: prefix as escape hatch).


  Tests: grep -nEi '\((TBD|pending|future|rename pending)\)' on both hub docs
  returns 0 hits. tsc unchanged (2 pre-existing errors not from these doc
  edits). futures.md links verified to resolve.


  Memory: feedback-doc-led-drift.md added + indexed in MEMORY.md under Design
  rules.


  Commit: 0a240f599 pushed to main.
started_at: 2026-04-27T18:15:39Z
owner: bjorn@stabell.org
assignee: claude:87d20187
dependencies:
  - issue_id: km-arch.editorial-split
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-27T10:42:37Z
    created_by: claude:87d20187
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [x] Editorial split — current-state vs futures in hub/ docs; bead template addendum @km/arch #task #P3 @claude:87d20187

blocks:: [[@km/all]]

## Why

The 2026-04-27 plateau retrospective surfaced a systemic doc-led drift pattern: hub/architecture.md and hub/composition.md mixed current state with aspirational design (e.g., `withMCPServer()` was described as part of the canonical pipe before tribe-daemon.ts had it). Readers couldn't distinguish committed from speculative; new work treated both as obligations.

Three concrete drift incidents:

1. Phase 5 (withMCPServer) was a 'make the doc true' follow-on
2. Three package renames (daemon-spine, tribe-proxy, plugins/mcp) all driven by '(rename pending)' annotations
3. The bg-recall bead spec said 'BG_RECALL_DEBUG_LOG matching INJECTION_DEBUG_LOG' — agent built a parallel file writer; now needs @km/bearly/unified-observability to roll back

The mechanism: prose obligations grew while no consumer required the mechanism.

## What

## Doc split

- hub/architecture.md → current state ONLY. Every component, table, factory, surface described must exist in code TODAY with at least one current consumer.
- hub/futures.md → aspirations, considered alternatives, parked designs, deferred work. Anything that was '(pending)' goes here.

## Editorial rules

- No '(rename pending)' / '(future)' / '(considered)' annotations in current-state docs. If it's not shipped, it's in futures.md.
- TBD shapes are okay if explicitly marked: 'X is being designed; effect-emission shape is open' — readers know not to treat as obligation.

## Bead-spec template addendum

In .claude/skills/pm/, the bead-create template gets an 'Acceptance' rule:

> Every Acceptance bullet MUST name a current consumer or workflow. 'Field X exists' fails the check; 'consumed by Y to do Z' passes.

This catches responseExpected-style fields and dismissals-style tables at spec time.

## Acceptance

- hub/architecture.md scrubbed: no '(pending)' annotations, every withX/table/tool described references actual source
- hub/futures.md created: parked designs (TEA effect-emission shape, Matrix federation, ACP boundary adapter retirement, etc.)
- .claude/skills/pm/ bead template updated with the consumer-required rule
- One memory entry added: 'doc-led drift: split current vs futures'

## Out of scope

- Refactoring all existing beads to honor the new acceptance rule (only applies to new beads going forward)
- Auditing all existing hub/*.md docs for drift (sweep can be a follow-on)

## Reference

- /big retrospective 2026-04-27 (this conversation)
- The 'editorial drift explanation' section of that retrospective

