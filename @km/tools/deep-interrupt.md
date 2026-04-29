---
id: "@km/tools/deep-interrupt"
aliases:
  - km-tools.deep-interrupt
  - km-tools-deep-interrupt
created_at: 2026-02-04T11:55:28Z
closed_at: 2026-02-04T12:29:46Z
---

# [x] llm deep: responses interrupted with empty content @km/tools #bug #P3 @claude:a7826e85

Two consecutive /deep requests were interrupted before returning meaningful content. Both showed '1 chars saved' when trying to recover. Need to investigate timeout handling and partial response persistence.