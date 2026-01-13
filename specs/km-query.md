# Node Query Language

Unified query syntax for selecting nodes in km.

---

## Overview

Node queries are space-separated terms that filter nodes. Used by:
- `km task` — filter task list
- `km @board add` — add matching nodes to board
- Automation rules — `match:` conditions

All terms are AND-ed together (intersection).

---

## Term Types

| Pattern | Name | Description |
|---------|------|-------------|
| `@ref` | Reference | Node has this reference (contains) |
| `#tag` | Reference | Node has this tag (contains) |
| `+proj` | Reference | Node has this project ref (contains) |
| `./path` | Path | Node is under this relative path |
| `/path` | Path | Node is under this absolute path |
| `path/` | Path | Node path contains this string |
| `key:value` | Field | Field matches value |
| `-TERM` | Negation | Exclude nodes matching TERM |
| `"text"` | Search | Full-text search |

---

## Modifiers

| Suffix | Effect |
|--------|--------|
| `$` | Exact match (default is contains) |
| `**` | Recursive (for paths) |
| `*` | Wildcard (for values) |

---

## Reference Terms

Match nodes by their references:

```bash
@bjorn              # Has reference containing "bjorn"
@bjorn$             # Has exactly @bjorn reference
+website            # Has +website project ref
#urgent             # Has #urgent tag
-@bjorn             # Does NOT have @bjorn reference
@*                  # Has any @ reference
```

---

## Path Terms

Match nodes by location:

```bash
./inbox             # Under ./inbox (relative to cwd)
./inbox/**          # Under ./inbox, recursive
/projects/web       # Under /projects/web (absolute)
projects/           # Path contains "projects/"
projects/**         # Contains "projects/", recursive
./tasks/budget$     # Exactly this path
```

---

## Field Terms

Match field values with `key:value`:

| Field | Values | Example |
|-------|--------|---------|
| `status` | open, blocked, done, dropped | `status:open` |
| `due` | today, past, week, none, YYYY-MM-DD | `due:past` |
| `start` | past, today, YYYY-MM-DD | `start:past` |
| `owner` | name | `owner:bjorn$` |
| `p` | 1-5 | `p:1` |

### Date Values

| Value | Meaning |
|-------|---------|
| `today` | Due/start date is today |
| `past` | Date is before today |
| `week` | Within next 7 days |
| `none` | Field is not set |
| `YYYY-MM-DD` | Specific date |
| `older_than_Nd` | More than N days ago |

---

## Negation

Prefix any term with `-` to exclude:

```bash
-@bjorn             # Not assigned to bjorn
-status:done        # Not done
-./archive/         # Not in archive
```

---

## Combining Terms

Terms are AND-ed (all must match):

```bash
status:open due:week              # Open AND due this week
+website status:open              # Has +website AND is open
./inbox/** -status:done           # In inbox AND not done
@bjorn$ status:open p:1           # Exactly bjorn, open, priority 1
```

---

## Examples

```bash
# Find unorganized tasks
status:open -@next -@someday

# Find project tasks not scheduled
+website status:open due:none

# Find blocked items
status:blocked

# Find tasks in inbox folder
./inbox/**

# Find tasks mentioning budget
"budget"

# All person references except system boards
@* -@inbox -@next -@someday
```

---

## Automation Usage

In automation rules, queries appear in `match:`, `was:`, and `now:` fields:

```yaml
- name: surface-overdue
  trigger: due.passed
  match: "status:open"
  actions:
    - board.add: "@next"

- name: inbox-processed
  trigger: field.changed
  field: path
  was: "./inbox/**"
  now: "-./inbox/**"
  actions:
    - board.remove: "@inbox"
```

See [km-tasks-auto.md](km-tasks-auto.md) for full automation syntax.

---

## Implementation

### Architecture

```
Query String → Parser → AST → SQL Generator → SQLite
     ↓
"status:open @bjorn"
     ↓
[FieldTerm{status, open}, RefTerm{@, bjorn}]
     ↓
SELECT * FROM nodes
WHERE status = 'open'
  AND id IN (SELECT node_id FROM refs WHERE ref LIKE '%bjorn%')
```

### Prior Art

#### Query Parsing

