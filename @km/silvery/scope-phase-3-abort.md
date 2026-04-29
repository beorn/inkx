---
id: "@km/silvery/scope-phase-3-abort"
aliases:
  - km-silvery.scope-phase-3-abort
  - km-silvery-scope-phase-3-abort
created_by: claude:2aefb4b6
created_at: 2026-04-24T20:39:52Z
closed_at: 2026-04-24T22:35:17Z
close_reason: N/A — 0 raw new AbortController() sites in apps/ or packages/
  (verified 2026-04-24 via grep). The few that exist live in vendor/*
  (third-party or vendor-package internals) which Phase 3 explicitly excludes.
  Re-open if a future grep finds in-scope sites.
---

# [x] Phase 3.3: Raw new AbortController migration @km/silvery #task #P2

blocks:: [[@km/silvery/lifecycle-scope]], [[@km/silvery/scope-phase-2]]

Replace raw new AbortController() with useScopeEffect + scope.signal. Example: useScopeEffect(scope => { void fetch(url, { signal: scope.signal }) }, [url]). Exit: grep shows zero new AbortController() outside @silvery/* + vendor/*.