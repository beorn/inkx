---
id: "@km/silvercode/prompt-concat-into-reply"
aliases:
  - km-silvercode.prompt-concat-into-reply
  - km-silvercode-prompt-concat-into-reply
created_by: claude:2405c72e
created_at: 2026-04-28T17:57:58Z
closed_at: 2026-04-28T18:09:09Z
close_reason: "Fixed via commit bf10b28d7. Test:
  apps/silvercode/packages/agent-harness/tests/prompt-echo-strip.test.ts (5
  tests, all green). Fix: per-assistant-turn consumer in session-store.ts strips
  the most-recent user prompt from incoming text (text-delta + assistant-message
  paths). Replays suppressed bytes on mismatch so non-echoing agents pass
  through byte-equal."
---

# [x] [bug] [P1] User prompt concatenated into start of assistant reply with no separator @km/silvercode #bug #P1 @claude:2405c72e

blocks:: [[@km/silvercode]]

Screenshot 2026-04-28 at 10.16.32 shows the assistant row rendering as '● what repo is this?km — Knowledge Machine ...' — the user prompt is glued to the start of the model's reply with no separator (no space, newline, or styling break). The prompt is also already shown on its own row above ('> what repo is this?'), so this is duplication on top of being a concatenation bug. Adjacent to closed @km/silvercode/duplicate-prompt (optimistic apply + agent echo on separate rows); this surface is concatenation into the reply row instead. Reproduce: send any prompt to silvercode, observe the assistant row starts with the prompt text instead of the model's first token.