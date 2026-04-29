---
id: "@km/silvery/runoptions-xor-type"
aliases:
  - km-silvery.runoptions-xor-type
  - km-silvery-runoptions-xor-type
created_by: claude:c6244087
created_at: 2026-04-23T10:24:06Z
closed_at: 2026-04-23T10:48:22Z
close_reason: done in silvery fcddf897 + km 4a2ccbfb4. RunOptions =
  RunOptionsCommon & (profile XOR {caps,colorLevel}) via TS ?:never idiom.
  Runtime warn-once for JS violators. Mixed-options test pins behavior.
---

# [x] Type-level XOR: RunOptions accepts profile OR caps/colorLevel, not both @km/silvery #task #P2 @claude:c6244087

blocks:: [[@km/silvery]]

Per /pro review (transition). During the caps/colorLevel deprecation window, the TS type should make profile + caps mutually exclusive. GPT recommends this as the compatibility gate. Bead @km/silvery/runoptions-caps-colorlevel-removal is the final state.