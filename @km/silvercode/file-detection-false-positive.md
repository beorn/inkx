---
id: "@km/silvercode/file-detection-false-positive"
aliases:
  - km-silvercode.file-detection-false-positive
  - km-silvercode-file-detection-false-positive
created_by: claude:2405c72e
created_at: 2026-04-26T06:05:15Z
closed_at: 2026-04-26T06:38:57Z
close_reason: "Shipped: 4a2257f2c. FILE_RE negative-lookbehind so /word inside
  vendor/silvery doesn't match. 4 tests. Session: km-session.0425-evening"
started_at: 2026-04-26T06:07:27Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.file-detection-false-positive
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T23:06:01Z
    created_by: claude:2405c72e
    metadata: "{}"
---

# [x] File detection FILE_RE matches /word inside vendor/silvery (false positive) @km/silvercode #bug #P2 @claude:2405c72e

blocks:: [[@km/silvercode]]

apps/silvercode/src/detection.ts FILE_RE = /(~[A-Za-z0-9/_.-]+|\/[A-Za-z0-9/_.-]+)(?::(\d+)(?::(\d+))?)?/g matches '/silvery' inside the substring 'vendor/silvery' because the leading / has no path-boundary check. Result: words after / inside compound paths render as yellow+underlined file detections (screenshot 23.00.38.png). Fix: add negative lookbehind so leading / must NOT be preceded by a word char. Pattern: (?<![A-Za-z0-9_])\/[A-Za-z0-9/_.-]+ — matches 'cd /Users/foo' (space-before-/) but not 'vendor/silvery'.