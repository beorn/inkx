---
id: "@km/inbox/cli-screenshot-root"
aliases:
  - km-cli-screenshot-root
  - "@km/_orphan/cli-screenshot-root"
created_at: 2026-02-01T16:07:35Z
closed_at: 2026-02-01T16:09:40Z
---

# [x] km screenshot fails without nodeRef - no fallback to repo root @km/_orphan #bug #P1

When running 'km screenshot /path/to/vault', the command fails with 'Failed to initialize board state' because it doesn't fall back to repo root node like view.ts does. Fixed by adding getRepoRootNode() fallback.