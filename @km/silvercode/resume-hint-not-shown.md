---
id: "@km/silvercode/resume-hint-not-shown"
aliases:
  - km-silvercode.resume-hint-not-shown
  - km-silvercode-resume-hint-not-shown
created_by: claude:2405c72e
created_at: 2026-04-26T06:06:37Z
closed_at: 2026-04-26T06:39:02Z
close_reason: "Shipped: 242d0eb83. Root cause: filter stripping 'pending'
  sessionIds when user quit before session-init. Fixed: removed filter at
  storage, applied at format time, fallback message when no resumable sessions.
  5 tests. Session: km-session.0425-evening"
---

# [x] Resume hint not printed on Ctrl+C / Ctrl+D quit @km/silvercode #bug #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

App.tsx:614-622 registers term.signals.on('exit', printHintsNow) which writes 'silvercode --resume <sid>' to stderr. User reports they don't see it. Possible causes: (a) resumeIdsRef.current is empty at exit time — filter sid !== 'pending' may strip sessions that haven't gotten real session IDs yet (b) silvery teardown writes scrollback-wipe sequences AFTER the printHintsNow handler (the comment says it's last, but maybe not anymore) (c) hint goes to stderr which is consumed/redirected (d) hint prints but new terminal content scrolls it off. Investigation: log to a temp file in printHintsNow to confirm it fires; check if claude sessionId is set by quit time; verify scrollback ordering with screencast/recording. Fix: ensure hint always prints (even with pending session, show 'resume not available — session never got an id'), fall back to stdout, ensure ordering after silvery teardown.