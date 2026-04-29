---
id: "@km/mdtest/blank-lines-dropped"
aliases:
  - km-mdtest.blank-lines-dropped
  - km-mdtest-blank-lines-dropped
created_by: claude:65d845d9
created_at: 2026-03-14T00:12:49Z
closed_at: 2026-03-14T01:28:39Z
close_reason: Closed
owner: bjorn@stabell.org
---

# [x] mdtest: internal blank lines in stdout/stderr silently removed @km/mdtest #bug #P1

plugin-executor.ts result.stdout.split('\n').filter(l => l \!== '') drops ALL empty lines, not just trailing ones. Legitimate outputs containing blank lines impossible to match, snapshot updates erase them. Fix: reuse splitNorm() and only trim trailing empty strings. plugin-executor.ts:96-106. Found by GPT 5.4 Pro review.