---
id: "@km/terminfo/nav-empty-fix"
aliases:
  - km-terminfo.nav-empty-fix
  - km-terminfo-nav-empty-fix
created_by: claude:f8196c1c
created_at: 2026-03-26T17:00:08Z
closed_at: 2026-03-26T17:00:14Z
close_reason: Built allTerminals from terminals.json, deduplicated by slug,
  removed empty Backends sidebar section. Nav now shows all 15 terminals.
---

# [x] Fix empty Terminals nav dropdown on terminfo.dev @km/terminfo #bug #P2 @claude:f8196c1c

All headless backends were subsumed by app terminals in terminals.json, leaving the nav and sidebar Terminals/Backends sections empty. Fixed by building allTerminals list from terminals.json directly.