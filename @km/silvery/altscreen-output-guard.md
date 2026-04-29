---
id: "@km/silvery/altscreen-output-guard"
aliases:
  - km-silvery.altscreen-output-guard
  - km-silvery-altscreen-output-guard
created_by: claude:19080504
created_at: 2026-03-30T21:54:25Z
closed_at: 2026-03-31T01:04:07Z
close_reason: "Implemented: output guard intercepts process.stdout.write and
  process.stderr.write in alt screen mode. Scheduler routes through writeOutput
  option. Guard activated in both render() and createApp() paths. 16 tests."
owner: bjorn@stabell.org
---

# [x] Guard all stdout/stderr output in alt screen mode @km/silvery #feature #P2

In alt screen (fullscreen) mode, any write to stdout/stderr outside silvery's render pipeline corrupts the display. patchConsole only catches console.* methods.

Solution: when entering alt screen mode, silvery should intercept process.stdout.write and process.stderr.write:
1. stdout: only allow silvery's own render output through (from scheduler/output-phase). All other stdout writes are suppressed or buffered.
2. stderr: redirect to a log file (DEBUG_LOG) or buffer. Restore and flush on exit.
3. Restore original write methods on dispose (Symbol.dispose).

This catches ALL output sources: loggily, console.*, direct process.stderr.write(), any dependency.