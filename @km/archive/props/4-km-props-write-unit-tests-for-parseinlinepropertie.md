---
mentions:
  - km
id: "@km/props/4-km-props-write-unit-tests-for-parseinlinepropertie"
aliases:
  - km-props.4
  - km-props-4
  - "@km/props/4"
created_at: 2026-01-21T10:47:26Z
closed_at: 2026-01-21T12:12:51Z
---

# [x] km-props: Write unit tests for parseInlineProperties @km/props #task #P1

Create packages/@km/markdown/tests/properties.test.ts with tests for:

- Single link property
- Multiple properties on same line
- Text, number, date property values
- Comma-separated list values
- Edge cases: property at start/end, no properties, malformed
- Property names with hyphens
- Wiki-links with aliases
- Multiple colons in value (URLs)

