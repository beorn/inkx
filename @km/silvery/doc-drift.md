---
mentions:
  - km
  - Bjørn
id: "@km/silvery/doc-drift"
aliases:
  - km-silvery.doc-drift
  - km-silvery-doc-drift
created_by: Bjørn Stabell
created_at: 2026-04-10T23:04:49Z
closed_at: 2026-04-10T23:13:53Z
close_reason: "Fixed all 6 contradictions: (1) Qualified '5 stages' claim to
  keyboard events only; (2) Fixed event type matrix — release events are SKIPPED
  at Stage 3 before focus dispatch, not routed to onKeyUp; Stage 4 notes onKeyUp
  as NOT YET WIRED; (3) Corrected React DOM comparison — React DOM has
  onKeyUpCapture; Silvery's no-capture for release is a deliberate
  simplification; fixed both input-architecture.md and focus-events.ts comments;
  (4) Changed useInput docs from 'throws outside runtime' to 'no-ops' matching
  actual code behavior; (5) Removed duplicate InputHandler definition from
  useInput.ts, now imports from @silvery/ag/keys (matching canonical location
  table); (6) Removed unused FocusCallback type from runtime-subscribers.ts
  (YAGNI)"
owner: bjorn@stabell.org
assignee: Bjørn Stabell
---

# [x] Architecture doc has 6 contradictions vs code (Pro review finding) @km/silvery #bug #P0 @Bjørn Stabell

GPT 5.4 Pro found 6 specific doc/code contradictions:

1. 'All events follow same 5 stages' but resize/focus/mouse don't
2. Stage 4 onKeyUp claim but release filtered before focus dispatch
3. React DOM comparison incorrect (React has Capture variants)
4. useInput doc says 'throws outside runtime' but code no-ops
5. InputHandler canonical location says ag/keys but useInput defines it locally
6. FocusCallback defined in runtime-subscribers but SubscriberList only has input + paste

/complete: all 6 contradictions resolved, doc and code agree

