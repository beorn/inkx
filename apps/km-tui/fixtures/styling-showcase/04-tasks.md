# Task States

Checkbox tasks in every status. Navigate the cursor over each to verify the status glyph + strikethrough + dim behavior is consistent.

## Todo (unchecked)

- [ ] simple todo item
- [ ] todo with **bold** inside
- [ ] todo with [[02-links|wikilink]] inside
- [ ] todo with #tag and +project markers
- [ ] todo with [[BrokenLink]] — dashed underline must stay visible under cursor
- [ ] todo with `foo.bar()` code span
- [ ] todo with @bjorn known mention
- [ ] todo assigned to @shi with #p0 and [due::2026-04-10]

## Done (checked)

Done tasks should dim and strip inline colors (except decoration markers like broken-link underline).

- [x] simple done item — should be dim
- [x] done with **bold** — bold survives, but dim
- [x] done with [[02-links]] — link style attenuated but resolvable
- [x] done with #tag +project — markers dimmed
- [x] done with [[BrokenLink]] — dashed underline MUST still show (decoration survives dim)
- [x] done with `code` — code style attenuated
- [x] done assigned to @bjorn #p1 last week

## Dropped / cancelled

- [-] dropped task — different marker from done
- [-] dropped with **bold** — should look distinct from done
- [-] dropped with broken [[Missing]] link

## In progress

- [/] in-progress task — distinct glyph
- [/] in-progress with sub-items below (see children)
  - [ ] sub-todo of in-progress
  - [x] sub-done of in-progress

## Blocked

- [?] blocked task — distinct glyph
- [!] urgent/attention task — distinct glyph

## Mixed depth

Nested tasks across states — the dim cascade should respect the parent's state.

- [ ] parent todo
  - [ ] child todo
  - [x] child done
    - [ ] grandchild todo
- [x] parent done
  - [ ] child todo (should stay undone even though parent is done)
  - [x] child done
