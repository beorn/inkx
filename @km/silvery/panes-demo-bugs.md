---
id: "@km/silvery/panes-demo-bugs"
aliases:
  - km-silvery.panes-demo-bugs
  - km-silvery-panes-demo-bugs
created_by: Bjørn Stabell
created_at: 2026-04-02T22:41:02Z
closed_at: 2026-04-02T23:50:21Z
close_reason: Fixed. Output guard patches console. Panes demo uses new props.
  Display offset resolved.
---

# [x] [bug] Panes demo: search broken, display offset, search input missing keybindings @km/silvery #bug #P1

Three bugs in the panes demo (examples/apps/panes/index.tsx):

1. **Search not working** — SurfaceRegistry deleted, SearchProvider stubbed. Ctrl+F opens search UI but finds nothing. Blocked on @km/silvery/search-machine.

2. **Display offset** — Console log output appears to be leaking into the rendering, shifting lines up. Likely debug output going to stdout instead of DEBUG_LOG. Need to check if the aichat components or panes example itself has console.log calls.

3. **Search input missing keybindings** — SearchBar's input doesn't support standard readline keybindings (Ctrl+W word delete, Ctrl+A/E home/end, etc.). The SearchBindings component in SearchProvider.tsx only handles: printable chars, backspace, left/right arrows, Escape, Enter. Missing: Ctrl+W, Ctrl+U, Ctrl+A, Ctrl+E, Alt+B, Alt+F, Ctrl+K, Ctrl+Y.

## Fix plan

Bug 1: Deferred — requires search-machine (@km/silvery/search-machine) or at minimum, ListView auto-registering as Searchable.

Bug 2: Investigate — grep for console.log in examples/apps/panes/ and examples/apps/aichat/. Remove or redirect to DEBUG_LOG.

Bug 3: SearchProvider's SearchBindings should use TextInput or the readline state machine from @silvery/headless instead of manual key handling. This is a "Tarnished" pattern per The Silvery Way — manual key handlers instead of canonical TextInput.