# Agent Dispatch

Agent dispatch maps bead work to claimable hats such as `@agent/3`.
It is built from normal km primitives: sigil links, `km bd` queries, `km.add`
materialization, and bead claims.

## Vocabulary

| Term       | Meaning                                                           |
| ---------- | ----------------------------------------------------------------- |
| Hat        | A claimable work identity such as `@agent/3`.                     |
| Worktree   | The paired worktree; claiming `@agent/3` claims `wt3`.            |
| Assignment | A bead item title contains `@agent/3` or `[[@agent/3]]`.           |
| Queue      | Items matching the hat assignment query, usually `km bd query`.   |
| Hat board  | The optional markdown file `@agent/3.md` that can show the queue. |
| Claim      | A bead/hat claim via `km bd update <id> --claim`.                 |

Use "hat" for the claimable thing an agent picks up and wears. Numeric hats
`@agent/0..9` are intentionally generic. If we want a personified/specialized
agent later, create a named hat such as `@agent/silvercode-expert` plus its own
associated worktree. "Board" is a visual/file surface, not a storage-tree
concept.

## Assignment

Assignment is a link, not a write into the hat file:

```markdown
# [ ] Fix transcript replay @km/silvercode #P1 @agent/3
```

The parser stores a canonical link row:

```text
host_id = <bead item id>
href    = km:@agent/3
rel     = link
```

Bare and wiki forms are equivalent for assignment:

```markdown
@agent/3
[[@agent/3]]
```

Both normalize to `href = 'km:@agent/3'`. The query/materialization layer does
not currently distinguish bare sigil form from wiki sigil form.

## Queue

The read-only queue is a query:

```bash
km bd query @agent/3
```

Queries and backlinks are automatic. They do not modify `@agent/3.md`.

## Hat Board

A hat board becomes a persisted queue only when the file declares
materialization with `km.add`. Put the rule on the slot identity H1 and use
`km.default` on the same H1 to keep initial embeds top-level:

```markdown
# @agent/3 km.add:: . km.default:: true
```

`.` expands to the rule owner's path-form, so the example matches `@agent/3`
without duplicating the path in the rule. `km.default` on the owner means
"place generated embeds directly under this node." If the owner is not marked
default, `km.default` wins anywhere below the owner. If there is no default
target, generated embeds land in the first non-collapsed, non-removed child
section; if there is no child section, they land under the H1.

`km.add` materializes matching item nodes by default (`KNode.isItem()`), not body
blocks. A paragraph that mentions `@agent/3` remains a normal backlink source,
but it does not become a queue card.

After a card has been materialized, moving it from Queue to Doing, Archive, or
Done is a normal outline move. The add rule supplies initial placement for new
matches; workflow rules may move cards later.

There are no implicit `km.add` rules. A file named `@agent/3.md` with no
`km.add` rule is just a node that can receive backlinks.

## Claim And Do

`$claim @agent/3` claims the hat and the matching `wt3` worktree, then
broadcasts the claim. `$do` then picks the highest-priority ready bead from the
claimed hat queue.

Implementation should prefer the query (`km bd query @agent/3`) as the source of
truth. A materialized hat board is a readable/debuggable projection of that
query, not the assignment authority. The hat file is not a persona prompt and
should not carry frontmatter, descriptions, `scope_fit`, or working agreements.

## References

- [Architecture: Links, Backlinks, and Materialization](../architecture.md#links-backlinks-and-materialization)
- [KLink model](../design/model/klink.md)
- [Storage NodeRules](../design/model/storage.md#noderules)
- Tracking bead: `@km/agent/sigil-boards`
