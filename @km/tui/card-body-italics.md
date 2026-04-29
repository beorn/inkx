---
id: "@km/tui/card-body-italics"
aliases:
  - km-tui.card-body-italics
  - km-tui-card-body-italics
created_by: claude:8f007ba9
created_at: 2026-02-20T07:45:35Z
closed_at: 2026-02-20T08:09:10Z
---

# [x] Card body shows li items as italics (* interpreted as markdown formatting) @km/tui #bug #P2

Card body text that contains li children (starting with '* blablabla') renders the * as markdown italic formatting instead of as list items. Example node: 01KHTADSK15SB17B8Q9EMQG4Q6. The body snippet in cards should render KNode children as structured content (bullet + text), not re-interpret the raw markdown. We should render the parsed KNodes, not the raw markdown source.