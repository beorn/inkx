---
mentions:
  - km
  - claude
id: "@km/infra/esm-dist"
aliases:
  - km-infra.esm-dist
  - km-infra-esm-dist
created_by: claude:4929065a
created_at: 2026-03-24T06:01:40Z
closed_at: 2026-03-24T06:56:07Z
close_reason: "Done: switched to raw .ts publishing with engines node>=23.6.0.
  No dist, no build step. Sindre pattern replaced by native TS support."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Fix ESM publishing: compile to dist/, exports point to .js + .d.ts @km/infra #task #P1 @claude:4929065a

silvery, termless, vt100.js publish raw .ts — violates Node.js module resolution. Follow flexily pattern: compile to dist/, export .js + .d.ts, moduleResolution nodenext.