| Library | Notes |
|---------|-------|
| [search-query-parser](https://github.com/nepsilon/search-query-parser) | Parses `key:value`, exclusions (`-key:val`), ranges. Has TypeScript types. Good fit for km's syntax. |
| [@projekt-apollo/query-parser](https://www.npmjs.com/package/@projekt-apollo/query-parser) | Lightweight, Gmail/GitHub-inspired. Produces AST. |
| [search-parser](https://www.npmjs.com/package/search-parser) | Supports AND/OR/NOT, parentheses. More complex than needed. |

**Recommendation:** `search-query-parser` handles km's syntax well (key:value, negation with `-`, comma-separated values). May need light extension for path terms (`./`, `/**`).

#### SQL Generation

| Library | Notes |
|---------|-------|
| [Kysely](https://kysely.dev/) | Type-safe query builder. 13k+ stars. First-class SQLite support. Excellent for programmatic query building. |
| [ts-sql-query](https://ts-sql-query.readthedocs.io/) | Type-safe, supports SQLite. Can run sync with better-sqlite3. |
| [Drizzle ORM](https://orm.drizzle.team/) | Lightweight ORM with query builder. Good SQLite support. |

**Recommendation:** Kysely for its type safety and SQLite support. Queries compile to SQL at build time, catching errors early.

### Suggested Implementation

```typescript
import { parse } from 'search-query-parser';
import { Kysely, sql } from 'kysely';

interface QueryTerm {
  type: 'field' | 'ref' | 'path' | 'text';
  key?: string;
  value: string;
  negated: boolean;
  exact: boolean;
}

function parseQuery(input: string): QueryTerm[] {
  const options = {
    keywords: ['status', 'due', 'start', 'owner', 'p'],
    tokenize: true,
  };
  const parsed = parse(input, options);
  return normalizeTerms(parsed);
}

function toSQL(terms: QueryTerm[], db: Kysely<Database>) {
  let query = db.selectFrom('nodes');

  for (const term of terms) {
    query = applyTerm(query, term);
  }

  return query;
}

function applyTerm(query, term: QueryTerm) {
  switch (term.type) {
    case 'field':
      return applyFieldTerm(query, term);
    case 'ref':
      return applyRefTerm(query, term);
    case 'path':
      return applyPathTerm(query, term);
    case 'text':
      return applyFullTextTerm(query, term);
  }
}
```

### SQLite Schema Considerations

```sql
-- Main nodes table
CREATE TABLE nodes (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT,
  due TEXT,
  start TEXT,
  owner TEXT,
  priority INTEGER,
  content TEXT
);

-- References (many-to-many)
CREATE TABLE refs (
  node_id TEXT NOT NULL,
  ref TEXT NOT NULL,           -- @bjorn, #finance, +website
  ref_type TEXT NOT NULL,      -- @, #, +
  FOREIGN KEY (node_id) REFERENCES nodes(id)
);

-- Full-text search
CREATE VIRTUAL TABLE nodes_fts USING fts5(
  content,
  content='nodes',
  content_rowid='rowid'
);

-- Indexes for common queries
CREATE INDEX idx_nodes_status ON nodes(status);
CREATE INDEX idx_nodes_due ON nodes(due);
CREATE INDEX idx_refs_ref ON refs(ref);
CREATE INDEX idx_refs_type ON refs(ref_type);
```

### Query Translation Examples

| Query | SQL |
|-------|-----|
| `status:open` | `WHERE status = 'open'` |
| `@bjorn` | `WHERE id IN (SELECT node_id FROM refs WHERE ref LIKE '%bjorn%')` |
| `@bjorn$` | `WHERE id IN (SELECT node_id FROM refs WHERE ref = '@bjorn')` |
| `-status:done` | `WHERE status != 'done' OR status IS NULL` |
| `./inbox/**` | `WHERE path LIKE './inbox/%'` |
| `"budget"` | `WHERE id IN (SELECT rowid FROM nodes_fts WHERE content MATCH 'budget')` |
| `due:past` | `WHERE due < date('now')` |
| `due:week` | `WHERE due BETWEEN date('now') AND date('now', '+7 days')` |

---

## See Also

- [km-tasks-data.md](km-tasks-data.md) — Data model
- [km-tasks-auto.md](km-tasks-auto.md) — Automation rules
- [km-tasks-cli.md](km-tasks-cli.md) — CLI commands
