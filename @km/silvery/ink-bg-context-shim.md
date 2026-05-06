---
mentions:
  - km
id: "@km/silvery/ink-bg-context-shim"
aliases:
  - km-silvery.ink-bg-context-shim
  - km-silvery-ink-bg-context-shim
created_by: Bjørn Stabell
created_at: 2026-04-09T20:12:23Z
closed_at: 2026-04-09T23:34:23Z
owner: bjorn@stabell.org
---

# [x] Ink 7.0 BackgroundContext shim — expose Provider + hook, wire to findInheritedBg @km/silvery #feature #P1

Ink 7.0 added React Context-based background color inheritance. Silvery does bg inheritance at paint-time via findInheritedBg() walking the render tree. Observable behavior is the same for normal code, but 27 Ink 7.0 tests fail because silvery doesn't expose the BackgroundContext API.

## Fix

Expose <BackgroundContext.Provider value={color}> and useContext(BackgroundContext) in @silvery/ink compat layer. Provider is a no-op for silvery's internal rendering (bg inheritance already happens via paint-time walk). The hook reads from the nearest parent's findInheritedBg() result so consumer code gets the right value.

## Impact

Closes 27 of 60 Ink 7.0 compat failures — brings compat to ~95%.

## Parent

@km/silvery/positioning

