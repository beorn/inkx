---
aliases:
  - km-silvercode.agent-host-l5.02-runtime-kernel-and-turn-owner
  - km-silvercode-agent-host-l5-02-runtime-kernel-and-turn-owner
created_at: 2026-05-08T06:22:21.672Z
---

# [/] Runtime kernel and turn owner #feature #P0

Implement an ACPX-inspired runtime kernel with one owner per live provider session, authoritative turn lifecycle, queue/backpressure, cancel, drain window, replay, status, and result promises. Stop deriving writability from UI/projection status.

## Ownership

This phase owns the live runtime contract:

- `TurnOwner` is the only writer of turn lifecycle, queue depth, cancel/drain, and send availability.
- UI writability is derived from runtime facts, never from transcript/projection status.
- Queued prompts are runtime records with ids and status, not transcript placeholders.
- Output-gate behavior is replaced by explicit turn states and illegal-transition tests.

## Complete Criteria

- Focused tests cover concurrent sends, queued sends, cancel, drain, late chunks, provider crash, resume attach, and permission waits.
- Grep for output-gate and thinking-derived writability has zero live-path hits:

```bash
rg -n "output gate|outputGate|canSend.*thinking|status.*thinking|queuedPrompt" apps/silvercode/src apps/silvercode/tests apps/silvercode/docs
```

- Any temporary compatibility boundary links to a cleanup bead under `10-migration-and-legacy-quarantine`.
