---
id: "@km/silvery/paste-unification"
aliases:
  - km-silvery.paste-unification
  - km-silvery-paste-unification
created_by: Bjørn Stabell
created_at: 2026-04-10T23:02:52Z
closed_at: 2026-04-11T18:12:37Z
close_reason: "Superseded: merged into km-silvery.tea-useinput — paste routing
  is part of the same event precedence fix."
owner: bjorn@stabell.org
---

# [x] Paste unification — one hook, two modes (simple + rich) @km/silvery #task #P0

Merge usePaste context getter (currently a hook that returns PasteHandler interface) with usePasteCallback event subscription into a single usePaste hook. 

Target: one hook with two modes
- Simple: usePaste((text) => insertText(text)) — callback gets plain string
- Rich: usePaste((event) => handlePasteEvent(event)) — callback gets PasteEvent with source + clipboard data

Delete: PasteProvider, usePasteEvents, old usePasteCallback hook, PasteHandler interface
Keep: useInput({onPaste}) for Ink compat (simple text callback)

Design validated by comparing React DOM, React Native, Ink paste APIs.