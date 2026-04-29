---
id: "@km/silvery/pretext-pluggable-measure"
aliases:
  - km-silvery.pretext-pluggable-measure
  - km-silvery-pretext-pluggable-measure
created_by: Bjørn Stabell
created_at: 2026-04-10T20:21:08Z
---

# [ ] Pretext pluggable measurement — propose upstream API for terminal/canvas/server backends @km/silvery #feature #P4

Propose pluggable measurement for Pretext (@chenglou/pretext) so the same algorithms work across terminal (integer cell widths), canvas (sub-pixel), and server-side. Current: Pretext uses canvas measureText, terminals cant use it. Proposed: prepare(text, { graphemeWidth: fn, isZeroWidth?: fn }). Also propose shrinkwrapWidth() as first-class API, ANSI token awareness. Actions: file issue on chenglou/pretext, align our API naming with walkLineRanges/measureLineStats.