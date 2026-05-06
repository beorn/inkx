---
aliases:
  - km-silvery.scroll-input-cadence-detection
  - km-silvery-scroll-input-cadence-detection
created_at: 2026-05-05T19:25:10.795Z
---

# [x] Mouse-wheel vs trackpad cadence detection #feature #P3

closed:: 2026-05-05
closed_by:: silvery 0148a14d (km c4c2f25d6)

Shipped on silvery main 0148a14d. enableInputCadenceDetection added to UseKineticScrollOptions and ListView. Inter-event interval + magnitude classify the stream: ≥50ms gap + |deltaY|≤1 = "discrete" (mouse wheel — 3 rows/click via DISCRETE_STEP_MULTIPLIER, no momentum coast); ≤30ms gap or |deltaY|>1 = "continuous" (trackpad — current smooth physics). 30-50ms band is hysteresis to prevent flapping. 3 regression tests covering discrete cadence, continuous cadence, and default-off.

---

Trackpad scroll delivers a continuous stream of small wheel events (events arrive < 30ms apart, deltaY = ±1 each in terminal SGR mouse). Mouse-wheel scroll delivers discrete clicks with larger gaps (events ≥ 50-100ms apart). Treating both identically makes mouse wheel feel chunky and overshooty — the physics is tuned for the trackpad cadence.

In browser DOM, libraries (Lenis, Chromium) use event.deltaMode (DOM_DELTA_LINE for mouse vs DOM_DELTA_PIXEL for trackpad). Terminal mouse SGR doesn't expose this — we have to detect via cadence + magnitude.

API: add enableInputCadenceDetection?: boolean (default false). When enabled:

- Track inter-event timing (wheelBuffer already has timestamps)
- If recent inter-event interval > 50ms AND deltaY=±1 (typical mouse wheel): treat as 'mouse-wheel mode' — apply larger step (e.g. wheelMultiplier * 3) and skip the windowed-velocity decay (just discrete jumps)
- If recent intervals < 30ms or deltaY > 1: treat as 'trackpad mode' — current physics

Marked P3 — 'if it's easy' qualifier from user. Easy-ish (~30 LOC of cadence-tracking + branching), but real value depends on actual mouse-wheel hardware testing and may need tuning.

Acceptance:

- enableInputCadenceDetection option exposed
- discrete-cadence input (50ms+ gaps, deltaY=±1) jumps in larger steps with no decay
- continuous-cadence input keeps current smooth physics
- default off — no behavior change for existing consumers
- test: simulate slow-cadence vs fast-cadence event stream

