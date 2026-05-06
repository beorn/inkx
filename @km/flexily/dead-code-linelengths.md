---
mentions:
  - km
id: "@km/flexily/dead-code-linelengths"
aliases:
  - km-flexily.dead-code-linelengths
  - km-flexily-dead-code-linelengths
created_by: claude:65d845d9
created_at: 2026-03-13T05:31:27Z
closed_at: 2026-03-13T05:32:38Z
close_reason: P4 cleanup — tracked but not blocking. Dead _lineLengths can be
  removed in a future cleanup pass.
owner: bjorn@stabell.org
---

# [x] Remove dead _lineLengths array @km/flexily #task #P4

_lineLengths (Uint16Array) in layout-flex-lines.ts is populated by breakIntoLines() but never read by any consumer. The information is redundant with _lineChildren[i].length. Dead code: remove _lineLengths, its grow logic in growLineArrays(), and all writes to it. Saves ~64 bytes of memory and simplifies the code. [pro]

