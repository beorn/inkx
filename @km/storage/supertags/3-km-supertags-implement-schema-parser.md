---
mentions:
  - km
---

# [x] km-supertags: Implement schema parser @km/storage/supertags #task #P4

Create packages/@km/_orphan/schema/src/parser.ts with:

- parseSchema(markdown) - Parse schema markdown file
- Extract property definitions from list items
- Handle property types: text, number, date, boolean, enum, link
- Parse required marker, array type, extends clause

Create tests in packages/@km/_orphan/schema/tests/parser.test.ts

