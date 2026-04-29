---
id: "@km/silvercode/resume-blank-screen"
aliases:
  - km-silvercode.resume-blank-screen
  - km-silvercode-resume-blank-screen
created_by: claude:2405c72e
created_at: 2026-04-26T11:29:22Z
closed_at: 2026-04-28T01:55:02Z
close_reason: "Fixed: pre-flight validateResumeId() in index.tsx rejects
  synthetic claude-acp-<ts>-<n> ids and missing-JSONL Claude-Code resume ids
  before alt-screen activates. Errors print to the user's normal terminal with
  actionable guidance and exit 2. Verified by reproducing the user's command
  (silvercode --account d@delei.org --resume
  claude-code:claude-acp-1777334914180-1) — now produces clear stderr message
  instead of blank screen. 8 tests in resume-blank-screen.test.ts cover
  synthetic-id, missing-JSONL, existing-JSONL, and non-Claude-agent cases.
  Commit 6372314b2."
started_at: 2026-04-28T01:52:18Z
owner: bjorn@stabell.org
assignee: claude:cc081a9a
dependencies:
  - issue_id: km-silvercode.resume-blank-screen
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T18:52:18Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] [bug] --resume <bogus-id> blank screen — pre-flight validate before alt-screen @km/silvercode #bug #P1 @claude:cc081a9a

blocks:: [[@km/silvercode]]

silvercode --resume <bogus-id> shows a blank screen with no error visible

REPRO:
silvercode --account d@delei.org --resume claude-code:claude-acp-1777334914180-1
=> alt-screen mode, blank UI, stderr empty, hangs indefinitely

ROOT CAUSE:
1. silvercode enters fullscreen/alt-screen mode BEFORE validating --resume
2. claude subprocess writes "session not found" to stderr → spawn.ts captures
   it as a `kind: "error"` event (line 264-274 in spawn.ts), does NOT pass
   through to silvercode's stderr
3. The error event flows into session-store but isn't rendered visibly when
   the chat is empty
4. UI shows 24 blank rows — indistinguishable from a fresh session that just
   takes a moment to spin up

ADDITIONAL: synthetic ids like `claude-acp-1777334914180-1` from old
silvercode versions (pre-849b4358d) reference no real Claude session and
will NEVER resolve, but we still let users try.

ACCEPTANCE:
- Pre-flight check BEFORE entering alt-screen for `--resume <id>`:
  - For Claude Code agents: stat `~/.claude/projects/<encodedCwd>/<sid>.jsonl`,
    fail fast with clear message if missing
  - Detect synthetic `claude-acp-<ts>-<n>` pattern, give specific message
    pointing user at a fresh session
- Test asserting pre-flight rejects bogus id, real id passes

OUT OF SCOPE (separate beads):
- In-UI error rendering when post-alt-screen errors fire (resume succeeds in
  pre-flight, fails at spawn time)
- Codex pre-flight (different path, harder to check)