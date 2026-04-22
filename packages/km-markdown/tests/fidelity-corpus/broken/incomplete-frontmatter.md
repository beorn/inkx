---
title: Incomplete frontmatter
tags:
  - broken
  - fixture
missing: close-marker
# No closing --- below — parser must degrade gracefully

# Body heading

The body starts here, but because the frontmatter block is never closed,
the parser has to decide: treat everything as frontmatter until EOF (lossy),
or treat the first `---` as just a horizontal rule and no frontmatter.

Either choice is acceptable as long as the parser doesn't crash and the
second round-trip is stable.
