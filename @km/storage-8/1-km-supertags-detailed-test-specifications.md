---
id: "@km/storage-8/1-km-supertags-detailed-test-specifications"
aliases:
  - km-storage-8.1
  - km-storage-8-1
  - "@km/storage-8/1"
created_at: 2026-01-21T10:32:00Z
closed_at: 2026-02-14T21:08:00Z
---

# [x] km-supertags: Detailed Test Specifications @km/storage-8 #task #P4

## Tests (Detailed)

### Layer 1: Schema Parser Tests

**File:** `packages/km-schema/tests/parser.test.ts`

```typescript
describe('parseSchema', () => {
  test('parses basic schema from markdown', () => {
    const md = `# @issue
---
type: schema
---
- priority:: #P0 | #P1 | #P2 | #P3 | #P4 (required)
- assignee:: @person
- blocks:: @issue[]
`;
    const schema = parseSchema(md);
    
    expect(schema.id).toBe('issue');
    expect(schema.sigil).toBe('@');
    expect(schema.properties).toHaveLength(3);
  });

  test('parses required property marker', () => {
    const md = `# @task
---
type: schema
---
- title:: text (required)
- description:: text
`;
    const schema = parseSchema(md);
    
    const title = schema.properties.find(p => p.name === 'title');
    const desc = schema.properties.find(p => p.name === 'description');
    
    expect(title?.required).toBe(true);
    expect(desc?.required).toBeFalsy();
  });

  test('parses enum type from pipe-separated tags', () => {
    const md = `# @issue
---
type: schema
---
- priority:: #P0 | #P1 | #P2
`;
    const schema = parseSchema(md);
    const priority = schema.properties.find(p => p.name === 'priority');
    
    expect(priority?.type).toBe('enum');
    expect(priority?.enum).toEqual(['P0', 'P1', 'P2']);
  });

  test('parses link type from sigil reference', () => {
    const md = `# @task
---
type: schema
---
- assignee:: @person
- parent:: @epic
`;
    const schema = parseSchema(md);
    
    const assignee = schema.properties.find(p => p.name === 'assignee');
    expect(assignee?.type).toBe('link');
    expect(assignee?.targetSchema).toBe('person');
  });

  test('parses array type from [] suffix', () => {
    const md = `# @issue
---
type: schema
---
- blocks:: @issue[]
- tags:: text[]
`;
    const schema = parseSchema(md);
    
    const blocks = schema.properties.find(p => p.name === 'blocks');
    expect(blocks?.array).toBe(true);
    expect(blocks?.type).toBe('link');
    
    const tags = schema.properties.find(p => p.name === 'tags');
    expect(tags?.array).toBe(true);
    expect(tags?.type).toBe('text');
  });

  test('parses extends clause', () => {
    const md = `# @bug
---
type: schema
extends: @issue
---
- severity:: #critical | #major | #minor
`;
    const schema = parseSchema(md);
    
    expect(schema.extends).toBe('issue');
  });

  test('handles primitive types', () => {
    const md = `# @book
---
type: schema
---
- title:: text
- rating:: number
- published:: date
- recommended:: boolean
`;
    const schema = parseSchema(md);
    
    expect(schema.properties.find(p => p.name === 'title')?.type).toBe('text');
    expect(schema.properties.find(p => p.name === 'rating')?.type).toBe('number');
    expect(schema.properties.find(p => p.name === 'published')?.type).toBe('date');
    expect(schema.properties.find(p => p.name === 'recommended')?.type).toBe('boolean');
  });
});
```

### Layer 2: Schema Registry & Inheritance Tests

**File:** `packages/km-schema/tests/registry.test.ts`

```typescript
describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  test('registers and retrieves schema', () => {
    const schema = { id: 'issue', sigil: '@', properties: [] };
    registry.register(schema);
    
    expect(registry.get('issue')).toBe(schema);
    expect(registry.get('@issue')).toBe(schema);
  });

  test('resolves schema with inheritance', () => {
    const issueSchema = {
      id: 'issue',
      sigil: '@',
      properties: [
        { name: 'priority', type: 'enum', enum: ['P0', 'P1', 'P2'] },
        { name: 'assignee', type: 'link', targetSchema: 'person' }
      ]
    };
    
    const bugSchema = {
      id: 'bug',
      sigil: '@',
      extends: 'issue',
      properties: [
        { name: 'severity', type: 'enum', enum: ['critical', 'major', 'minor'] }
      ]
    };
    
    registry.register(issueSchema);
    registry.register(bugSchema);
    
    const resolved = registry.resolve('@bug');
    
    // Has own properties
    expect(resolved.properties.some(p => p.name === 'severity')).toBe(true);
    // Has inherited properties
    expect(resolved.properties.some(p => p.name === 'priority')).toBe(true);
    expect(resolved.properties.some(p => p.name === 'assignee')).toBe(true);
  });

  test('handles multi-level inheritance', () => {
    registry.register({ id: 'task', properties: [{ name: 'status' }] });
    registry.register({ id: 'issue', extends: 'task', properties: [{ name: 'priority' }] });
    registry.register({ id: 'bug', extends: 'issue', properties: [{ name: 'severity' }] });
    
    const resolved = registry.resolve('@bug');
    
    expect(resolved.properties.some(p => p.name === 'status')).toBe(true);    // from task
    expect(resolved.properties.some(p => p.name === 'priority')).toBe(true);  // from issue
    expect(resolved.properties.some(p => p.name === 'severity')).toBe(true);  // own
  });

  test('child property overrides parent property', () => {
    registry.register({
      id: 'base',
      properties: [{ name: 'level', type: 'enum', enum: ['low', 'high'] }]
    });
    registry.register({
      id: 'extended',
      extends: 'base',
      properties: [{ name: 'level', type: 'enum', enum: ['1', '2', '3', '4'] }]
    });
    
    const resolved = registry.resolve('@extended');
    const level = resolved.properties.find(p => p.name === 'level');
    
    expect(level?.enum).toEqual(['1', '2', '3', '4']);
  });

  test('detects circular inheritance', () => {
    registry.register({ id: 'a', extends: 'b', properties: [] });
    registry.register({ id: 'b', extends: 'a', properties: [] });
    
    expect(() => registry.resolve('@a')).toThrow(/circular/i);
  });

  test('lists all registered schemas', () => {
    registry.register({ id: 'issue', properties: [] });
    registry.register({ id: 'person', properties: [] });
    registry.register({ id: 'project', properties: [] });
    
    const all = registry.list();
    expect(all).toHaveLength(3);
    expect(all.map(s => s.id)).toContain('issue');
  });
});
```

