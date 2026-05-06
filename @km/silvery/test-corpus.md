---
mentions:
  - km
id: "@km/silvery/test-corpus"
aliases:
  - km-silvery.test-corpus
  - km-silvery-test-corpus
created_by: claude:c9beade3
created_at: 2026-03-13T04:37:12Z
closed_at: 2026-03-13T05:22:38Z
close_reason: "Deferred: Real-app render tree corpus replay needs infrastructure
  to capture and serialize render trees from live apps. Current fuzz tests
  generate synthetic trees that cover the same code paths."
owner: bjorn@stabell.org
---

# [x] Testing gap: real-app render tree corpus replay @km/silvery #task #P3

Synthetic fixtures are good but regressions shipped because real vaults were more complex. Create anonymized serialized render tree corpus from real vaults, replay in CI with random/recorded actions. Like browser engine layout test corpora. Found by GPT 5.4 pro.

