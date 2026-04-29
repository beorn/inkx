---
id: "@km/silvercode/bounded-scroll-cap-tuning"
aliases:
  - km-silvercode.bounded-scroll-cap-tuning
  - km-silvercode-bounded-scroll-cap-tuning
created_by: claude:2405c72e
created_at: 2026-04-28T22:17:28Z
---

# [ ] BoundedScroll: 30-row default — calibrate cap per disclosure type @km/silvercode #task #P3 #design

blocks:: [[@km/silvercode]]

BoundedScroll wraps every disclosure with a 30-row visible cap. The bead description for design-review explicitly flags this as a likely tweak area: 'BoundedScroll cap (30 rows — too tall? too short? per-component override?)'. \n\nReview observation: 30 rows is fine for ToolCall expanded body (e.g. file content, stdout — long is expected) but feels excessive for AmbientEventRow expanded body (a recall snippet is rarely that long; chatty filewatch bursts are noise). Per-disclosure-type override would let the design system tune:\n  - ToolCall body: 30 (current)\n  - AmbientEventRow body: 12 (chatty)\n  - SubAgentExchange children: 30 (current — sub-agent stream is its own conversation)\n  - Accordion 'N more lines' rest: 30 (current)\n  - Popover body: ungated (popovers are already bounded by maxWidth)\n\nApproach: BoundedScroll already accepts maxRows prop — caller-side change. Either (a) audit each usage and pass tuned maxRows, or (b) introduce named caps in a shared constants file (DISCLOSURE_BODY=30, AMBIENT_BODY=12, SUMMARY_REST=30) and import.\n\nAcceptance: each call site uses an explicit, semantically-named cap; BoundedScroll's 30-default still acts as fallback. Discovered during @km/silvercode/design-review walkthrough.