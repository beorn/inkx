---
aliases:
  - km-silvercode.parity-claude
  - km-silvercode-parity-claude
  - claude-code-transcript-parity
  - km-silvercode.claude-code-transcript-parity
  - km-silvercode-claude-code-transcript-parity
created_at: 2026-05-06T18:36:50.952Z
status: open
previous_closed_at: 2026-05-06T22:55:31.000Z
previous_closeReason: "Completed through cbadc97f2 and child bead closures. Reopened because the live path had not reached the chat/projection quality plateau."
reopened_at: 2026-05-06T23:55:00Z
reopenReason: "Live Silvercode rendering still flowed through legacy MessageEntry/MessageOp projections; ChatSession.tree was not the reactive source of truth; Debug filtering and control-event classification were incomplete."
---

# [/] Claude provider conformance tracker #feature #P1

blocks:: [[@km/silvercode/agent-host-l5/08-provider-conformance]]

Track Claude/Claude Code parity as provider evidence only. Canonical architecture lives in the L5 parent plus phases 01, 02, 03, 04, 06, 07, and 09. The long pre-L5 transcript-parity body was pruned on 2026-05-08 because it duplicated old `channel`, `reasoning`, `MessageEntry`, and `SessionUpdateList` design text. Use git history for archaeology; do not copy those old type proposals.

## Open Gaps

- Projected ChatTree is not primary yet. ChatPane must render from ChatTree/ChatTrack, with legacy transcript routing deleted by phase 10.
- Claude fixture inventory/fail-loud contract is still open. Unknown raw/control shapes must become classified events, unsupported capability facts, or debug-track records.
- Claude resume ownership remains ambiguous when controller pre-replays JSONL and Claude ACP `loadSession` can also replay. Phase 03 owns the single replay/dedupe contract.
- Claude ACP remains intentionally lossy for some non-text prompt blocks, MCP server shapes, status/error/handoff/km-reference records, and replay classes. Phase 08 must mark each as supported, partial, or unsupported.
- Live Claude permission modes/shapes need fake-backed and live-smoke coverage through phase 06.
- Claude-specific fake backend coverage is open under phase 09.
- Claude ACP docs drift must be corrected after the conformance profile is executable.
- Claude prompt injectors/typed context must align with phase 05.
- Claude local-agent/subsession transcript view belongs to phase 07 and must not fabricate child-session facts absent from provider data.

## Child Work

- `l5-fixture-inventory`
- `l5-canonical-event-contract`
- `l5-reactive-chat-session-store`
- `l5-project-transcript-rules`
- `l5-control-event-state-routing`
- `l5-legacy-quarantine`
- `l5-chatblock-cutover`
- `l5-visual-replay-parity`
- `backend-fakes-claude`
- `local-agent-subsessions`

Completed child/evidence beads under this directory remain as historical proof, not active architecture.

## Complete Criteria

- Claude conformance rows in the phase 00/08 matrix have executable fake coverage or documented live-smoke evidence.
- Claude traffic fixtures replay through the same runtime, normalization, projection, and visual checks as Codex/ACP fakes.
- Claude-specific unsupported/partial features surface explicit capability facts in UI/debug logs.
- `rg -n "event\\.channel|ChatChannel|assistant-text|user-text|Chat\\.Narration|\\breasoning\\b|SessionUpdateList|MessageEntry" @km/silvercode/agent-host-l5/08-provider-conformance/parity-claude.md` returns hits only in this historical-pruning note or explicit cleanup references.
