---
id: "@km/_orphan/wk17l"
aliases:
  - km-wk17l
created_by: claude:e7c823b8
created_at: 2026-02-26T13:14:36Z
closed_at: 2026-02-26T13:33:30Z
owner: bjorn@stabell.org
assignee: claude:e7c823b8
---

# [x] Embed semantics: content as alias override, broken link rendering, log.warn on load @km/_orphan #feature #P2 @claude:e7c823b8

Current getDisplayContent ignores embed node's content when resolvedNode exists. Should use content as alias override (like \![[^GID|alias]]). Broken/unresolvable embeds should render as <BrokenLink> in red. log.warn for broken embeds should happen at load time (hydration layer), not per-render.