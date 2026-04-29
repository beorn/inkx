---
id: "@km/silvercode/acp-resume-blank-screen"
aliases:
  - km-silvercode.acp-resume-blank-screen
  - km-silvercode-acp-resume-blank-screen
created_by: claude:cc081a9a
created_at: 2026-04-28T00:50:24Z
closed_at: 2026-04-28T00:50:54Z
close_reason: Fixed in 849b4358d. newSession now awaits session-init and uses
  the real Claude UUID as the ACP sessionId. Resume hints emit ids that --resume
  can actually load.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.acp-resume-blank-screen
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-27T17:50:55Z
    created_by: claude:cc081a9a
    metadata: "{}"
---

# [x] --resume blank screen: synthetic session id never matches on-disk JSONL @km/silvercode #bug #P1

blocks:: [[@km/silvercode]]

User report 2026-04-27 (`silvercode --account d@delei.org --resume claude-code:claude-acp-1777334914180-1` → blank screen).

Root cause: `@km/claude-acp` server's `newSession()` synthesized `claude-acp-${Date.now()}-N` as the ACP sessionId. The resume hint emits this synthetic id; the next `--resume <syntheticId>` then fails because Claude stores JSONL transcripts at `~/.claude/projects/<cwd>/<UUID>.jsonl` (real UUID, not synthetic). The `session not found` error went to stderr, hidden behind the alt screen — user sees a blank UI.

Fix landed in commit 849b4358d:
- newSession subscribes BEFORE returning
- buffers events until `session-init` arrives
- uses the real sessionId from session-init as the ACP sessionId
- replays buffered events through the wire after attachWire
- 10s timeout falls back to synthetic id (Claude hung — separate spawn error)
- wire exposes `replayEvent()` for the buffer-flush

Tests: server.test.ts updated for real-id contract; fakeSpawn now gates response on stdin (more realistic of real claude --bare -p).