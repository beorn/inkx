---
id: "@km/silvercode/ambient-phase-6-breaker-telemetry"
aliases:
  - km-silvercode.ambient-phase-6-breaker-telemetry
  - km-silvercode-ambient-phase-6-breaker-telemetry
created_by: claude:4de4a3ab
created_at: 2026-04-27T21:17:41Z
closed_at: 2026-04-27T21:28:05Z
close_reason: >-
  Phase 6.b shipped: ambient circuit breaker + Layer 4 telemetry.


  New files:

  - apps/silvercode/src/ambient-circuit-breaker.ts (token-bucket, per-source
  10/min + global 50/hr, env-configurable)

  - apps/silvercode/src/ambient-telemetry.ts (loggily silvercode:ambient,
  snapshot getter, 8-char snippet redaction)

  - apps/silvercode/tests/ambient-circuit-breaker.test.ts (15 tests)

  - apps/silvercode/tests/ambient-telemetry.test.ts (10 tests)


  Wired into:

  - ambient-sanitize.ts: sanitizeAmbientWithReport() returns per-pass breakdown

  - ambient-stream.ts: record() now sanitize → telemetry → admit → buffer;
  returns boolean

  - transcript.ts: safeAppendAssistantTurn + sanitizeAssistantContentBlocks emit
  recordRolePrefixHit on Layer 3 detection


  Verification:

  - typecheck: 0 non-vendor errors

  - 4 required test files: 82/82 pass

  - bun tools/check-prompt-boundary.ts: clean

  - bun fix: exit 0 (my files clean; pre-existing 100 oxlint warnings unchanged)

  - Smoke (100 events × 4 sources, default caps): admitted=40,
  droppedPerSource=15 each, droppedGlobal=0 — matches policy


  Constraints honored:

  - All observability via loggily (no console.log / no process.stderr)

  - package.json untouched

  - Trigger tokens stay as char codes (no literal role strings in source)

  - 8-char snippet redaction enforced inside recordRolePrefixHit


  Branch: ambient-phase-6-breaker-telemetry

  Remote SHA: 39555c125a86535e78d8bd7c659e34f1968e9560
started_at: 2026-04-27T21:17:58Z
owner: bjorn@stabell.org
assignee: claude:4de4a3ab
dependencies:
  - issue_id: km-silvercode.ambient-phase-6-breaker-telemetry
    depends_on_id: km-silvercode.ambient-context-excellence
    type: parent-child
    created_at: 2026-04-27T14:17:45Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [x] Ambient Phase 6.b — circuit breaker + Layer 4 telemetry @km/silvercode #feature #P1 @claude:4de4a3ab

blocks:: [[@km/silvercode/ambient-context-excellence]]
