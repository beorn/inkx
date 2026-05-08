---
aliases:
  - km-silvercode.agent-host-l5.07-background-jobs-and-subagents
  - km-silvercode-agent-host-l5-07-background-jobs-and-subagents
created_at: 2026-05-08T06:22:39.014Z
---

# [/] Background jobs and subagents #feature #P0 @agent/3

Model detached/background work and child agent execution as Jobs/SubagentRuns/Subthreads with parent-child provenance, navigation, cancellation, completion delivery, restart recovery, and provider-specific discovery.

## Ownership

This phase owns detached execution:

- Backgrounded turns become `Job` records with lifecycle, result, cancellation, and delivery.
- Child agents become `SubagentRun` or `Subthread` records with parent Thread/Turn provenance.
- Navigation shows parent/child relationships without inventing provider data that does not exist.
- Completed background/subagent work remains discoverable after restart.

## Complete Criteria

- Tests cover Ctrl-B, trailing `&`, provider background semantics, child session discovery, completion notifications, cancellation, restart recovery, and transcript placement.
- Subagent cost/token gaps are represented as unsupported/unknown capability facts, not fabricated totals.
- Drawer, notifications, and transcript all read from one canonical job/subagent model.
