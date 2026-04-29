---
id: "@km/_orphan/resolver-ambiguity"
aliases:
  - km-resolver-ambiguity
created_at: 2026-01-30T16:43:25Z
closed_at: 2026-01-30T16:47:12Z
assignee: claude:cf38b4a6
---

# [x] Improve node resolver: path-first, warn on ambiguity @km/_orphan #task #P2 @claude:cf38b4a6

Redesign resolveNode() to handle paths vs names correctly:

**Current issues:**
- Bare names like 'docs' treated as IDs, can accidentally match wrong nodes via prefix
- No distinction between paths (unique) and names (potentially ambiguous)
- No warning when multiple nodes match a query

**Changes needed:**
1. If query contains '/' → treat as path, resolve uniquely  
2. If bare name → search by filename/name field
3. Count matches at each stage, warn if >1 found
4. Return first match but log ambiguity warning

**Resolution order (revised):**
1. Explicit paths (/, ./, ../) → fs_path match
2. Path-like queries (contains /) → relative path resolution
3. Bare names → filename match (may be ambiguous)
4. Exact ID match
5. Content/title match

**Contexts to consider:**
- CLI args: user typing paths
- Wikilinks: name-based resolution
- May need context param or separate functions