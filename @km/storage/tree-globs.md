---
mentions:
  - km
  - claude
id: "@km/storage/tree-globs"
aliases:
  - km-storage.tree-globs
  - km-storage-tree-globs
created_by: claude:f8196c1c
created_at: 2026-03-29T02:10:53Z
closed_at: 2026-03-29T03:55:27Z
close_reason: "Both phases complete. Phase 1: parseTreeGlob parser + fstype
  qualifiers (., /) + query executor wiring. Phase 2: task qualifiers (t, p, w,
  d, s, x) + nodetype (i, l) + SQL translation + $ hack removed. @next.md: 6
  rules → 3. Full docs at docs/ref/tree-globs.md. 35 parser tests, 4857 total
  pass."
owner: bjorn@stabell.org
assignee: claude:f8196c1c
---

# [x] tree globs — zsh-style path globs with node qualifiers for selecting nodes in the km tree @km/storage #feature #P2 @claude:f8196c1c

## tree globs

Zsh-style path globs with node qualifiers for selecting nodes in the km tree. Same syntax everywhere: `km.add::` rules, CLI, search, view filters.

```typescript
parseTreeGlob('./inbox/**(.)') 
// → { path: 'inbox', recursive: true, qualifiers: [{ type: 'fstype', values: ['file', 'mdfile'] }] }
```

Full reference: [docs/ref/tree-globs.md](docs/ref/tree-globs.md)

### Status

**Phase 1 DONE**: `parseTreeGlob()` in `@km/core`, wired into query executor, vault + template + docs updated.

- `./inbox/**(.)` works — files only, recursive
- `./inbox/*(/)` works — folders only, non-recursive
- `(^.)` works — negation
- 22 parser tests + 137 query tests pass

**Phase 2 TODO**: task qualifiers (`t p w d s x`) + node type qualifiers (`i l`) + chord remapping

### Qualifier reference

Three dimensions — OR within, AND across:

| Dimension | Chars       | Meaning                                           |
| --------- | ----------- | ------------------------------------------------- |
| fstype    | . /         | files, folders                                    |
| nodetype  | i l         | outline (heading), list item                      |
| task      | t p w d s x | task, past-due, this-week, has-due, started, done |

Reserved (future): `n` note, `c` contact, `e` event, `m` message

Sigils via path patterns: `./**/@*` `./**/#*` `./**/+*`

### Unified chord correspondence

| Qualifier | Board chord            | View |
| --------- | ---------------------- | ---- |
| p         | t p set/view past due  | —    |
| w         | t w set/view this week | —    |
| d         | t d pick due date      | —    |
| s         | t s set start          | —    |
| x         | v x toggle done view   | —    |
| —         | t . cycle status       | —    |
| —         | t @ set assignee       | —    |

### Target @next.md (after Phase 2)

```markdown
## Inbox km.add:: ./inbox/**(.) km.add:: ./**(pw) km.add:: ./**(s)
```

Three rules. No `-status:done` boilerplate.

