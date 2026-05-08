---
id: "@km/silvercode/agent-host-l5/04-chat-thread-projection/l5-fixture-inventory"
---

# [/] L5: replay fixture inventory and unknown event fail-fast gate #P0

blocks:: [[@km/silvercode/agent-host-l5/08-provider-conformance/parity-claude]]

## Goal

Freeze the observed transcript/control event space so L5 cannot close while real raw records still leak, crash, or render as user/assistant prose.

## Work

- Build replay fixtures from the May 6 screenshots and sessions `019dfaa0-5e7c-7770-8c19-7871be863f5b`, `019ddfc8-0749-7da1-b892-b2e1c6`, and `f9eb64dc-d982-4a46-9a8e-da5fd882ac5f`.
- Inventory every observed `AgentEvent` and raw/control shape: prompts, assistant messages, thoughts, tool lifecycle, command output, reads/search/edits, permissions, permission mode, queue operations, plan/task reminders, file snapshots, hooks, MCP/skills, titles, recaps, usage/status/liveness, and unknown provider records.
- Convert the inventory into tests that fail on unknown event kinds, unknown properties, known raw/control shapes without a classification outcome, or Debug-only records appearing in normal transcript visibility.

## Acceptance

- Fixture tests name every observed raw/control shape and expected `event.track`.
- Unknown or malformed provider records fail loudly at the boundary.
- Intentional ignores are documented with source shape and reason.
- No `misc/raw` bucket can render in the normal transcript.

## Verification

- `bun vitest run apps/silvercode/tests/chat-agent-event-normalization.test.ts apps/silvercode/tests/chat-transcript-projection.test.ts`
- replay fixture command added by this bead.

blocks:: [[@km/silvercode/parity-claude]]
