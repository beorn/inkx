---
id: "@km/silvery/capability-matrix"
aliases:
  - km-silvery.capability-matrix
  - km-silvery-capability-matrix
created_by: claude:c9beade3
created_at: 2026-03-14T15:21:26Z
closed_at: 2026-03-14T23:45:44Z
close_reason: Implemented and committed in silvery 5b25c8f + termless 3887c47
owner: bjorn@stabell.org
assignee: claude:c9beade3
---

# [x] Add capability matrix tests — OSC 66 supported/unsupported/partial profiles @km/silvery #task #P2 @claude:c9beade3

Test with capability profiles: osc66 supported, osc66 unsupported, osc66 parse-but-swallow. Verify that unsupported profiles preserve visible content. The existing wide-char matrix is character-centric; this adds a capability dimension. See docs/lessons/testing-escape-hatches.md.