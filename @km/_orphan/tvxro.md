---
id: "@km/_orphan/tvxro"
aliases:
  - km-tvxro
created_by: claude:fed8de9e
created_at: 2026-03-29T07:11:33Z
closed_at: 2026-03-29T15:38:06Z
close_reason: Closed
---

# [x] Post-release: GitHub release for silvery v0.9.0 + CI verification @km/_orphan #task #P0

GitHub API rate limited during v0.9.0 release. Remaining tasks:

1. Create GitHub release for silvery v0.9.0 (tag v0.9.0 already pushed): gh release create v0.9.0 --title v0.9.0 --notes-file with changelog
2. Verify docs CI deployed successfully to silvery.dev (blog/live-demo removed, canvas showcase, code-group tabs)
3. Verify npm installs work: npx silvery examples
4. Create GitHub releases for commander-v0.8.1 and ansi-v0.3.1 tags (optional, sub-packages)
5. Rename this bead from random ID to @km/silvery/v090-release