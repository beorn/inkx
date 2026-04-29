---
id: "@km/silvery/snug-wrapping-quality"
aliases:
  - km-silvery.snug-wrapping-quality
  - km-silvery-snug-wrapping-quality
created_by: Bjørn Stabell
created_at: 2026-04-10T22:00:46Z
owner: bjorn@stabell.org
---

# [ ] snug-content wrapping quality — boxes 3-5 in demo look suboptimal @km/silvery #bug #P2

Three issues in text-layout demo:
1. Boxes 3-5 in snug-content dont look noticeably tighter than fit-content
2. Even wrapping section looks identical to greedy — demo text too short or boxes too wide
3. Combined section also looks identical

Fix: use longer paragraphs (3+ lines) and narrower boxes (width=30) where the algorithms actually diverge. Add snapshot tests to pin correct behavior.