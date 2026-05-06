---
mentions:
  - km
id: "@km/silvery/ag-architecture"
aliases:
  - km-silvery.ag-architecture
  - km-silvery-ag-architecture
created_by: Bjørn Stabell
created_at: 2026-04-10T22:36:56Z
closed_at: 2026-04-10T23:32:08Z
close_reason: Scope absorbed into km-silvery.era2. All completed work preserved
  (doc-drift, modifier-parser, input-event-model closed). Open beads reparented
  under era2 epic. Design doc updated with plugin-centric model + era2
  reference.
owner: bjorn@stabell.org
---

# [x] ag* package architecture — clean layers, no duplication, quality plateau @km/silvery #epic #P0

## Problem

The ag* packages (ag, ag-react, ag-term, create) have:

- Circular dependencies (ag-term ↔ create, ag-react → ag-term despite no declared dep)
- Duplicate patterns (SubscriberList in 2 files, isModifierOnlyEvent was in 2 files)
- Confusing names (ag-term contains React hooks, create is the event loop)
- Two paste hooks (usePaste context getter + usePasteCallback event subscription) — should be one
- Types defined locally instead of imported (InputCallback, PasteCallback were in 3 files)
- Architecture doc exists but was invisible (3 agent sessions rediscovered it from code)

## Root cause

Packages are organizational namespaces, not dependency layers. They evolved organically — run.tsx predated ag-react's hooks, create-app grew into the central event loop without being named for it, ag-term became a catch-all.

## Quality plateau definition

When a new developer (or agent) can understand the event flow by reading the code:

- [ ] Package names communicate purpose (types, hooks, runtime, composition)
- [ ] Dependency graph is a clean DAG (no cycles)
- [ ] Each concept lives in exactly ONE place (zero duplicate types, hooks, or patterns)
- [ ] Architecture doc is discoverable from CLAUDE.md AND from code (stage comments)
- [ ] One paste hook, not two — usePaste should handle both simple callback and rich PasteEvent
- [ ] Shared types (SubscriberList, InputCallback) in a single shared file
- [ ] isModifierOnlyEvent in @silvery/ag/keys (single source)
- [ ] All hooks in ag-react, zero hook implementations elsewhere
- [ ] Tests verify the documented 5-stage pipeline behavior

## What's already done (this session)

- [x] useInput unified — single impl in ag-react, re-exported from run.tsx
- [x] useExit moved to ag-react
- [x] usePasteCallback created in ag-react (aliased as usePaste from run.tsx)
- [x] isModifierOnlyEvent extracted to @silvery/ag/keys
- [x] SubscriberList extracted to ag-react/runtime-subscribers.ts
- [x] InputHandler/PasteHandler type collisions renamed (InputCallback/PasteCallback)
- [x] CLAUDE.md points to architecture doc
- [x] Code files annotated with Stage N references
- [x] Architecture doc updated

## Remaining work

### Paste unification

Merge usePaste (context getter) and usePasteCallback (event subscription) into ONE hook:

```tsx
// Simple: callback gets plain text
usePaste((text) => insertText(text))

// Rich: callback gets PasteEvent with source detection
usePaste((event) => {
  if (event.source === 'internal') insertMarkdown(event.data.markdown)
  else insertPlainText(event.text)
})
```

Delete PasteProvider, usePasteEvents bridge. One hook, overloaded signature.

### Package restructure (evaluate)

Current: ag (types), ag-react (hooks + components), ag-term (runtime + terminal + pipeline), create (event loop + composition)
Consider: do the names need to change? Do the boundaries need to move? Or is documenting the current structure sufficient?

### Dependency cleanup

- ag-react imports from ag-term without declaring the dependency
- ag-term ↔ create circular dependency
- Evaluate: can these be broken with interface extraction?

### Test coverage

- usePaste, useExit, useInputLayer need dedicated tests
- Pipeline stage behavior tests (Stage 3 bridges before filtering, etc.)

/complete: new agent understands event flow in <5 min by reading code + CLAUDE.md

