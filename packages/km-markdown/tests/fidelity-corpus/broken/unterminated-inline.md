# Unterminated inline constructs

This paragraph has an unterminated `inline code span that runs to end of paragraph.

This one has unterminated **bold formatting.

This one has unterminated *italic.

And this one has an unterminated [link text with no close bracket.

Wikilink that's not closed: [[Target Note — missing close brackets

The parser should degrade gracefully — emit the text verbatim, don't
crash, and round-trip to a stable second form.

## Another section

Back to regular text.
