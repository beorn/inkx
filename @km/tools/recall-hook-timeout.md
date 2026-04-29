---
id: "@km/tools/recall-hook-timeout"
aliases:
  - km-tools.recall-hook-timeout
  - km-tools-recall-hook-timeout
created_by: claude:22727d86
created_at: 2026-02-16T23:39:34Z
closed_at: 2026-02-16T23:44:47Z
owner: bjorn@stabell.org
---

# [x] UserPromptSubmit recall hook always times out (2s timeout, needs ~5s) @km/tools #bug #P1

The UserPromptSubmit hook runs recall.ts hook which does FTS5 search (~200ms) then LLM synthesis (~3-5s). The hook timeout was set to 2000ms, so it always gets killed before returning. Result: 0 Session Memory injections in any session, and user sees 'UserPromptSubmit hook error' on every prompt.

Quick fix: bumped timeout to 8000ms in .claude/settings.json.

Better fix: make the hook faster — either skip LLM synthesis in the hook (return raw snippets), use a faster model, or reduce synthesis context. The 5s latency on every user prompt is still not great UX even if it doesn't timeout.