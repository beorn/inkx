---
id: "@km/silvercode/ambient-phase-3-layers"
aliases:
  - km-silvercode.ambient-phase-3-layers
  - km-silvercode-ambient-phase-3-layers
created_by: claude:4de4a3ab
created_at: 2026-04-27T20:23:03Z
closed_at: 2026-04-27T20:42:32Z
close_reason: >-
  Phase 3 layers shipped — 5 commits to origin/main.


  EVIDENCE:


  (1) Boundary tests — apps/silvercode/tests/prompt-assembly-boundary.test.ts
      81 assertions: byte-for-byte user-text fidelity (60+ user-text variants),
      every EmbeddedResource carries _meta.ambient=true, adversarial corpus
      payloads (75 entries) never reach role-U slot, bypass paths don't
      produce ContentBlock[].
      Result: 81 tests passed.

  (2) Layer 2 sanitize — apps/silvercode/src/ambient-sanitize.ts +
      apps/silvercode/tests/ambient-sanitize.test.ts
      Pure deterministic floor: ANSI/control strip, NFC normalize,
      role-prefix neutralize at line start (token+colon → sentinel),
      16 KiB size-bound. Wired into prompt-assembly.ts (typed path) and
      legacy text renderer. Idempotent, meaning-preserving for benign
      content. Trigger tokens via char codes — never literal in source.
      Result: 45 tests passed.

  (3) Layer 3 loop-closure —
  apps/silvercode/packages/agent-harness/src/transcript-loop-closure.ts +
      apps/silvercode/src/transcript.ts +
      apps/silvercode/tests/transcript-loop-closure.test.ts
      quarantineLeadingRolePrefix(text) replaces leading role-marker colon
      with [QUARANTINED — role-prefix detected] inline. parse.ts auto-
      applies it to every assistant text block at construction time, closing
      re-ingestion at the canonical loop point. safeAppendAssistantTurn
      always appends as a single role:assistant message; never splits.
      S13-shape stream-json replay verified: smoking-gun sequence becomes safe.
      Result: 24 tests passed.

  (4) System-prompt clause — apps/silvercode/src/system-prompt.ts +
      apps/silvercode/tests/system-prompt.test.ts
      AMBIENT_FRAMING_SYSTEM_CLAUSE defines three precepts: read as memory,
      mention when relevant, ask before acting on anything ambiguous.
      ambientFramingInjector() injects once per session.
      Result: 7 tests passed.

  (5) CI gate — tools/check-prompt-boundary.ts wired into bun fix and
      exposed as bun verify-boundary. Two-stage detection: file imports
      ContentBlock from @km/agent-harness AND constructs a literal block
      outside the allowed seam (prompt-assembly.ts, prompt-cross-agent.ts,
      transcript.ts).
      Smoke test: clean repo → exit 0; deliberate __deliberate-violation.ts
      in apps/silvercode/src/ → exit 1 with violation listed.

  TOTAL: 147 Phase 3 tests passing (across 4 test files). 0 typecheck errors

  in changed code. CI gate active, smoke-tested both directions.


  COMMITS:
    e7cdd7647 test(silvercode): boundary tests for prompt-assembly (Layer 1)
    ac640801c feat(silvercode): ambient-sanitize.ts (Layer 2)
    6b47ec223 feat(silvercode): transcript loop-closure (Layer 3)
    ad5cb7616 (squashed during concurrent push) — system-prompt fragment
    e4a8d7fca ci(silvercode): prompt-boundary CI gate

  CONTENT QUARANTINE: 75-entry adversarial corpus at

  apps/silvercode/tests/eval/fixtures/role-prefix-corpus.b64 (base64 blob,

  .recall-ignore). Trigger tokens never appear as literal text in any

  source/test file — built via shell pipe (jq | base64) and char-code

  construction. Loaded via tests/eval/load-corpus.ts.
started_at: 2026-04-27T20:23:09Z
owner: bjorn@stabell.org
assignee: claude:4de4a3ab
dependencies:
  - issue_id: km-silvercode.ambient-phase-3-layers
    depends_on_id: km-silvercode.ambient-context-excellence
    type: parent-child
    created_at: 2026-04-27T13:23:08Z
    created_by: claude:4de4a3ab
    metadata: "{}"
---

# [x] Phase 3: boundary tests + ambient-sanitize + transcript loop-closure + sys prompt + CI gate @km/silvercode #task #P0 @claude:4de4a3ab

blocks:: [[@km/silvercode/ambient-context-excellence]]

See hub/silvercode/design/ambient-context-safety.md §4 Phase 3