# Leading tabs in list items

Some editors (old vim, Obsidian with tab-indent) serialize nested lists with
hard tabs instead of spaces. The parser must accept them and produce the same
tree as the 2-space or 4-space variants.

-	Top-level task
	-	Child task indented with one tab
		-	Grandchild with two tabs
-	Sibling of top-level

## Paragraph with leading tabs

	This paragraph line starts with a tab — technically an indented code block
	under CommonMark. The serializer must decide on a stable representation.
