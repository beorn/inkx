# HTML comments at block and inline positions

Obsidian uses `%% ... %%` for its own comments but also renders HTML
comments as invisible. The parser must preserve them where present.

<!-- Top-level block comment, acts as a marker for import tools -->

## Section one

This paragraph has an <!-- inline comment --> embedded in it.

<!--
A block comment spanning
multiple lines. Sometimes used
to stash TODO context.
-->

- List item before comment
- <!-- comment inside a list item --> List item with leading comment
- List item after comment

<!-- HTML comment that looks almost like a block-level tag: <p>not a tag</p> -->

End of file.
