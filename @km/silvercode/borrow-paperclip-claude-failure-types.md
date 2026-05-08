---
aliases:
  - km-silvercode.borrow-paperclip-claude-failure-types
  - km-silvercode-borrow-paperclip-claude-failure-types
created_at: 2026-05-07T19:15:58.017Z
---

# Port Paperclip's typed Claude failure detectors into @km/claude-acp #P1

Paperclip's `packages/adapters/claude-local/src/server/parse.ts` defines a small but battle-tested set of typed Claude failure detectors:

- `parseClaudeStreamJson`
- `describeClaudeFailure`
- `detectClaudeLoginRequired`
- `extractClaudeRetryNotBefore`
- `isClaudeMaxTurnsResult`
- `isClaudeTransientUpstreamError`
- `isClaudeUnknownSessionError`

These power Paperclip's retry policy + login-prompt UX in their claude-local adapter. Silvercode's @km/claude-acp wrapper currently has no equivalent — transient upstream errors, max-turns results, and "unknown session" failures all surface as opaque ACP `stopReason: 'error'` strings. The user has no path to retry vs re-login vs wait-and-retry decisions.

Goal: port these detectors into apps/silvercode/packages/claude-acp/src/failure-types.ts (MIT, attribute Paperclip in header) and wire them into the ACP session/update emission so silvercode's UI can render typed retry CTAs.

Acceptance:
- Detector module with 1:1 functions matching Paperclip's surface (the 7 above).
- Vitest suite with fixture inputs covering the canonical failure shapes (max_turns, transient upstream, unknown session, login required, retry-after).
- Wire detected family into ACP `session/update` notifications via `_meta.failureFamily` so silvercode's controller can render typed CTAs.
- One UI consumer wired ("Retry available in <N>s" caption when `extractClaudeRetryNotBefore` returns a value); other CTAs follow as separate beads.
- License: MIT, attribute Paperclip + commit SHA in header. Read https://github.com/paperclipai/paperclip/blob/master/LICENSE first.
- Cross-reference: apps/silvercode/packages/claude-acp/src/wire.ts (current event normalization).
