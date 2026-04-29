---
id: "@km/silvery/examples-canonical"
aliases:
  - km-silvery.examples-canonical
  - km-silvery-examples-canonical
created_by: claude:474834b0
created_at: 2026-03-10T18:13:30Z
closed_at: 2026-03-10T18:48:40Z
close_reason: Converted app-todo.tsx to pipe() composition. Created
  pipe-composition.tsx example. Updated run-counter.tsx with pipe() doc comment.
  migrate-from-ink.md, silvery-vs-ink.md, compatibility.md updated with
  withInk() references.
---

# [x] Review examples against new plugin APIs — adopt the Silvery Way @km/silvery #task #P2 @claude:55df8ef1

After plugin composition APIs are implemented (@km/silvery/plugin-composition), review all silvery examples (interactive/, web/showcases/, runtime/) and determine which should use the new APIs.

## Questions to answer
- Which examples should use pipe() composition instead of run()?
- Which should demonstrate withDomEvents() for mouse interaction?
- Which should use withFocus() for keyboard navigation?
- Should any existing examples become canonical references for specific plugin patterns?
- Are there new examples needed to showcase the plugin system?

## Scope
- examples/interactive/*.tsx (19 files)
- examples/runtime/*.tsx (4 files)  
- examples/web/showcases/*.tsx (13 files)
- Doc example pages (8 pages under docs/examples/)