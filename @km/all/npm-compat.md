---
id: "@km/all/npm-compat"
aliases:
  - km-all.npm-compat
  - km-all-npm-compat
created_by: Bjørn Stabell
created_at: 2026-04-10T18:45:13Z
closed_at: 2026-04-10T21:40:40Z
---

# [x] npm packaging: Node compat, bundling, bin entries across all vendor packages @km/all #task #P2

Audit and fix npm packaging across silvery + vendor packages. Three tracks: (1) Node compat — identify and replace Bun-specific APIs in published packages so npx/Node consumers work. (2) Bundling — ensure all published packages have build targets, conditional exports (bun→ts, default→dist/js), and dist/ in files. (3) CLI/bin — wire up bin entries for all packages with CLIs, handle Bun vs Node shebang. Created from /big analysis of silvery packaging. Background audits running for full inventory.