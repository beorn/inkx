---
mentions:
  - km
id: "@km/props"
aliases:
  - km-props
  - "@km/_orphan/props"
created_at: 2026-01-21T12:00:00Z
closed_at: 2026-01-21T15:31:33Z
---

# [x] Inline Properties System (Logseq/Tana compatible) @km/props #feature #P1

## Overview

Implement a property system using `property:: value` syntax, compatible with Logseq and inspired by Tana. This enables typed/semantic links and structured metadata inline with content.

## Syntax

### Basic Properties

```markdown
- [ ] Deploy to production @issue blocks:: [[km-auth]]
- [ ] Fix auth bug @issue blocked-by:: [[km-a1b2]], [[km-c3d4]]
- [ ] Book review author:: [[Oscar Wilde]] rating:: 5
```

### Property Types

| Type   | Example                   | Storage                                 |
| ------ | ------------------------- | --------------------------------------- |
| Link   | blocks:: [[km-a1b2]]      | data.props.blocks = ["km-a1b2"]         |
| Text   | reason:: Fixed in PR #123 | data.props.reason = "Fixed in PR #123"  |
| Number | rating:: 5                | data.props.rating = 5                   |
| Date   | reviewed:: 2026-01-21     | data.props.reviewed = "2026-01-21"      |
| List   | tags:: #urgent, #backend  | data.props.tags = ["urgent", "backend"] |

### Relation Properties (Links with Semantics)

```markdown
blocks:: [[target]]      # This issue blocks target
blocked-by:: [[target]]  # This issue is blocked by target
parent:: [[epic]]        # This is a child of epic
related:: [[other]]      # Related to other
waits-for:: [[external]] # Waiting on external dependency
author:: [[person]]      # Authored by person
```

## Parser Changes

### @km/markdown/src/parser.ts

1. Add `parseInlineProperties()` function:

```typescript
interface InlineProperty {
  name: string;
  value: string | string[];
  type: 'link' | 'text' | 'number' | 'date' | 'list';
  raw: string;  // Original text for serialization
}

function parseInlineProperties(text: string): {
  properties: Record<string, InlineProperty>;
  cleanText: string;  // Text with properties removed
}
```

2. Regex pattern: `/([a-z][a-z0-9-]*)::[ ]*([^,\n]+(?:,[ ]*[^,\n]+)*)/gi`
3. Handle wiki-link values: `[[target]]` → extract ID
4. Handle comma-separated lists: `a, b, c` → array

### @km/markdown/src/nodes2md.ts

1. Serialize properties back to `prop:: value` format
2. Preserve original formatting where possible
3. Handle multi-value properties with commas

### @km/_orphan/core/src/types.ts

Extend KNode.data:

```typescript
interface NodeData {
  props?: Record<string, unknown>;  // Inline properties
  // ... existing fields
}
```

## Storage

Properties stored in `data.props` JSON field:

```json
{
  "props": {
    "blocks": ["01ABC123"],
    "author": ["01DEF456"],
    "rating": 5,
    "reason": "Fixed in PR #123"
  }
}
```

## Query Extensions

### @km/storage/src/query.ts

Add property queries:

```
blocks::*           # Has any blocks property
blocks::km-a1b2     # Blocks specific issue
author::[[Alice]]   # Author is Alice
rating::5           # Rating equals 5
rating:>3           # Rating greater than 3
```

### Blocked Query

`blocked:true` = has `blocked-by::` property pointing to non-done issues
`blocked:false` = no blockers or all blockers done

## Backlink Integration

Properties that reference other nodes create backlinks:

- `blocks:: [[km-a1b2]]` on node X → X appears in @km/_orphan/a1b2's backlinks
- Backlink shows the relationship type: "blocked by X"

## Documentation

### docs/04-markdown.md

Add section on inline properties syntax and parsing.

### docs/05-query.md

Add property query syntax and examples.

### docs/01-concepts.md

Update Links section to include property-based relations.

---

## Tests

### Layer 1: Parser Unit Tests (90% coverage target)

**File:** `packages/km-markdown/tests/properties.test.ts`

