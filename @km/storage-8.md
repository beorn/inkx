---
id: "@km/storage-8"
aliases:
  - km-storage-8
  - "@km/_orphan/storage-8"
created_at: 2026-01-21T12:00:00Z
---

# [ ] Supertags: Typed Sigil Links with Property Schemas @km/storage-8 #feature #P4

## Overview

Extend sigil links (`@person`, `#project`, `+area`) to act as "supertags" that define schemas - constraining which properties are available/required on nodes with that tag.

Inspired by Tana's supertag system but adapted for km's markdown-native approach.

## Concept

### Current State
Sigil links are simple forward references:
- `@alice` → links to alice node
- `#urgent` → tag
- `+work` → area/project

### With Supertags
Sigil links can define schemas:
- `@issue` → node gains issue-related properties (priority, type, blocks, etc.)
- `@person` → node gains person properties (email, role, team)
- `@book` → node gains book properties (author, rating, genre)

## Schema Definition

### Schema Files

Define schemas in `.km/schemas/` or as special nodes:

```markdown
# @issue.md
---
type: schema
extends: @task
---

# Issue Schema

Properties available on nodes tagged with @issue.

## Properties

- priority:: #P0 | #P1 | #P2 | #P3 | #P4 (required)
- type:: #bug | #feature | #epic | #task | #docs
- blocks:: @issue[]
- blocked-by:: @issue[]
- parent:: @issue
- assignee:: @person
```

```markdown
# @person.md
---
type: schema
---

# Person Schema

- email:: text
- role:: text
- team:: @team
- manager:: @person
```

### Schema Syntax

```
property:: type [constraints] [(required)]
```

Types:
- `text` - free text
- `number` - numeric
- `date` - YYYY-MM-DD
- `@tag` - link to nodes with that tag
- `@tag[]` - array of links
- `#a | #b | #c` - enum of tags
- `boolean` - true/false

## Inheritance (extends)

Schemas can extend others:
```markdown
# @bug.md
---
type: schema
extends: @issue
---

# Bug Schema

Extends @issue with bug-specific properties.

## Properties

- severity:: #critical | #major | #minor
- reproduce-steps:: text
- environment:: text
```

A node with `@bug` has all `@issue` properties plus bug-specific ones.

## Runtime Behavior

### Property Suggestions

In TUI/editor, when editing a node with `@issue`:
- Show available properties in autocomplete
- Highlight required but missing properties
- Validate property values against schema

### Query Enhancement

```
@issue                    # All issues (nodes with @issue tag)
@issue priority::#P0      # Issues with P0 priority
@bug severity::#critical  # Critical bugs
```

### Validation

Optional validation mode:
- Warn on unknown properties for typed nodes
- Warn on missing required properties
- Warn on type mismatches

## Storage

### Schema Registry

```typescript
interface Schema {
  id: string;           // e.g., "issue"
  sigil: '@' | '#' | '+';
  extends?: string;     // Parent schema ID
  properties: PropertyDef[];
}

interface PropertyDef {
  name: string;
  type: PropertyType;
  required?: boolean;
  enum?: string[];      // For enum types
  targetSchema?: string; // For link types (@person)
  array?: boolean;      // For array types
}

type PropertyType = 'text' | 'number' | 'date' | 'link' | 'enum' | 'boolean';
```

### Schema Loading

1. Scan `.km/schemas/*.md` on init
2. Parse schema definitions
3. Build inheritance tree
4. Register in memory

## Implementation

### packages/@km/_orphan/schema/ (new package)

```
km-schema/
├── src/
│   ├── index.ts          # Exports
│   ├── types.ts          # Schema types
│   ├── parser.ts         # Parse schema markdown
│   ├── registry.ts       # Schema registry
│   ├── validator.ts      # Property validation
│   └── inheritance.ts    # Schema inheritance
├── tests/
│   ├── parser.test.ts
│   ├── validator.test.ts
│   └── inheritance.test.ts
└── package.json
```

### Integration Points

1. **@km/storage**: Load schemas on init
2. **@km/markdown**: Pass schema context to parser for validation
3. **@km/tui**: Property autocomplete and validation display
4. **@km/_orphan/cli**: `km schema list`, `km schema show @issue`

## CLI Commands

```bash
km schema list              # List all schemas
km schema show @issue       # Show schema details
km schema validate          # Validate all nodes against schemas
km schema create @book      # Create new schema interactively
```

## Documentation

### docs/future/supertags.md (new)
Full specification of supertag system.

### docs/01-concepts.md
Update sigil links section to mention schemas.

### docs/04-markdown.md
Document schema file format.

## Tests

### packages/@km/_orphan/schema/tests/parser.test.ts
```typescript
describe('schema parser', () => {
  test('parses basic schema', () => {
    const schema = parseSchema(`
# @issue.md
---
type: schema
---
- priority:: #P0 | #P1 | #P2 (required)
- assignee:: @person
    `);
    expect(schema.properties).toHaveLength(2);
    expect(schema.properties[0].required).toBe(true);
  });

  test('handles inheritance', () => {
    const registry = new SchemaRegistry();
    registry.register(issueSchema);
    registry.register(bugSchema); // extends @issue
    
    const resolved = registry.resolve('@bug');
    expect(resolved.properties).toContain('priority'); // inherited
    expect(resolved.properties).toContain('severity'); // own
  });
});
```

## Phases

### Phase 1: Schema Types & Parser (P3)
- [ ] Define schema types
- [ ] Parse schema markdown files
- [ ] Unit tests

### Phase 2: Registry & Inheritance (P3)
- [ ] Schema registry
- [ ] Inheritance resolution
- [ ] Integration tests

### Phase 3: Validation (P4)
- [ ] Property validation
- [ ] Missing required property warnings
- [ ] CLI validate command

### Phase 4: TUI Integration (P4)
- [ ] Property autocomplete
- [ ] Validation display

### Phase 5: Docs (P4)
- [ ] docs/future/supertags.md
- [ ] Update existing docs

## Dependencies

- Requires: @km/props (inline properties system)

## Acceptance Criteria

- [ ] Schema files parsed from .km/schemas/
- [ ] Inheritance works (@bug extends @issue)
- [ ] `km schema list` shows registered schemas
- [ ] Optional validation warns on issues
- [ ] Docs complete