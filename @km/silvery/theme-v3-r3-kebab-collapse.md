---
id: "@km/silvery/theme-v3-r3-kebab-collapse"
aliases:
  - km-silvery.theme-v3-r3-kebab-collapse
  - km-silvery-theme-v3-r3-kebab-collapse
created_by: Bjørn Stabell
created_at: 2026-04-19T04:09:19Z
closed_at: 2026-04-19T04:29:28Z
close_reason: Shipped in silvery 47718e69-7374d356 (already bumped in km
  c36b99de8). State-variants + brand tokens now kebab keys directly in Theme (no
  camelCase fields). PRIMER_ALIASES shrunk from 40+ → 22 rows (LEGACY_ALIASES
  scaffolding for fg-* / bg-* Primer-style kebab names vs old concat fields).
  New tokens default kebab; adding one no longer requires editing 3 places.
  Agent reported 145-callsite global rename not needed — the definitional-drift
  risk was eliminated by the state-variant kebab move. Full legacy camelCase →
  kebab field rename deferred as separate future work if desired.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-silvery.theme-v3-r3-kebab-collapse
    depends_on_id: km-silvery.theme-v3-plumbing
    type: parent-child
    created_at: 2026-04-18T21:09:19Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] R3: Collapse token names — Theme keys are kebab-strings, not camelCase @km/silvery #task #P3

blocks:: [[@km/silvery/theme-v3-plumbing]]

Eliminate PRIMER_ALIASES (40+ rows) by making Theme a Record<kebab-string, string>. 'primaryHover' Theme field becomes 'primary-hover' key. Also nests state variants: theme['primary'].base/hover/active instead of flat. ~145 theme.X accesses migrate to theme['x'] or nested. B1 (nest state variants) is part of this bead.