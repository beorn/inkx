---
id: "@km/silvery/paint-clear-invariant"
aliases:
  - km-silvery.paint-clear-invariant
  - km-silvery-paint-clear-invariant
created_by: claude:cc081a9a
created_at: 2026-04-27T05:45:19Z
closed_at: 2026-04-28T05:07:25Z
close_reason: "L1→L4 structural promotion shipped via silvery c7cf93904 + km
  6202530284. ExcessClearGate brand type makes wrong-order excess-clear
  unrepresentable at call site. Sole constructor: requireExcessClearGate.
  clearExcessArea(gate, ...) signature enforces invariant. 7 STRICT tests
  including @ts-expect-error coverage
  (tests/features/excess-clear-gate.test.tsx). 177 vendor feature files / 2032
  tests pass under SILVERY_STRICT=1. 0 net new tsc errors. Runtime hasPrevBuffer
  guard retained — empirical removal breaks absolute-shrink-bg-preserve tests
  because BufferSink output remains authoritative on default path. L5 (guard
  deletion + BufferSink retirement) split to follow-up bead
  km-silvery.paint-clear-l5-bufferssink-retire."
started_at: 2026-04-28T04:47:54Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvery.paint-clear-invariant
    depends_on_id: km-silvery.structural-hardening
    type: parent-child
    created_at: 2026-04-26T23:18:24Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] Promote clearExcessArea hasPrevBuffer guard to structural invariant @km/silvery #feature #P2 @claude:cc081a9a

blocks:: [[@km/silvery/structural-hardening]]

The fix at silvery 168b4989 added a runtime guard (hasPrevBuffer check) that prevents clearExcessArea from stomping freshly-painted sibling content for absolute children. This caught BOTH incremental-mismatch and fuzz nested seed=1337 — same root cause.

The guard is currently runtime-checked (SILVERY_STRICT detects violations). Plateau is making the bug class impossible at the type/structural level: the render-phase API enforces paint-then-clear ordering by construction, so the wrong order can't compile.

Approach options:
1. Phase-typed buffer handle: Buffer<Painting> vs Buffer<Cleared>; clear() requires Cleared input
2. Single-pass walk that collects clears, applies them once at end
3. Inversion: paint phase is the only phase that mutates; clear phase is dead and removed

Files in scope:
- vendor/silvery/packages/ag-term/src/pipeline/render-phase.ts
- vendor/silvery/packages/ag-term/src/buffer.ts

/complete:
- The guard at clearExcessArea is removed (not needed because the wrong-order call site can't exist)
- SILVERY_STRICT still passes; the previously-flagged violation can no longer be expressed
- /pro review confirms the abstraction holds


## Quality rubric (hub/quality-rubric.md)
Current level: L1 — runtime guard at silvery 168b4989 (clearExcessArea hasPrevBuffer check) prevents stomping but the wrong-order call can still happen.
Target level: L5 — render-plan-commit (or double-buffer / damage-list) makes the wrong-order call site unrepresentable (L4); guard is then deleted and existing fuzz seed=1337 + new property test cover the bug class (L5). Per G1 taxonomy, render-phase ordering is the dominant production-code seam (3/14), so this bead is the highest-leverage plateau target in the program.
