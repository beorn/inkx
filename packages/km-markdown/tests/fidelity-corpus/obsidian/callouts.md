# Obsidian callouts

Obsidian uses the `> [!type]` syntax for typed blockquotes. The parser
should preserve the callout type and title.

> [!note]
> A plain note. First line of body.
> Second line of body.

> [!note] With a title
> Body line one.
> Body line two.

> [!warning] Breaking change
> This API will be removed in v2. Migrate to the new one.

> [!tip]
> Small tip in a callout.

> [!info]- Collapsed by default
> The `-` after the type makes the callout start collapsed.
> Pressing the arrow expands it.

> [!abstract]+ Expanded by default
> The `+` after the type makes the callout start expanded.

> [!example]
> Nested list inside a callout:
>
> - First
> - Second
> - Third

> [!quote] Someone famous
>
> > A nested quote inside a callout.
> > Further nesting.

> [!bug] Bug callout
> Known issues go in here.

> [!todo] To do
>
> - [ ] Task one
> - [ ] Task two
