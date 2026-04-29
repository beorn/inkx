---
id: "@km/silvery/use-active-scheme-hook"
aliases:
  - km-silvery.use-active-scheme-hook
  - km-silvery-use-active-scheme-hook
created_by: Bjørn Stabell
created_at: 2026-04-19T05:56:58Z
closed_at: 2026-04-19T06:06:13Z
close_reason: "Shipped at silvery 6d73d0ef + km adbf3dc9d. ActiveScheme type
  (name, source, confidence, matchedName), useActiveScheme hook,
  ActiveSchemeContext. Bonus: shared wrapWithThemedProvider extracted (overlaps
  bead km-silvery.unify-theme-boot-helpers scope — that bead may now be
  partially redundant). 13 new tests pass."
---

# [x] useActiveScheme() React hook — expose detected scheme metadata @km/silvery #task #P3

blocks:: [[@km/silvery]]

Today apps can only introspect detected theme via silvery theme inspect CLI. Add useActiveScheme() hook returning { name, source: 'probe'|'fallback'|'override', confidence? }. Requires Theme to carry name already (it does) + detect path to stash source+confidence somewhere reachable. ThemeProvider should accept optional metadata prop. Acceptance: hook returns metadata when used inside ThemeProvider from runThemed() (which has detect info); returns name-only when used under bare ThemeProvider theme={}.