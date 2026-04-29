---
id: "@km/silvery/theme-v3-misc"
aliases:
  - km-silvery.theme-v3-misc
  - km-silvery-theme-v3-misc
created_by: Bjørn Stabell
created_at: 2026-04-19T04:09:21Z
closed_at: 2026-04-19T04:27:08Z
close_reason: N6 (theme inspect CLI) shipped with B2 at silvery 4bdefe44 + km
  238bdac1e. N5 (typed variants runtime) + B3 (single generator) agent was
  killed mid-task; re-dispatch if still desired. The derived.ts brighten/darken
  fix (silvery 6a67674c) already collapses the shift closure into one path —
  that is effectively B3's goal.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-v3-misc
    depends_on_id: km-silvery.theme-v3-plumbing
    type: parent-child
    created_at: 2026-04-18T21:09:21Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Typed variants runtime + single generator + theme inspect CLI @km/silvery #task #P3

blocks:: [[@km/silvery/theme-v3-plumbing]]

N5: variants is Record<string, Variant> — add runtime validation that unknown variants warn. B3: deriveFields has ansi16 and truecolor paths 70% duplicated — collapse to one function with tier selector. N6: silvery theme inspect command that prints 'your $primary resolved to X via fingerprint Y confidence Z'.