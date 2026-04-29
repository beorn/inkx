---
id: "@km/silvery/era2-docs"
aliases:
  - km-silvery.era2-docs
  - km-silvery-era2-docs
created_by: Bjørn Stabell
created_at: 2026-04-10T23:42:42Z
closed_at: 2026-04-11T18:12:31Z
close_reason: "Superseded: docs centralized on app-composition.md as canonical.
  Conflicting docs archived to archive/tea-exploration/."
owner: bjorn@stabell.org
---

# [x] Docs era2 alignment — flag era1 patterns, add era2 references @km/silvery #task #P1

3 public docs teach era1 as authoritative without era2 context:

1. docs/guide/input-architecture.md — processEventBatch + RuntimeContext as THE model
   Fix: add transition header, note era2 replaces with apply chain
   
2. docs/guide/runtime-layers.md — createApp(store) with Zustand, mislabeled as 'era2b'
   Fix: label as era1, note era2 uses create() + signals + domain plugins

3. docs/guide/event-handling.md — EventMap/AppEvent patterns are era1
   Fix: note era2 uses OpTypes declaration merging

4. silvery/CLAUDE.md lines 170-199 — era2 callout but era1 details remain
   Fix: reconcile surrounding text with era2 model

5. docs/guide/providers.md — spread pattern, not apply-wrapping
   Fix: add apply-wrapping example alongside spread

6. docs/guide/the-silvery-way.md — TEA graduation shows Zustand not signals
   Fix: update progression to include signals/createModel

/complete: no public doc teaches RuntimeContext as the event bus without era2 note