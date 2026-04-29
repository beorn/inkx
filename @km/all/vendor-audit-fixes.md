---
id: "@km/all/vendor-audit-fixes"
aliases:
  - km-all.vendor-audit-fixes
  - km-all-vendor-audit-fixes
created_by: claude:01d3c99a
created_at: 2026-04-19T07:18:52Z
closed_at: 2026-04-19T07:26:38Z
close_reason: "Audit fixes committed in b3b8ce40 (silvery agent's commit
  accidentally absorbed staged changes — work is in, message mismatched). Fixed:
  LICENSE files (alien-trees already had it tracked, theme-detect staged in
  silvery submodule), workspace dep alignment (ulid/yaml/mdast in km internal
  pkgs, @types/node in mdspec), npm-packages.md drift sync (silvery 0.18.0,
  vterm.js 0.4.0, @bearly/tribe 0.11.1, vitepress-enrich 0.3.6, +theme-detect
  entry), 3 dead doc links. Deferred: mdspec major bumps (zod v3→v4, vitest
  v3→v4) need explicit per-package decision; releases need user approval
  (loggily +80, silvery +17, @bearly/tribe +55 etc)"
owner: bjorn@stabell.org
---

# [x] Fix vendor audit findings (2026-04-19) @km/all #task #P2

LICENSE files, sherif workspace consistency, npm-packages.md drift, dead links, publishConfig.bin