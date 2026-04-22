---
title: Array styles
tags_block:
  - inbox
  - review
  - todo
tags_flow: [inbox, review, todo]
mixed_types:
  - "quoted string"
  - 42
  - true
  - null
  - 3.14
contributors:
  - name: Bjørn
    github: beorn
  - name: Mike
    github: mikewelch
---

# Array styles

Frontmatter arrays come in two syntactic flavours (block and flow). YAML
parses them to the same thing, but round-trip serialization needs to decide
which form to emit. Losing the flow-style is an acceptable drift but must
be documented.
