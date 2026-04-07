# Links

This is the most important page for the styling-precedence audit. Broken wikilinks are the canonical case where content-level styling must survive the cursor inverse treatment.

## Resolved wikilinks

These point at pages that DO exist in this vault (see other files in this directory).

- See [[01-inline-formatting]] for bold/italic examples
- See [[03-sigils]] for tag and mention behavior
- See [[04-tasks]] for task state rendering
- Nested: see [[02-links|this very page]] with an alias
- At start: [[05-body-dim]] demonstrates dim cascade
- At end, then more text: refer to [[06-mixed]] after the text

## Broken wikilinks (the canonical cursor-safety case)

These point at pages that DO NOT exist in this vault. The dashed red underline MUST remain visible whether or not the cursor is on this row.

- link to [[NonExistentNote]] — should show dashed red underline
- broken at start: [[MissingPage]] at line start
- trailing broken: ends with [[GonePage]]
- two in one line: [[First]] and [[Second]] both broken
- in body prose: the reference to [[DeletedRef]] is now stale
- with alias: [[RealTarget|friendly name]] — check if alias-only resolves
- unicode: [[Año-2025]] and [[Notes/日本語]] — broken
- with hash: [[NoPage#section]] and [[NoPage#^blockId]]
- nested brackets: do not match [[Outer [[Inner]] Outer]] — tricky parse

## Bare URLs

The URL should be prettified (protocol stripped, www removed, tracking params cleaned) in card titles.

- visit https://www.example.com/docs today
- see https://github.com/beorn/km for source
- try http://example.org/path?utm_source=twitter&utm_medium=social
- long: https://very-long-url.example.com/api/v2/reference/endpoint?key=value
- ftp://legacy.example.com should be detected
- multiple: see https://a.example.com and https://b.example.com on one line

## Markdown links

The link text should be visible; the URL should be hidden from the title.

- Click [Google](https://google.com) for search
- Read [the documentation](https://example.com/docs) for details
- Two links: [One](https://one.example.com) and [Two](https://two.example.com)
- Link at end of line: finally [Source](https://source.example.com)
- Long text link: [A very descriptive link text that spans many words](https://example.com/)
