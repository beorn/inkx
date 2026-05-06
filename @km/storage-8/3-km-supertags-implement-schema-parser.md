---
mentions:
  - km
id: "@km/storage-8/3-km-supertags-implement-schema-parser"
aliases:
  - km-storage-8.3
  - km-storage-8-3
  - "@km/storage-8/3"
created_at: 2026-01-21T10:48:28Z
closed_at: 2026-02-14T21:08:00Z
---

# [x] km-supertags: Implement schema parser @km/storage-8 #task #P4

Create packages/@km/_orphan/schema/src/parser.ts with:

- parseSchema(markdown) - Parse schema markdown file
- Extract property definitions from list items
- Handle property types: text, number, date, boolean, enum, link
- Parse required marker, array type, extends clause

Create tests in packages/@km/_orphan/schema/tests/parser.test.ts