```typescript
describe('parseInlineProperties', () => {
  // Basic parsing
  test('parses single link property', () => {
    const result = parseInlineProperties('Task blocks:: [[km-a1b2]]');
    expect(result.properties.blocks).toEqual({
      name: 'blocks',
      value: ['km-a1b2'],
      type: 'link',
      raw: 'blocks:: [[km-a1b2]]'
    });
    expect(result.cleanText).toBe('Task');
  });

  test('parses multiple properties on same line', () => {
    const result = parseInlineProperties(
      'Task blocks:: [[a]], [[b]] priority:: 1'
    );
    expect(result.properties.blocks.value).toEqual(['a', 'b']);
    expect(result.properties.priority.value).toBe(1);
    expect(result.properties.priority.type).toBe('number');
  });

  test('parses text property values', () => {
    const result = parseInlineProperties('reason:: Fixed in PR #123');
    expect(result.properties.reason.value).toBe('Fixed in PR #123');
    expect(result.properties.reason.type).toBe('text');
  });

  test('parses date property values', () => {
    const result = parseInlineProperties('reviewed:: 2026-01-21');
    expect(result.properties.reviewed.value).toBe('2026-01-21');
    expect(result.properties.reviewed.type).toBe('date');
  });

  test('parses comma-separated list values', () => {
    const result = parseInlineProperties('tags:: #urgent, #backend, #api');
    expect(result.properties.tags.value).toEqual(['#urgent', '#backend', '#api']);
    expect(result.properties.tags.type).toBe('list');
  });

  // Edge cases
  test('handles property at start of line', () => {
    const result = parseInlineProperties('blocks:: [[x]]');
    expect(result.properties.blocks.value).toEqual(['x']);
    expect(result.cleanText).toBe('');
  });

  test('handles property at end of line', () => {
    const result = parseInlineProperties('My task blocks:: [[x]]');
    expect(result.cleanText).toBe('My task');
  });

  test('handles no properties', () => {
    const result = parseInlineProperties('Just a regular task');
    expect(result.properties).toEqual({});
    expect(result.cleanText).toBe('Just a regular task');
  });

  test('handles empty value', () => {
    const result = parseInlineProperties('note::');
    expect(result.properties.note.value).toBe('');
  });

  test('handles property name with hyphens', () => {
    const result = parseInlineProperties('blocked-by:: [[km-123]]');
    expect(result.properties['blocked-by'].value).toEqual(['km-123']);
  });

  test('handles wiki-link with alias', () => {
    const result = parseInlineProperties('author:: [[Alice Smith|Alice]]');
    expect(result.properties.author.value).toEqual(['Alice Smith']);
  });

  test('ignores malformed property (no double colon)', () => {
    const result = parseInlineProperties('not-a-property: value');
    expect(result.properties).toEqual({});
  });

  test('handles multiple colons in value', () => {
    const result = parseInlineProperties('url:: https://example.com');
    expect(result.properties.url.value).toBe('https://example.com');
  });
});
```

### Layer 2: Round-trip Tests (CRITICAL)

**File:** `packages/km-markdown/tests/properties-roundtrip.test.ts`

```typescript
describe('Properties Round-trip', () => {
  // Single round-trip: parse → serialize → compare
  test('preserves single link property', () => {
    const original = '- [ ] Task blocks:: [[km-a1b2]]';
    const nodes = parseMarkdownToNodes(original, 'test.md');
    const output = nodesToMarkdown(nodes);
    expect(output).toContain('blocks:: [[km-a1b2]]');
  });

  test('preserves multiple link values', () => {
    const original = '- [ ] Task blocked-by:: [[a]], [[b]], [[c]]';
    const nodes = parseMarkdownToNodes(original, 'test.md');
    const output = nodesToMarkdown(nodes);
    expect(output).toContain('blocked-by:: [[a]], [[b]], [[c]]');
  });

  test('preserves property order on line', () => {
    const original = '- [ ] Task blocks:: [[x]] priority:: 1 author:: [[bob]]';
    const nodes = parseMarkdownToNodes(original, 'test.md');
    const output = nodesToMarkdown(nodes);
    // Properties should appear in same order
    const blocksIdx = output.indexOf('blocks::');
    const priorityIdx = output.indexOf('priority::');
    const authorIdx = output.indexOf('author::');
    expect(blocksIdx).toBeLessThan(priorityIdx);
    expect(priorityIdx).toBeLessThan(authorIdx);
  });

  test('preserves text property with special characters', () => {
    const original = '- [ ] Task reason:: Fixed in PR #123 (urgent)';
    const nodes = parseMarkdownToNodes(original, 'test.md');
    const output = nodesToMarkdown(nodes);
    expect(output).toContain('reason:: Fixed in PR #123 (urgent)');
  });

  test('preserves number property', () => {
    const original = '- [ ] Book rating:: 5';
    const nodes = parseMarkdownToNodes(original, 'test.md');
    const output = nodesToMarkdown(nodes);
    expect(output).toContain('rating:: 5');
  });

  test('preserves date property', () => {
    const original = '- [ ] Review reviewed:: 2026-01-21';
    const nodes = parseMarkdownToNodes(original, 'test.md');
    const output = nodesToMarkdown(nodes);
    expect(output).toContain('reviewed:: 2026-01-21');
  });

  // Double round-trip: parse → serialize → parse → serialize → compare
  test('stable after double round-trip (link property)', () => {
    const original = '- [ ] Task blocks:: [[km-a1b2]]';
    
    const nodes1 = parseMarkdownToNodes(original, 'test.md');
    const md1 = nodesToMarkdown(nodes1);
    
    const nodes2 = parseMarkdownToNodes(md1, 'test.md');
    const md2 = nodesToMarkdown(nodes2);
    
    expect(md1.trim()).toBe(md2.trim());
  });

  test('stable after double round-trip (multiple properties)', () => {
    const original = '- [ ] Task blocks:: [[a]], [[b]] priority:: 1';
    
    const nodes1 = parseMarkdownToNodes(original, 'test.md');
    const md1 = nodesToMarkdown(nodes1);
    
    const nodes2 = parseMarkdownToNodes(md1, 'test.md');
    const md2 = nodesToMarkdown(nodes2);
    
    expect(md1.trim()).toBe(md2.trim());
  });

  test('stable after double round-trip (mixed content)', () => {
    const original = `# Document

