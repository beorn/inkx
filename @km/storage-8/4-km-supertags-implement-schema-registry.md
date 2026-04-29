---
id: "@km/storage-8/4-km-supertags-implement-schema-registry"
aliases:
  - km-storage-8.4
  - km-storage-8-4
  - "@km/storage-8/4"
created_at: 2026-01-21T10:48:28Z
closed_at: 2026-02-14T21:08:00Z
---

# [x] km-supertags: Implement schema registry @km/storage-8 #task #P4

Create packages/@km/_orphan/schema/src/registry.ts with:
- SchemaRegistry class
- register(schema), get(id), list() methods
- resolve(id) - Resolve with inheritance chain
- Detect circular inheritance

Create tests in packages/@km/_orphan/schema/tests/registry.test.ts
