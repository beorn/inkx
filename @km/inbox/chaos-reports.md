---
id: "@km/_orphan/chaos-reports"
aliases:
  - km-chaos-reports
created_at: 2026-01-23T11:05:14Z
closed_at: 2026-01-23T13:14:27Z
---

# [x] Chaos testing: Automated diagnostic reports @km/_orphan #task #P2

Generate structured chaos reports for failed tests.

## Report structure
```typescript
interface ChaosReport {
  scenario: ChaosScenario;
  seed: number;
  invariantsViolated: string[];
  stateSnapshot: {
    orphanedNodes: KNode[];
    duplicates: Array<{ path: string; count: number }>;
    transactionLog: Transaction[];
  };
  recommendations: Array<{
    type: 'bug' | 'robustness';
    priority: number;
    description: string;
  }>;
}
```

## Benefits
- Automated bug report generation
- Transaction log shows exact failure sequence
- Easy correlation with beads system
- Reproducible via seed