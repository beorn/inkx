---
mentions:
  - silvery
  - km
id: "@km/silvery/ansi-sanitize"
aliases:
  - km-silvery.ansi-sanitize
  - km-silvery-ansi-sanitize
created_by: claude:474834b0
created_at: 2026-03-10T03:44:08Z
closed_at: 2026-03-10T04:18:39Z
close_reason: Implemented sanitizeAnsi() and tokenizeAnsi() in @silvery/term.
  Tokenizer handles all ANSI sequence types (CSI, OSC, DCS, PM, APC, SOS, C1).
  Sanitizer keeps text + SGR styling + OSC hyperlinks, strips dangerous
  sequences. 63 tests. Exported from @silvery/term barrel.
owner: bjorn@stabell.org
---

# [x] ANSI escape sequence sanitizer in @silvery/term @km/silvery #feature #P2

Port Ink tokenizeAnsi/sanitizeAnsi to @silvery/term as a core security feature. Strips dangerous escape sequences (cursor movement, screen clearing, DCS, PM, APC) from user-provided text while preserving SGR styling and OSC hyperlinks. Useful for any app rendering untrusted text content. Also fixes ~27 Ink compat text tests.

