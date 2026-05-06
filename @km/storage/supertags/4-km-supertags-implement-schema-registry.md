---
mentions:
  - km
---

# [x] km-supertags: Implement schema registry @km/storage/supertags #task #P4

Create packages/@km/_orphan/schema/src/registry.ts with:

- SchemaRegistry class
- register(schema), get(id), list() methods
- resolve(id) - Resolve with inheritance chain
- Detect circular inheritance

Create tests in packages/@km/_orphan/schema/tests/registry.test.ts

