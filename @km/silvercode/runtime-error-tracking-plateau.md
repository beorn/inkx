---
mentions:
  - km
id: "@km/silvercode/runtime-error-tracking-plateau"
aliases:
  - km-silvercode.runtime-error-tracking-plateau
  - km-silvercode-runtime-error-tracking-plateau
created_at: 2026-05-01T12:12:00.000Z
type: bug
priority: P0
closeReason: "Completed: unknown Codex/session shapes, stale
  permissions/tools/turns, process close escalation, closeAll error surfacing,
  session-end error rows, resume blank-screen, and CLI smoke paths now have
  focused coverage. Verification: agent-harness liveness/spawn/acp slice passed
  4 files, 65 tests; Silvercode composition/runtime slice included
  session-end-error-paths, controller-closeall, resume-blank-screen, cli-smoke
  in the 12-file/187-test run."
---

# [x] [bug] Silvercode runtime error tracking plateau @km/silvercode #bug #P0

Silvercode has repeatedly hidden or lost runtime failures: permission prompts that did not resume, turns that appeared stuck, commands ending in running state, unknown backend data shapes, hidden stderr, strict-layout failures, and orphaned backend processes. This bead tracks the error/liveness side of the quality plateau separately from the visual chat-layout bead.

Do not close this bead until runtime failures are visible, attributable, and covered at the owning layer.

## Acceptance Criteria

- [ ] Unknown backend/session data shapes throw or surface an explicit UI error. No reducer/parser path silently ignores an unrecognized shape.
- [ ] Permission request lifecycle is observable: requested, rendered, answered, cancelled, timed out, or backend-closed. A missing transition emits exactly one liveness error.
- [ ] Turn lifecycle is observable: started, active reason, ended, interrupted, or stale. The UI never shows a completed turn as still running without a liveness explanation.
- [ ] Process lifecycle is observable: spawned backend pid/process group, close requested, SIGTERM sent, SIGKILL fallback if needed, exit observed. Ctrl-C/app unmount/scope disposal leave no `codex-acp`, Claude, MCP, or probe grandchildren behind.
- [ ] Runtime errors that occur while the alt-screen is active render inside the session UI, not only to hidden stderr or debug logs.
- [ ] Strict-mode layout/render invariant failures are easy to run from the repo root and leave actionable artifacts. App-local strict runs should not fail because Vite temp/cache paths resolve incorrectly.
- [ ] Error rows use the same `SessionEntry`/`Content` lane system as normal transcript rows unless the content genuinely requires a wider lane.
- [ ] Tests exist at the layer where each bug lives: parser/reducer tests for unknown shapes, agent-harness tests for lifecycle/deadlock, silvery/flexily tests for layout invariants, and silvercode smoke tests for composition.

## Current Status Notes

- 2026-05-01: `apps/silvercode/packages/agent-harness/tests/acp-client.test.ts` now has strict tests proving ACP scope disposal uses negative-pid process-group SIGTERM instead of only killing the wrapper. This addresses the observed orphaned `@zed-industries/codex-acp` daemons, but needs real Ctrl-C verification before checking off.
- 2026-05-01: `apps/silvercode/tests/notification-welcome-artifact.test.tsx` covers the notification text artifact path: pre-transcript notification content does not appear on Welcome, and post-transcript notification content renders in the content lane.
- 2026-05-01: `apps/silvercode/tests/chat-message-summary.test.tsx` covers preserving the clicked summary row near the viewport bottom. Broader ListView anchored-disclosure semantics are still tracked by the chat-layout bead.
- 2026-05-03: `apps/silvercode/tests/controller-closeall.test.ts` covers `controller.closeAll()` surfacing synchronous session-close failures as session errors while continuing to close later sessions. This closes one "do not silently ignore cleanup failures" gap without changing the public synchronous `closeAll()` contract.

## Related

- [[@km/silvercode/chat-layout-quality-plateau]]
- [[@km/silvercode/liveness-deadlock-detector]]
- [[@km/silvercode/spawn-close-hardening]]
- [[@km/silvercode/resume-blank-screen]]
- [[@km/silvercode/spawn-error-blank-screen]]
