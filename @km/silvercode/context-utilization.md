---
id: "@km/silvercode/context-utilization"
aliases:
  - km-silvercode.context-utilization
  - km-silvercode-context-utilization
created_by: claude:0940ca20
created_at: 2026-04-24T16:36:44Z
closed_at: 2026-04-24T16:46:40Z
close_reason: "Shipped via Agent-C — changes swept into f0f3e8aa6
  (context-windows.ts + StatusLine.tsx + context-utilization.test.ts, 11 tests).
  Shows 'ctx: NK / NK (N%)' with $muted→$warning@70%→$error@90%. Window resolved
  from model name, default 200K."
owner: bjorn@stabell.org
assignee: claude:0940ca20
dependencies:
  - issue_id: km-silvercode.context-utilization
    depends_on_id: km-silvercode
    type: parent-child
    created_at: 2026-04-24T09:36:44Z
    created_by: claude:0940ca20
    metadata: "{}"
---

# [x] Context utilization in StatusLine (7K / 200K, warning at 80%) @km/silvercode #task #P2 @claude:0940ca20

blocks:: [[@km/silvercode]]

StatusLine currently shows 'tok:N' — raw count with no model context. Show 'ctx: 7K / 200K (3%)' with color shifting from muted →  at 70%,  at 90%. Derive the window size from the session-init event's model field (look up from a static map: opus=200K, sonnet-4-6=200K, haiku-4-5=200K; default 200K). Pull running tokens from state.cost.inputTokens + outputTokens. No extra harness work — SessionState already has model + cost fields.