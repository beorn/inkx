---
id: "@km/all/bd-verify-primitive"
aliases:
  - km-all.bd-verify-primitive
  - km-all-bd-verify-primitive
created_by: claude:cc081a9a
created_at: 2026-04-27T15:34:12Z
closed_at: 2026-04-27T19:32:57Z
close_reason: "Phase 1 shipped 2026-04-27 — origin/main 687641d8d (tool) +
  fccecb0e4 (docs). tools/bd-verify.ts (470 LOC) parses bead
  Acceptance/Close-reason sections, recognizes grep/rg/git-grep with N-hit
  expectations, and reports pass/fail with proper exit codes. Smoke-tested on 3
  beads — caught real discrepancies: km-silvery.c1-fossil-sweep-broader had
  tests/memory/ path-from-km-root mismatch;
  km-silvery.feedback-trace-v31-integration claimed recordPassCause=0 but git
  grep finds 2 (in docs, not code — Phase 1 limitation). Phase 2 (bd close
  integration + acceptance-section schema enforcement) deferred to separate
  multi-session bead. Skill at .claude/skills/pm/verify.md; /pm verify <id>
  wired in pm/SKILL.md."
---

# [x] bd verify <id> — executable acceptance criteria @km/all #feature #P3

blocks:: [[@km/all]]

Plateau-90 session ended with beads marked closed but acceptance criteria still unmet at origin/main (e.g. @km/silvery/feedback-trace-loggily had grep recordPassCause = 0 but origin had multiple hits). Root cause via /why: acceptance criteria are prose, not executable. Proposed: bd verify subcommand parses acceptance section as cmd/expected pairs, replays each, fails if any do not match. Bonus: bd close runs bd verify first; refuses to close if verification fails. Multi-session, may need upstream PR or fork. Acceptance: bd verify exists; bd close blocks on verify failure; bd lint flags prose-only acceptance.