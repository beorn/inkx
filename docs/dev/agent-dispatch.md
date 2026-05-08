# Agent Dispatch

Agent dispatch maps bead work to durable persona slots such as `@agent/3`.
It is built from normal km primitives: sigil links, `km bd` queries, `km.add`
materialization, and bead claims.

## Vocabulary

| Term       | Meaning                                                            |
| ---------- | ------------------------------------------------------------------ |
| Slot       | A path-form node such as `@agent/3` that represents one persona.   |
| Assignment | A bead item title contains `@agent/3` or `[[@agent/3]]`.            |
| Queue      | Items matching the slot assignment query, usually `km bd query`.   |
| Slot board | The optional markdown file `@agent/3.md` that can show the queue.  |
| Claim      | A bead/slot claim via `km bd update <id> --claim`.                 |

Use "slot" for the domain object. "Board" is a visual/file surface, not a
storage-tree concept.

## Assignment

Assignment is a link, not a write into the slot file:

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

## Slot Board

A slot board becomes a persisted queue only when the file declares
materialization with `km.add`. Put the rule on the slot identity H1 and use
`km.default` for the initial landing section:

```markdown
# @agent/3 km.add:: .

## Queue km.default:: true
```

`.` expands to the rule owner's path-form, so the example matches `@agent/3`
without duplicating the path in the rule. `km.default` wins anywhere below the
owner. If there is no default section, generated embeds land in the first
non-collapsed, non-removed child section; if there is no child section, they
land under the H1.

`km.add` materializes matching item nodes by default (`KNode.isItem()`), not body
blocks. A paragraph that mentions `@agent/3` remains a normal backlink source,
but it does not become a queue card.

After a card has been materialized, moving it from Queue to Doing, Archive, or
Done is a normal outline move. The add rule supplies initial placement for new
matches; workflow rules may move cards later.

There are no implicit `km.add` rules. A file named `@agent/3.md` with no
`km.add` rule is just a node that can receive backlinks.

## Claim And Do

`$claim @agent/3` claims the slot bead/persona, reads the slot body into session
context, and broadcasts the claim. `$do` then picks the highest-priority ready
bead from the claimed slot queue.

Implementation should prefer the query (`km bd query @agent/3`) as the source of
truth. A materialized slot board is a readable/debuggable projection of that
query, not the assignment authority.

## References

- [Architecture: Links, Backlinks, and Materialization](../architecture.md#links-backlinks-and-materialization)
- [KLink model](../design/model/klink.md)
- [Storage NodeRules](../design/model/storage.md#noderules)
- Tracking bead: `@km/agent/sigil-boards`
