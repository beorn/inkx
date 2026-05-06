---
mentions:
  - km
id: "@km/infra/interaction-test-project"
aliases:
  - "@km/all/interaction-test-project"
  - km-all.interaction-test-project
  - km-all-interaction-test-project
created_by: claude:da9990c5
created_at: 2026-04-28T19:42:49Z
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-all.interaction-test-project
    depends_on_id: km-all
    type: parent-child
    created_at: 2026-04-28T12:42:49Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-all
---

# [ ] Add 'interaction' vitest project for feature⊕feature property tests @km/all #task #P2

blocks:: [[@km/all]]

From /big quality analysis 2026-04-28. Recent prompt-concat-into-reply-regression slipped past tests because each feature (optimistic-dedup, prompt-echo strip) had isolated tests but no test pinned the interaction.

Add a 4th vitest project beyond fast/slow/vendor: 'interaction/'. Each test in this project asserts an invariant that must hold across feature combinations:

- For any user-message with non-empty text, the resulting effects MUST include strip-arm (regardless of whether dedup re-keyed an optimistic entry)
- For any move/rename, all incoming references after the operation point at the new target (regardless of which form: wikilink/alias/dep-edge/inline)
- For any path-form, [bd-form, dash-form, path-form] all resolve to the same node (alias round-trip)
- For any rendering action, dirty-flag invariants hold (silvery STRICT — already exists, lift into the interaction tier)

Run on every PR. Cadence reminder if stale. Hours of work, not days. Massive ongoing leverage.

