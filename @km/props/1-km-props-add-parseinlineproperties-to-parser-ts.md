---
id: "@km/props/1-km-props-add-parseinlineproperties-to-parser-ts"
aliases:
  - km-props.1
  - km-props-1
  - "@km/props/1"
created_at: 2026-01-21T10:47:03Z
closed_at: 2026-01-21T12:12:14Z
---

# [x] km-props: Add parseInlineProperties() to parser.ts @km/props #task #P1

Add parseInlineProperties() function to packages/@km/markdown/src/parser.ts

Function signature:
```typescript
export function parseInlineProperties(text: string): ParsedProperties {
  props: Record<string, PropertyValue>;    // Parsed values
  propsRaw: Record<string, string>;        // Original strings for round-trip
  cleanText: string;                       // Text with properties removed
}
```

Pattern: `/([a-z][a-z0-9_-]*)::[ ]*(.+?)(?=\s+[a-z][a-z0-9_-]*::|$)/gi`

Property types:
- Link: [[target]] or [[target|alias]]
- Number: 42, 3.14
- Date: YYYY-MM-DD
- Text: any other value
- List: multiple links separated by commas

STATUS: Implementation started - function added to parser.ts
