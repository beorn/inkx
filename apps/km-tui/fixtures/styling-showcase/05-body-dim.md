# Body Dim Cascade

When a card has a heading sibling AND body siblings, km's extractBody logic classifies the non-heading items as "body" and dims them. The stable body classification fix (2026-04-06) ensures this is cursor-independent.

## Card with heading + body + tasks

## Meeting notes — sprint planning

This is the first body paragraph directly under the heading. It should render dim (the body cascade).

This is the second body paragraph. Also dim.

- [ ] actionable item one (NOT dim — it's a task, structural)
- [ ] actionable item two
- body list item (should be dim because it's not a task and coexists with task siblings? — depends on parser classification)

## Card with body-only (no heading sibling)

- body item one — should NOT be dim because no structural siblings
- body item two
- body item three

## Card with only tasks (no body)

- [ ] task one
- [ ] task two
- [ ] task three

## Card with heading + tasks + body + broken wikilink

## Design notes

The original design proposed [[MissingDesignDoc]] but we abandoned it.

Another body paragraph with `inline code` and **bold** that should all be dim.

- [ ] implement the new design
- [ ] write tests for the new design
  - body under a task: `detail about the task` — does this dim?

## Edge case: body with link AND tag AND cursor

Move the cursor onto the following body paragraph:

The decision to refactor [[02-links]] was made with @bjorn under [due::2026-04-20] priority #p1. Every one of these markers must remain visually correct under the dim body treatment AND the cursor inverse treatment.
