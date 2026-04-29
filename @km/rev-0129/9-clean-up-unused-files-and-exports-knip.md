---
id: "@km/rev-0129/9-clean-up-unused-files-and-exports-knip"
aliases:
  - km-rev-0129.9
  - km-rev-0129-9
  - "@km/rev-0129/9"
created_at: 2026-01-29T16:36:05Z
closed_at: 2026-01-29T18:09:24Z
---

# [x] Clean up unused files and exports (knip) @km/rev-0129 #task #P4 @claude:298008b9

Knip findings:
- 23 unused files (mostly vendor/, benchmarks/, infra/)
- 65 unused exports (many in vendor/)
- 4 unused dependencies: chalk (@km/_orphan/cli), eslint-plugin-promise, typescript-eslint, vite-tsconfig-paths (@km/infra)
- 22 unused devDependencies (workspace packages)

Review and remove what's safe. Some vendor/ items are upstream concerns.