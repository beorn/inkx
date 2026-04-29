---
id: "@km/_orphan/q5qk"
aliases:
  - km-q5qk
created_at: 2026-01-20T14:25:35Z
closed_at: 2026-01-20T14:36:54Z
---

# [x] inkx/chalkx: BG_OVERRIDE_CODE constant duplicated @km/_orphan #task #P1

High: BG_OVERRIDE_CODE=9999 is defined separately in chalkx/src/index.ts:80 and inkx/src/unicode.ts:584. If protocol changes, both must be updated. Consider exporting from one package and importing in the other.