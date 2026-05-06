---
mentions:
  - km
id: "@km/silvery/proto-startup-detect"
aliases:
  - km-silvery.proto-startup-detect
  - km-silvery-proto-startup-detect
created_by: Bjørn Stabell
created_at: 2026-04-06T09:09:42Z
closed_at: 2026-04-06T09:28:27Z
close_reason: withTerminal auto-detects Mode 2031 (color scheme) + DEC 1020-1023
  (width) at startup. Parallel queries, 200ms timeout, non-blocking.
  colorSchemeDetector + widthDetector exposed on app. 15 tests. Silvery commit
  2d7c789.
owner: bjorn@stabell.org
---

# [x] withTerminal auto-detects Mode 2031 + DEC 1020-1023 at startup @km/silvery #task #P2

Wire protocol detection into withTerminal startup. Query Mode 2031 (color scheme) and DEC 1020-1023 (width modes) during terminal init. Results populate term.caps. Features degrade gracefully when terminal doesn't respond.

## Why

Foundation for all protocol integrations. Without this, each consumer must independently query and timeout. With this, term.caps has the answers and features just read them.

## Scope

- withTerminal creates ColorSchemeDetector, starts it
- withTerminal runs WidthDetector.detect(), applies to measurer
- term.caps gets colorScheme + widthConfig fields
- Timeout: 200ms total (parallel queries)
- Existing dark/light detection becomes fallback

