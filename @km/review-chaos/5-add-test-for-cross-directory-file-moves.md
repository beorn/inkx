---
id: "@km/review-chaos/5-add-test-for-cross-directory-file-moves"
aliases:
  - km-review-chaos.5
  - km-review-chaos-5
  - "@km/review-chaos/5"
created_at: 2026-01-23T09:01:33Z
closed_at: 2026-01-23T09:22:19Z
---

# [x] Add test for cross-directory file moves @km/review-chaos #task #P2

File moves between directory trees are untested. Add chaos tests that move files from one directory subtree to another and verify the sync handles it correctly.