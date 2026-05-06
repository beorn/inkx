---
mentions:
  - km
---

# [x] km-supertags: Implement schema validator @km/storage/supertags #task #P4

Create packages/@km/_orphan/schema/src/validator.ts with:

- SchemaValidator class
- validate(node, options) - Validate node against schema
- Warn on missing required, invalid enum, type mismatch
- Optional strict mode for unknown properties

Create tests in packages/@km/_orphan/schema/tests/validator.test.ts

