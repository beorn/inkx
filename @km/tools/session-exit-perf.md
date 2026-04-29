---
id: "@km/tools/session-exit-perf"
aliases:
  - km-tools.session-exit-perf
  - km-tools-session-exit-perf
created_at: 2026-02-06T22:50:56Z
closed_at: 2026-02-06T22:52:33Z
---

# [x] Session summarize hook should fork background task so Claude exits immediately @km/tools #task #P2 @claude:3e210840

The session-end summarize hook runs synchronously, blocking Claude Code from exiting until summarization completes. It should fork the summarization as a background process (e.g. detached child process) so Claude can quit immediately while the summary writes in the background.