## Tasks

- [ ] Deploy to prod @issue blocks:: [[km-auth]] priority:: 1
- [ ] Fix bug blocked-by:: [[km-a1b2]], [[km-c3d4]]
- [x] Done task author:: [[alice]]

## Notes

Regular paragraph here.`;
    
    const nodes1 = parseMarkdownToNodes(original, 'test.md');
    const md1 = nodesToMarkdown(nodes1);
    
    const nodes2 = parseMarkdownToNodes(md1, 'test.md');
    const md2 = nodesToMarkdown(nodes2);
    
    expect(md1.trim()).toBe(md2.trim());
  });

  // Data model preservation
  test('properties stored in data.props after parse', () => {
    const original = '- [ ] Task blocks:: [[km-a1b2]] rating:: 5';
    const nodes = parseMarkdownToNodes(original, 'test.md');
    const task = nodes.find(n => n.type === 'task');
    
    expect(task?.data?.props).toBeDefined();
    expect(task?.data?.props?.blocks).toEqual(['km-a1b2']);
    expect(task?.data?.props?.rating).toBe(5);
  });

  test('properties survive storage round-trip', () => {
    // Parse → store in DB → retrieve → serialize
    const original = '- [ ] Task blocks:: [[km-a1b2]]';
    const nodes = parseMarkdownToNodes(original, 'test.md');
    const task = nodes.find(n => n.type === 'task');
    
    // Simulate DB storage (JSON serialize/deserialize data field)
    const storedData = JSON.stringify(task?.data);
    const retrievedData = JSON.parse(storedData);
    
    expect(retrievedData.props.blocks).toEqual(['km-a1b2']);
  });
});
```

### Layer 3: Query Tests (85% coverage target)

**File:** `packages/km-storage/tests/query-properties.test.ts`

