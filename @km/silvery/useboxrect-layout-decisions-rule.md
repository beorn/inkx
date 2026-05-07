---
_stub: true
closed_at: 2026-05-06T21:47:41.895Z
closeReason: "Landed in three places per the bead's plan: (1)
  vendor/silvery/CLAUDE.md anti-patterns section — non-idempotent layout
  decisions in useBoxRect, with the cmux SIGWINCH-burst example; (2)
  vendor/silvery/docs/guide/the-silvery-way.md — warning callout under 'Think in
  Flexbox' on idempotent decisions + bucket-or-observe; (3)
  vendor/silvery/docs/api/use-box-rect.md — new 'Layout decisions vs.
  observation' section with three patterns (observation via callback form,
  bucketed via useResponsiveValue + hysteresis, the trap). Plus a brief note in
  the useBoxRect docstring at packages/ag-react/src/hooks/useLayout.ts. Framing
  tweak vs the original bead: dropped 'singlePassLayout' from the public-doc
  recommendations because it is not on the RunOptions/AppRunOptions public
  surface (renderer-internal flag) and production silvery already opts into
  single-pass via create-app.tsx — the actual rule is idempotent decisions,
  achieved via callback form (observation) or bucketed-zone with hysteresis
  (decisions). Both routes are fully part of the public API. The implementation
  in apps/silvercode (Content.tsx single-tree fix + useResponsiveDisclosure
  250ms hysteresis) follows pattern 2."
---

