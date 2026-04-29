---
id: "@km/_orphan/lq99s"
aliases:
  - km-lq99s
created_by: claude:b509d761
created_at: 2026-02-10T12:11:05Z
closed_at: 2026-02-14T09:08:05Z
---

# [x] Extended fuzz seeds (10K) for CI nightly runs @km/_orphan #task #P3 @claude:124bfbe5

Run 10K fuzz seeds (vs current 1100) in a CI nightly job. Current 500 seeds in the main fuzz group take ~300ms; 10K would be ~6s, acceptable for nightly. Also add a weekly 100K seed run for thorough coverage. Requires CI infrastructure (GitHub Actions or similar). See docs/testing.md.