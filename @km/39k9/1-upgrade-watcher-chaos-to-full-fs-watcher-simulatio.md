---
id: "@km/39k9/1-upgrade-watcher-chaos-to-full-fs-watcher-simulatio"
aliases:
  - km-39k9.1
  - km-39k9-1
  - "@km/39k9/1"
created_at: 2026-01-22T10:04:30Z
closed_at: 2026-01-22T20:24:40Z
---

# [x] Upgrade watcher-chaos to full fs+watcher simulation @km/39k9 #feature #P3

Extend @beorn/watcher-chaos to support full filesystem simulation (virtual fs + watcher), enabling tests without temp directories and with full control over disk errors, permissions, etc. Requires DI refactor in @km/storage for fs operations.