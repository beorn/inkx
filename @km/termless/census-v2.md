---
id: "@km/termless/census-v2"
aliases:
  - km-termless.census-v2
  - km-termless-census-v2
created_by: claude:4929065a
created_at: 2026-03-22T23:23:19Z
closed_at: 2026-03-23T00:00:40Z
close_reason: "Pure vitest census: 61 probes × backends, slug IDs, meta
  descriptions, census() wrapper with Proxy pattern, partial() helper, dedicated
  vitest config"
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Census v2: pure vitest with native meta, PartialSupport error, custom reporter @km/termless #task #P1 @claude:4929065a

Rework census to use pure vitest instead of custom runner. Tests ARE the probes. describe() meta for category/spec, test() meta for feature ID. PartialSupport error type for partial support. Custom reporter transforms vitest JSON → census.json. Backend-first: init once, reset between probes.