```typescript
describe('Property Query Parsing', () => {
  test('parses property existence query (prop::*)', () => {
    const ast = parseQuery('blocks::*');
    expect(ast.propConditions[0]).toMatchObject({
      prop: 'blocks',
      op: 'exists'
    });
  });

  test('parses property value query (prop::value)', () => {
    const ast = parseQuery('blocks::km-a1b2');
    expect(ast.propConditions[0]).toMatchObject({
      prop: 'blocks',
      op: '=',
      value: 'km-a1b2'
    });
  });

  test('parses property comparison query (prop:>N)', () => {
    const ast = parseQuery('rating:>3');
    expect(ast.propConditions[0]).toMatchObject({
      prop: 'rating',
      op: '>',
      value: 3
    });
  });

  test('parses blocked:true query', () => {
    const ast = parseQuery('blocked:true');
    expect(ast.specialConditions).toContain('blocked');
  });
});

describe('Property Query Execution', () => {
  beforeEach(() => {
    // Setup test DB with nodes containing data.props
    const db = new Database(':memory:');
    // ... schema setup ...
    
    // Node with blocks property
    db.run(`INSERT INTO nodes ... VALUES (?, ?, ?)`, [
      'task1', 'task', JSON.stringify({ props: { blocks: ['km-other'] } })
    ]);
    
    // Node with blocked-by property (blocker is not done)
    db.run(`INSERT INTO nodes ... VALUES (?, ?, ?)`, [
      'task2', 'task', JSON.stringify({ props: { 'blocked-by': ['task3'] } })
    ]);
    
    // Blocker task (todo status)
    db.run(`INSERT INTO nodes ... VALUES (?, ?, ?, ?)`, [
      'task3', 'task', 'todo', '{}'
    ]);
    
    // Node with blocked-by property (blocker is done)
    db.run(`INSERT INTO nodes ... VALUES (?, ?, ?)`, [
      'task4', 'task', JSON.stringify({ props: { 'blocked-by': ['task5'] } })
    ]);
    
    // Resolved blocker (done status)
    db.run(`INSERT INTO nodes ... VALUES (?, ?, ?, ?)`, [
      'task5', 'task', 'done', '{}'
    ]);
    
    // Node with rating property
    db.run(`INSERT INTO nodes ... VALUES (?, ?, ?)`, [
      'task6', 'task', JSON.stringify({ props: { rating: 5 } })
    ]);
    
    setDb(db);
  });

  test('blocks::* matches nodes with any blocks property', () => {
    const results = queryTasks('blocks::*');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('task1');
  });

  test('blocks::km-other matches specific value', () => {
    const results = queryTasks('blocks::km-other');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('task1');
  });

  test('blocked:true matches nodes with unresolved blockers', () => {
    const results = queryTasks('blocked:true');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('task2');  // blocked by task3 (todo)
  });

  test('blocked:false excludes nodes with unresolved blockers', () => {
    const results = queryTasks('blocked:false');
    expect(results.every(r => r.id !== 'task2')).toBe(true);
    // task4 should be included (its blocker task5 is done)
    expect(results.some(r => r.id === 'task4')).toBe(true);
  });

  test('rating:>3 matches numeric comparison', () => {
    const results = queryTasks('rating:>3');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('task6');
  });

  test('combined query: status:todo blocked:false', () => {
    const results = queryTasks('status:todo blocked:false');
    // Should return todo tasks that are not blocked
    expect(results.every(r => r.task_status === 'todo')).toBe(true);
    expect(results.every(r => r.id !== 'task2')).toBe(true);
  });
});
```

---

## Implementation Phases

### Phase 1: Parser (P1)

- [ ] Add parseInlineProperties() to parser.ts
- [ ] Integrate into task/content parsing
- [ ] Store in data.props
- [ ] Unit tests (properties.test.ts)

### Phase 2: Serialization (P1)

- [ ] Add property serialization to nodes2md.ts
- [ ] Round-trip tests (properties-roundtrip.test.ts) - CRITICAL

### Phase 3: Queries (P2)

- [ ] Add property query syntax to parseQuery()
- [ ] Implement blocked:true/false
- [ ] Query tests (query-properties.test.ts)

### Phase 4: Backlinks (P2)

- [ ] Property links create backlinks
- [ ] Show relationship type in backlink display

### Phase 5: Docs (P2)

- [ ] Update docs/04-markdown.md
- [ ] Update docs/05-query.md
- [ ] Update docs/01-concepts.md

## Compatibility Notes

**Logseq**: Uses same `property:: value` syntax. km should parse Logseq files correctly.

**Tana**: Uses `Field:: Value` with supertag constraints. km supports syntax but not constraints (see @km/_orphan/supertags).

**Obsidian Dataview**: Uses `[field:: value]` in brackets. Could add as alternative syntax later.

## Acceptance Criteria

### Parser

- [ ] `property:: value` syntax parsed correctly
- [ ] `property:: [[link]]` extracts link target
- [ ] Multiple values via comma separation work
- [ ] Properties stored in `data.props`

### Round-trip (CRITICAL)

- [ ] Single property survives parse → serialize
- [ ] Multiple properties survive parse → serialize
- [ ] Property order preserved
- [ ] Stable after double round-trip (parse → serialize → parse → serialize)
- [ ] Mixed content with properties preserved

### Queries

- [ ] `prop::*` matches existence
- [ ] `prop::value` matches specific value
- [ ] `blocked:true` finds nodes with unresolved blockers
- [ ] `blocked:false` excludes blocked nodes

### Integration

- [ ] `bun run test:fast` passes
- [ ] `bun run test:all` passes
- [ ] Docs updated

