---
id: "@km/silvery/ink70-feature-eval"
aliases:
  - km-silvery.ink70-feature-eval
  - km-silvery-ink70-feature-eval
created_by: Bjørn Stabell
created_at: 2026-04-09T19:11:18Z
closed_at: 2026-04-09T23:34:33Z
---

# [x] Evaluate Ink 7.0 features — adopt good designs, shim the rest @km/silvery #task #P2

Evaluate each new Ink 7.0 feature: is it a better design than what silvery has? If yes, adopt into silvery proper. If no, add a compat shim.

## Evaluated (2026-04-09)

| Feature | Tests | Verdict | Reason |
|---|---|---|---|
| BackgroundContext inheritance | 27 | SHIM | Silvery's findInheritedBg is better (works with cell-level, scroll, sticky). Map Ink context to silvery's existing system. |
| borderBackgroundColor per-side | 5 | ADOPT | Genuinely useful. Add borderTopBg/borderBottomBg/etc to Box props. |
| maxFps throttling | 3 | SHIM | Silvery already has maxFps. Wire Ink's render option to silvery's. |
| dim+bold SGR order | 2 | IGNORE | Cosmetic. Both produce same visual in all terminals. |
| CJK overlay clearing | 2 | INVESTIGATE | Check if silvery's behavior is wrong or just different. |
| Concurrent rendering | 3 | DEFER | No value for terminal apps. |

## Principle
While silvery is young: adopt what's genuinely better from Ink, keep what silvery does better with a compat shim. Don't shim everything — bad Ink designs should stay in the compat layer, not pollute silvery's API.