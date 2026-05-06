---
mentions:
  - km
  - claude
id: "@km/silvery/textarea-autosize-docs"
aliases:
  - km-silvery.textarea-autosize-docs
  - km-silvery-textarea-autosize-docs
created_by: claude:611e701e
created_at: 2026-04-26T06:33:18Z
closed_at: 2026-04-26T07:24:48Z
close_reason: Shipped in silvery d089c603 alongside the API change —
  text-area.md, TextArea.md, styling.md, textarea-design.md, CHANGELOG.md
  migration table, examples/apps/textarea.tsx all updated.
started_at: 2026-04-26T06:41:03Z
owner: bjorn@stabell.org
assignee: claude:2405c72e
dependencies:
  - issue_id: km-silvery.textarea-autosize-docs
    depends_on_id: km-silvery
    type: parent-child
    created_at: 2026-04-25T23:33:25Z
    created_by: claude:611e701e
    metadata: "{}"
  - issue_id: km-silvery.textarea-autosize-docs
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
        target: km-silvery
      - type: link
        target: km-silvery.textarea-autosize
---

# [x] silvery: docs pass for TextArea autosize feature @km/silvery #task #P2 @claude:2405c72e

blocks:: [[@km/silvery]], [[@km/silvery/textarea-autosize]]

Companion to @km/silvery/textarea-autosize (do them in one PR). Update: docs/api/text-area.md (prop reference + examples for fixed/content/bounded modes), docs/components/TextInput.md (cross-link), docs/guide/the-silvery-way.md (anti-pattern callout: don't compute TextArea height from value newlines), docs/guide/styling.md (CSS field-sizing mapping), CHANGELOG.md (feature entry + migration note), examples/apps/textarea.tsx (demo all three modes).

