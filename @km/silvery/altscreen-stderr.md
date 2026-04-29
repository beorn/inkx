---
id: "@km/silvery/altscreen-stderr"
aliases:
  - km-silvery.altscreen-stderr
  - km-silvery-altscreen-stderr
created_by: claude:19080504
created_at: 2026-03-30T21:38:22Z
closed_at: 2026-03-30T21:42:08Z
close_reason: "Fixed: scheduler slow-frame and large-output warnings downgraded
  from log.warn to log.debug. Silent by default, visible via
  DEBUG=silvery:scheduler. Also replaced direct process.stderr.write with
  loggily calls in logDebug/logError methods."
owner: bjorn@stabell.org
---

# [x] Scheduler log.warn writes to stderr in alt screen mode, corrupting display @km/silvery #bug #P2

The scheduler's slow-frame warning uses log.warn() (loggily) which writes to process.stderr. In alt screen mode, this corrupts the display. patchConsole only patches console.* methods, not direct stderr writes from loggily. Fix options: (1) suppress loggily output in alt screen mode, (2) redirect loggily to a file when in alt screen, (3) expose slowFrameThreshold as a render option so apps can disable it.