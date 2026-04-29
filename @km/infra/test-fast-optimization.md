---
id: "@km/infra/test-fast-optimization"
aliases:
  - km-infra.test-fast-optimization
  - km-infra-test-fast-optimization
created_by: claude:7f2b8028
created_at: 2026-02-28T22:25:02Z
closed_at: 2026-03-01T09:12:31Z
---

# [x] test:fast optimization — consolidation + import chain @km/infra #task #P1 @claude:7f2b8028

Optimize test:fast to reach <20s target. Three approaches:
1. File consolidation: merge 88 fast files → ~65 (save ~23 imports × 1.8s / 9 workers ≈ 4.6s)
2. Import chain optimization: inkx barrel file forces full library load per test
3. Test taxonomy documentation: 5-layer taxonomy for test classification