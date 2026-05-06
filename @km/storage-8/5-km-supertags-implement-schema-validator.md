---
mentions:
  - km
id: "@km/storage-8/5-km-supertags-implement-schema-validator"
aliases:
  - km-storage-8.5
  - km-storage-8-5
  - "@km/storage-8/5"
created_at: 2026-01-21T10:48:28Z
closed_at: 2026-02-14T21:08:00Z
---

# [x] km-supertags: Implement schema validator @km/storage-8 #task #P4

Create packages/@km/_orphan/schema/src/validator.ts with:

- SchemaValidator class
- validate(node, options) - Validate node against schema
- Warn on missing required, invalid enum, type mismatch
- Optional strict mode for unknown properties

Create tests in packages/@km/_orphan/schema/tests/validator.test.ts

