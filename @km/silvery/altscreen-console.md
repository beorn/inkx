---
id: "@km/silvery/altscreen-console"
aliases:
  - km-silvery.altscreen-console
  - km-silvery-altscreen-console
created_by: claude:19080504
created_at: 2026-03-30T21:28:45Z
closed_at: 2026-03-30T21:29:38Z
close_reason: "Not a bug — render() supports patchConsole option (defaults to
  true). Was calling render() without options. Fixed by using render(el, term, {
  patchConsole: true }) and handle.run()."
owner: bjorn@stabell.org
---

# [x] Console output leaks into alt screen in fullscreen render mode @km/silvery #bug #P2

When using createTerm() + render() in fullscreen (alt screen) mode, console.log/warn/error from dependencies (e.g. loggily) writes directly to stdout, corrupting the alt screen display. Silvery should either intercept console output automatically in fullscreen mode, or provide guidance on the canonical pattern for handling this.