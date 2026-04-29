---
id: "@km/silvery/cleanup-writesync"
aliases:
  - km-silvery.cleanup-writesync
  - km-silvery-cleanup-writesync
created_by: Bjørn Stabell
created_at: 2026-04-01T07:28:31Z
closed_at: 2026-04-01T07:52:15Z
close_reason: "Fixed. Two issues: (1) output guard patched process.stdout
  globally even with mock stdout — added isRealStdout check. (2) writeSync(fd)
  in cleanup/lifecycle bypassed mocks — guarded with stdout === process.stdout
  check. 12 tests fixed."
owner: bjorn@stabell.org
---

# [x] writeSync(fd=1) in createApp cleanup writes to real stdout, breaks mock-stdout tests @km/silvery #bug #P2

createApp's exit cleanup uses writeSync(fd, sequences) where fd comes from stdout.fd. Mock stdouts set fd:1 (real stdout fd), so cleanup escapes bypass the mock and hit process.stdout. Causes 'Test produced stdout/stderr output' failures in inline-mouse-default, inline-focus-reporting, and any test using mock stdout with fd:1.

Fix: use stdout.write() for cleanup instead of writeSync(fd), or detect mock stdout and skip writeSync.