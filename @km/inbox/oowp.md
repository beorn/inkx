---
id: "@km/inbox/oowp"
aliases:
  - km-oowp
  - "@km/_orphan/oowp"
created_at: 2026-01-26T12:33:17Z
closed_at: 2026-01-26T12:43:19Z
---

# [x] Merge refactor plugin into batch plugin with backend abstraction @km/_orphan #task #P2

Create unified plugins/batch/ with backend abstraction for multi-language support.

Structure:
- tools/lib/core/ - language-agnostic (types, editset, apply)
- tools/lib/backend.ts - backend interface
- tools/lib/backends/ts-morph/ - TypeScript/JS
- tools/lib/backends/ast-grep/ - pattern-based (any language)

Depends on: bug fixes and test fixtures.
See vendor/beorn-claude-tools/plugins/PLAN.md for full structure.