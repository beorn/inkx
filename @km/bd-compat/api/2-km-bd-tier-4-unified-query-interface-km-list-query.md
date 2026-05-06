---
mentions:
  - km
---

# [x] km bd tier 4: unified query interface — km list/query = km bd list/query with different defaults @km/tools #task #P2

km bd list/query and km list/query share the same interface (DSL, flags, output options). The only difference: km bd defaults to filtering @issue-tagged nodes and uses bd-style output format. Implementation: extract shared query flags and formatting into a common layer, then wire both km list and km bd list to it with different default presets.

