# Trailing whitespace preservation

Two trailing spaces create a hard line break in CommonMark. The serializer
must preserve them where present and not spuriously insert them elsewhere.

Line with two trailing spaces before the break,  
next line in the same paragraph.

A regular paragraph without trailing spaces so we can diff the two behaviours.

## Blank lines between blocks

Paragraph one.


Paragraph two, separated by two blank lines.

- List item
- Another item

Final paragraph.
