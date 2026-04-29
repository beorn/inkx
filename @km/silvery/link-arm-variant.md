---
id: "@km/silvery/link-arm-variant"
aliases:
  - km-silvery.link-arm-variant
  - km-silvery-link-arm-variant
created_by: claude:e31834da
created_at: 2026-03-20T01:40:54Z
closed_at: 2026-03-23T05:37:35Z
close_reason: "Implemented both deliverables: (1) Link variant='arm-on-hover'
  prop — arms on plain hover without Cmd, (2) OSC 8 wrapping fix —
  fixOsc8AcrossWrappedLines() post-processes wrapped lines to ensure each line
  has self-contained open/close sequences. 12 new tests (4 variant + 8 OSC 8).
  All 6037 vendor tests pass."
owner: bjorn@stabell.org
assignee: claude:c0da815b
---

# [x] Link: arm-on-hover variant + fix OSC 8 wrapping @km/silvery #feature #P0 @claude:c0da815b

Two silvery Link improvements needed for km popover:

1. **Link variant=arm-on-hover**: Arms on hover without Cmd. Currently Link requires Cmd+hover to arm (show underline + pointer cursor). Popovers need links that arm on plain hover. Add a variant prop: 'arm-on-cmd-hover' (default) | 'arm-on-hover'.

2. **Fix OSC 8 wrapping**: When Link text wraps (wrap='wrap'), OSC 8 escape sequences leak as visible text (']8;;\'). The content phase doesn't handle OSC 8 sequences during text wrapping — they get split across lines. Fix: treat OSC 8 open/close as zero-width in width measurement, and re-emit on each wrapped line (like ANSI color state tracking).

TDD approach — write failing tests first for both issues.

Temporary workaround in km: PopoverLink uses Text + hover state + onClick (no OSC 8). Replace with <Link variant='arm-on-hover'> once this is done.