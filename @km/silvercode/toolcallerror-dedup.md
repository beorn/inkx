---
mentions:
  - km
id: "@km/silvercode/toolcallerror-dedup"
aliases:
  - km-silvercode.toolcallerror-dedup
  - km-silvercode-toolcallerror-dedup
created_by: claude:2405c72e
created_at: 2026-04-28T22:16:56Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvercode.toolcallerror-dedup
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-28T15:16:56Z
    created_by: claude:2405c72e
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-silvercode
---

# [ ] Decide fate of <ToolCallError> — used or dead? @km/silvercode #task #P3 #cleanup #design

blocks:: [[@km/silvercode]]

ToolCallError.tsx (78 lines) defines a standalone error envelope with a separate red-bordered card, retry chevron, multi-line stderr body. ToolCall.tsx docstring (lines 5-21) explicitly documents the v2 unification: 'ToolCall failed-status renders ONE unified card (✗ glyph in header + inline error body). The separate <ToolCallError> envelope is gone from the composed path.' grep on apps/silvercode/src shows ToolCallError is exported but only imported as a type in the README/docstrings — no component-call site. Either (a) delete ToolCallError if it's truly dead, or (b) document its standalone use case explicitly (e.g. fatal-session-level errors, not per-tool-call errors). Currently it sits in the codebase as dead-or-zombie code, which is a maintenance drag. Acceptance: ToolCallError either removed (and any storybook story dropped) or has a documented consumer + storybook scene. Discovered during @km/silvercode/design-review walkthrough.

