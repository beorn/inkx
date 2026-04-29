---
id: "@km/_orphan/wxtui"
aliases:
  - km-wxtui
created_at: 2026-02-02T17:44:07Z
closed_at: 2026-02-04T11:55:34Z
---

# [x] llm deep: responses interrupted with empty content @km/_orphan #bug #P3

Two consecutive /deep requests were interrupted before returning meaningful content. Both showed '1 chars saved' when trying to recover. Need to investigate timeout handling and partial response persistence.