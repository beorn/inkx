---
id: "@km/terminfo/auto-link-entities"
aliases:
  - km-terminfo.auto-link-entities
  - km-terminfo-auto-link-entities
created_by: claude:4929065a
created_at: 2026-04-02T18:26:29Z
owner: bjorn@stabell.org
---

# [ ] Auto-link terminal names, features, and standards across all terminfo.dev pages @km/terminfo #feature #P2

Extend @bearly/vitepress-enrich to auto-link entity references. When 'xterm.js' appears in text, link to /terminals/xtermjs. When 'SGR' appears, link to /text-styling/sgr. All entities with pages become auto-linked.