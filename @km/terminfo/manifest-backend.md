---
id: "@km/terminfo/manifest-backend"
aliases:
  - km-terminfo.manifest-backend
  - km-terminfo-manifest-backend
created_by: claude:4929065a
created_at: 2026-04-02T19:42:38Z
closed_at: 2026-04-07T05:47:59Z
close_reason: Fixed in km 994453526 (vendor/terminfo.dev e9faf12). Page
  generator now indexes probed pages by backendId and inherits
  version/generated/total/yes/no/partial/pct/categories from manifestBackend
  source for unprobed terminals. Adds inheritedFrom params + rendered note. cmux
  now shows ghostty's stats (total=251, yes=232, pct=92). Non-recursive — source
  must have its own probes.
---

# [x] Unprobed terminals with manifestBackend should inherit probe results (cmux shows no stats) @km/terminfo #bug #P1 @Bjørn Stabell

cmux has manifestBackend: ghostty in terminals.json but the page at /terminals/cmux shows no feature stats. The page generator creates empty pages for unprobed terminals but doesn't check manifestBackend to inherit results from the linked backend. Fix: in [id].paths.ts, when generating a page for a terminal without its own probes, check manifestBackend and use that backend's results.