---
id: "@km/silvery/api-audit"
aliases:
  - km-silvery.api-audit
  - km-silvery-api-audit
created_by: claude:474834b0
created_at: 2026-03-09T21:49:46Z
closed_at: 2026-03-09T23:49:31Z
close_reason: "api-audit.md updated: added @silvery/term/ansi entry point that
  was missing. Full export catalog documented."
---

# [x] API surface audit: remove accidental public exports @km/silvery #task #P2

Audit all silvery entry points and remove any accidentally exported internals. Ensure only intended public API is reachable.