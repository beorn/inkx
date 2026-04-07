# Mixed Cases

The hardest styling bugs happen where multiple layers intersect. Every row here combines at least three of: task state, inline formatting, content markers (tags/projects/mentions/links), body/heading classification, and cursor position.

## Broken wikilink in every state

- [ ] todo with [[Broken1]] — decoration survives cursor inverse
- [x] done with [[Broken2]] — decoration survives done dim
- [-] dropped with [[Broken3]] — decoration survives dropped strikethrough
- [/] in progress with [[Broken4]] — decoration survives
- **bold text with [[Broken5]] inside**
- _italic text with [[Broken6]] inside_
- ~~struck with [[Broken7]] inside~~
- `code with [[Broken8]] not rendered as link` (code spans protect content)

## Multiple markers in one row

- [ ] **urgent** @bjorn #p0 +launch [due::tomorrow] ship the [[missing-doc]] refactor
- [x] done: @shi reviewed [[02-links]] with `prettify_url` — #done +launch
- [-] dropped: old plan for [[OldDesign]] @bjorn #archive
- Meeting with @bjorn and @shi about [[02-links]] and [[BrokenLink]] #meeting +launch [due::2026-04-20] **urgent**

## Cursor inverse torture

Move the cursor onto each of these rows and verify that decoration markers (dashed underline for broken, dotted for resolved) remain visible.

- Row with resolved [[01-inline-formatting]] AND broken [[MissingOne]] side by side
- `code` + [[02-links]] + [[BrokenTwo]] + **bold**
- #tag +project @bjorn [[Resolved|alias]] [[Broken]] end

## Edge: whitespace-only runs between markers

- **a**/_b_/`c`/[[d]]/#e/+f/@g
- _a_**b**`c`
- #one#two#three

## Very long lines (truncation behavior)

- [ ] this is a very long task title that will certainly be truncated by card width limits and should still render inline markers correctly up to the point of truncation [[BrokenLink]] and then more text to push past the edge
- [x] another long one with @bjorn #p1 and `very_long_code_span_that_might_push_past_the_visible_area` plus **bold** at the end

## URLs that should prettify

- bare: https://www.example.com/path?utm_source=twitter#section
- md link: [see docs](https://docs.example.com/very/long/path/to/page) — should hide URL
- hybrid: bare https://a.com and md [b](https://b.com) in one line
