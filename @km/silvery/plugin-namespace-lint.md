---
id: "@km/silvery/plugin-namespace-lint"
aliases:
  - km-silvery.plugin-namespace-lint
  - km-silvery-plugin-namespace-lint
created_by: claude:8b5b9e1c
created_at: 2026-04-21T09:06:17Z
---

# [ ] Lint rule: ban hand-typed '${name}.${op}' literals outside definePlugin @km/silvery #feature #P3

blocks:: [[@km/silvery/authoring-elegance]]

Enforce single source of namespace truth. Today 'help.show', 'search.show', etc. are typed manually in op unions AND in bridge dispatch sites; a typo in one place is a silent miss. Once @km/silvery.definePlugin ships, the ns lives in name: 'help' only. Low-effort, high-signal lint. Filed from 2026-04-21 elegance review (cycle 1).