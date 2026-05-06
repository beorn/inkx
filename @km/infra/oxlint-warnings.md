---
mentions:
  - km
id: "@km/infra/oxlint-warnings"
aliases:
  - km-infra.oxlint-warnings
  - km-infra-oxlint-warnings
created_by: claude:1c01b987
created_at: 2026-03-21T06:51:12Z
owner: bjorn@stabell.org
---

# [ ] Fix all oxlint warnings (245 remaining) @km/infra #task #P3

All errors eliminated (422 warnings + 20 errors → 245 warnings + 0 errors as of 2026-03-24). Remaining 245 warnings are almost entirely complexity in parsers/renderers (parseAnsiText, feed, renderText, etc.) that cannot be simplified without making them worse. Options: raise complexity threshold, suppress per-function, or refactor the largest offenders.

