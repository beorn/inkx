---
id: "@km/domain-objects/1-add-service-interface-to-km-core"
aliases:
  - km-domain-objects.1
  - km-domain-objects-1
  - "@km/domain-objects/1"
created_at: 2026-01-23T10:22:00Z
closed_at: 2026-01-23T11:21:06Z
---

# [x] Add Service interface to @km/core @km/domain-objects #task #P2

Add Service interface for lifecycle-managed objects.

```typescript
// packages/km-core/src/service.ts
export interface Service extends AsyncDisposable {
  readonly status: "stopped" | "starting" | "running" | "stopping";
  start(): Promise<void>;
  stop(): Promise<void>;
}
```

Export from @km/core index.