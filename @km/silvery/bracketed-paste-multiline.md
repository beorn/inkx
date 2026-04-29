---
id: "@km/silvery/bracketed-paste-multiline"
aliases:
  - km-silvery.bracketed-paste-multiline
  - km-silvery-bracketed-paste-multiline
created_by: Bjørn Stabell
created_at: 2026-04-15T23:19:37Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.bracketed-paste-multiline
    depends_on_id: km-silvery.opentui-parity
    type: parent-child
    created_at: 2026-04-15T16:19:37Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [ ] Paste: bracketed-paste multiline + large-paste handling @km/silvery #feature #P3

blocks:: [[@km/silvery/opentui-parity]]

Audit bracketed-paste handling for very large pastes and multiline with embedded CR/LF — ensure no truncation, no line-ending corruption, correct TextArea insertion.