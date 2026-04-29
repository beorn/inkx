---
id: "@km/tools/bd-verify-find-repo-root"
aliases:
  - km-tools.bd-verify-find-repo-root
  - km-tools-bd-verify-find-repo-root
created_by: claude:cc081a9a
created_at: 2026-04-27T20:23:39Z
closed_at: 2026-04-27T20:41:29Z
close_reason: "5fb3e6e24 — replaced spawnSync('test',...) with fs.existsSync +
  statSync.isDirectory() in findRepoRoot; added import.meta.url fallback for
  vitest/node where import.meta.dir is empty. Verified: 41/41 unit tests pass
  (incl. findRepoRoot test); 0 typecheck errors."
---

# [x] bd-verify: replace test-spawn with fs.existsSync in findRepoRoot @km/tools #task #P3 @claude:cc081a9a

blocks:: [[@km/all/bd-verify-primitive]]

From dual-pro review of bd-verify Phase 1 ship (Kimi K2.6 winner, 2026-04-27): findRepoRoot spawns 'test' via execSync to check directory existence — slow + brittle. Replace with fs.existsSync. Reference: /tmp/llm-cc081a9a-review-three-pieces-of-mjjw.txt lines 256-261.