---
mentions:
  - km
  - claude
id: "@km/silvercode/textarea-autosize-migrate"
aliases:
  - km-silvercode.textarea-autosize-migrate
  - km-silvercode-textarea-autosize-migrate
created_by: claude:611e701e
created_at: 2026-04-26T06:33:17Z
closed_at: 2026-04-26T07:24:47Z
close_reason: "Shipped: km root 0a1452980 — CommandBox queue (minRows=1
  maxRows=12) and command (defaults 1/8) migrated to fieldSizing. Hand-rolled
  height math dropped."
started_at: 2026-04-26T06:41:03Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvercode.textarea-autosize-migrate
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-25T23:33:25Z
    created_by: claude:611e701e
    metadata: "{}"
  - issue_id: km-silvercode.textarea-autosize-migrate
    depends_on_id: km-silvery.textarea-autosize
    type: blocks
    created_at: 2026-04-25T23:33:26Z
    created_by: claude:611e701e
    metadata: "{}"
props:
  blocked-by:
    type: list
    values:
      - type: link
        target: km-silvercode
      - type: link
        target: km-silvery.textarea-autosize
---

# [x] silvercode: migrate CommandBox to silvery TextArea fieldSizing='content' @km/silvercode #task #P2 @claude:2405c72e

blocks:: [[@km/silvercode]], [[@km/silvery/textarea-autosize]]

Once @km/silvery/textarea-autosize ships, replace the consumer-side wrap-aware wrapper at `apps/silvercode/src/components/CommandBox.tsx` (`CommandTextArea` ~50 LOC) with `<TextArea fieldSizing='content' maxRows={8} />`. Delete the `countVisualLines` import and `useBoxRect` plumbing — silvery now owns this. Verify all silvercode visual tests still pass.

