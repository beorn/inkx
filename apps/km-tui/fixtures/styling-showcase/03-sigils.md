# Sigils

Tags, projects, mentions, fields, blockrefs — all content-level markers that must remain visible under all cell states.

## Tags (#)

- plan the sprint #marketing today
- due soon #p0 #p1 #p2 — three tags in a row
- tag at start: #important then text
- tag at end: do this #urgent
- unicode tag: #日本語 and #año-2025
- multi-word tag: #cross-site should parse as one
- nested path: #area/subarea/leaf

## Projects (+)

- ship the feature +launch soon
- multiple: +alpha +beta +gamma
- at start: +launch top priority
- at end: fix the bug +bugfix
- with tag: +launch #p0 combination

## Mentions (@)

The stripKnownMentions rule strips KNOWN person shortnames; unknown sigils like @next, @urgent remain.

- review with @bjorn today (known: stripped in card title, visible in detail)
- ping @Bjørn Stabell about it (known + surname stripped together)
- follow up @next (unknown sigil, preserved)
- check with @urgent marker (unknown sigil)
- combined: @bjorn and @next in one line
- at end: ask @bjorn
- two known: @bjorn and @shi reviewed

## Inline fields

Markdown fields with key::value syntax — metadata, stripped from titles.

- deadline [due::2026-04-15] for the milestone
- priority [priority::high] marker
- status [status::in-progress] note
- multiple: [project::km] [area::tui] [owner::bjorn]

## Block refs

- reference this block ^abc123 later
- multiple: see ^one and ^two
- at end of sentence ^xyz789

## Combinations (the tricky cases)

These are cases where a single row has several sigils + formatting — the most common source of styling-precedence bugs.

- **Urgent** @bjorn #p1 +launch ship by friday
- _quick note_ about [[02-links]] and @next
- `foo.bar()` failing with @bjorn — #bug +api [priority::high]
- ~~old plan~~ — use [[01-inline-formatting]] now #docs
- Meeting notes: **kickoff** with @bjorn @shi about +launch #meeting [due::2026-04-20]
