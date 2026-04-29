---
id: "@km/mdtest/session-exit-code"
aliases:
  - km-mdtest.session-exit-code
  - km-mdtest-session-exit-code
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:55Z
closed_at: 2026-03-14T01:34:31Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] mdtest: custom session reports exitCode=0 without OSC 133 @km/mdtest #bug #P1

In both cmd and PTY session types, exitCode starts at 0 and is only updated when OSC 133 D marker is seen. Non-OSC environments (pty=false, Windows, many REPLs) report failing commands as success. Fix: treat exit code as unknown when not explicitly signaled, or use explicit status sentinel. cmdSession.ts:181-241, ptySession.ts:146-189. Found by GPT 5.4 Pro review.