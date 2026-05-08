---
aliases:
  - km-silvercode.agent-host-l5.09-test-system-and-quality-gates.traffic-log-viewer-replay
  - km-silvercode-agent-host-l5-09-test-system-and-quality-gates-traffic-log-viewer-replay
created_at: 2026-05-08T08:00:00.000Z
---

# [/] Traffic log viewer and replay debug tool #feature #P0 @agent/3

blocks:: [[@km/silvercode/agent-host-l5/09-test-system-and-quality-gates]]

Make raw and normalized agent traffic inspectable and replayable as a first-class debug surface.

## Work

- Capture raw provider traffic, normalized runtime events, ChatTree projection events, and UI-visible leaves with stable ids and timestamps.
- Build a viewer that can scrub by Thread, SessionBinding, Turn, Track, tool call, plan step, job, or subagent.
- Replay a ledger deterministically through normalization and projection without contacting the provider.
- Export minimized regression fixtures from selected spans.

## Complete Criteria

- A failing traffic fixture can be replayed from the CLI and inspected in the TUI viewer.
- Replay output includes raw event, normalized event, projection leaf, and UI render provenance.
- Tests prove replay is deterministic and catches chunk reconciliation, queue/cancel, permission, plan, background, and subagent regressions.

Progress 2026-05-08: shipped 21d761b37 traffic replay core + CLI. `silvercode traffic replay <jsonl> --json` replays raw AgentEvent JSONL through ChatEvent normalization and ChatTree projection with raw/normalized/leaf provenance frames. Tests: apps/silvercode/tests/traffic-log.test.ts and cli-smoke traffic replay; npx tsc --noEmit passed. Remaining: TUI scrubber/viewer, span fixture export, and broader regression fixture matrix for queue/cancel/permission/plan/background/subagent.