### Layer 3: Validator Tests

**File:** `packages/km-schema/tests/validator.test.ts`

```typescript
describe('SchemaValidator', () => {
  let registry: SchemaRegistry;
  let validator: SchemaValidator;

  beforeEach(() => {
    registry = new SchemaRegistry();
    registry.register({
      id: 'issue',
      sigil: '@',
      properties: [
        { name: 'priority', type: 'enum', enum: ['P0', 'P1', 'P2'], required: true },
        { name: 'assignee', type: 'link', targetSchema: 'person' },
        { name: 'rating', type: 'number' }
      ]
    });
    validator = new SchemaValidator(registry);
  });

  test('validates node with correct properties', () => {
    const node = {
      content: 'Fix bug @issue',
      data: { props: { priority: 'P1', assignee: ['alice'] } }
    };
    
    const result = validator.validate(node);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });

  test('warns on missing required property', () => {
    const node = {
      content: 'Fix bug @issue',
      data: { props: { assignee: ['alice'] } }  // missing priority
    };
    
    const result = validator.validate(node);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'missing_required',
        property: 'priority'
      })
    );
  });

  test('warns on invalid enum value', () => {
    const node = {
      content: 'Fix bug @issue',
      data: { props: { priority: 'P5' } }  // invalid
    };
    
    const result = validator.validate(node);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'invalid_enum',
        property: 'priority',
        value: 'P5'
      })
    );
  });

  test('warns on wrong type (number expected)', () => {
    const node = {
      content: 'Rate book @book',
      data: { props: { rating: 'five' } }  // should be number
    };
    
    const result = validator.validate(node);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'type_mismatch',
        property: 'rating'
      })
    );
  });

  test('warns on unknown property (optional strict mode)', () => {
    const node = {
      content: 'Fix bug @issue',
      data: { props: { priority: 'P1', unknown_prop: 'value' } }
    };
    
    const result = validator.validate(node, { strict: true });
    expect(result.warnings).toContainEqual(
      expect.objectContaining({
        type: 'unknown_property',
        property: 'unknown_prop'
      })
    );
  });

  test('skips validation for nodes without schema tags', () => {
    const node = {
      content: 'Regular task without @issue tag',
      data: { props: { anything: 'goes' } }
    };
    
    const result = validator.validate(node);
    expect(result.valid).toBe(true);
    expect(result.warnings).toHaveLength(0);
  });
});
```

### Layer 4: Integration Tests

**File:** `packages/km-schema/tests/integration.test.ts`

```typescript
describe('Schema Integration', () => {
  test('loads schemas from .km/schemas/ directory', async () => {
    // Setup test vault with schema files
    await writeFile('.km/schemas/@issue.md', `
# @issue
---
type: schema
---
- priority:: #P0 | #P1 | #P2 (required)
`);
    
    const registry = await loadSchemas('.km/schemas/');
    expect(registry.get('@issue')).toBeDefined();
  });

  test('validates nodes after loading from markdown', () => {
    const md = `- [ ] Fix bug @issue priority:: P1`;
    const nodes = parseMarkdownToNodes(md, 'test.md');
    const task = nodes.find(n => n.type === 'task');
    
    const result = validator.validate(task);
    expect(result.valid).toBe(true);
  });
});
```

---

## Acceptance Criteria (Detailed)

### Parser
- [ ] Parses schema files from markdown
- [ ] Extracts property definitions
- [ ] Handles all property types (text, number, date, boolean, enum, link)
- [ ] Parses required marker
- [ ] Parses array type ([])
- [ ] Parses extends clause

### Registry
- [ ] Registers and retrieves schemas
- [ ] Resolves inheritance chain
- [ ] Handles multi-level inheritance
- [ ] Child properties override parent
- [ ] Detects circular inheritance

### Validator
- [ ] Validates correct properties pass
- [ ] Warns on missing required property
- [ ] Warns on invalid enum value
- [ ] Warns on type mismatch
- [ ] Optional strict mode for unknown properties
- [ ] Skips nodes without schema tags

### Quality
- [ ] `bun run test:fast` passes
- [ ] `bun run test:all` passes