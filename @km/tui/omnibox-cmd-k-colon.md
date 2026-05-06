---
mentions:
  - km
id: "@km/tui/omnibox-cmd-k-colon"
aliases:
  - km-tui.omnibox-cmd-k-colon
  - km-tui-omnibox-cmd-k-colon
created_by: Bjørn Stabell
created_at: 2026-04-15T06:07:23Z
closed_at: 2026-04-15T06:12:46Z
close_reason: "Fixed in 504bf996b. Two bugs resolved: (a) command_palette now
  opens legacy Omnibox with initialBuffer=':' via new OmniboxProps.initialBuffer
  default. (b) scoreResult bug — query ':' filtered all commands to zero because
  no label contained ':'. Fix: split deferredQuery into queryMode + queryBody
  via modeOf(), score against the body not the raw query, return unranked list
  when body is empty, and hide command list for content sigils (@ # + ~). 20
  omnibox tests still green after updating three tests to reflect the new
  command-mode default."
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-tui.omnibox-cmd-k-colon
    depends_on_id: km-tui
    type: parent-child
    created_at: 2026-04-14T23:07:23Z
    created_by: Bjørn Stabell
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-tui
---

# [x] Omnibox: Cmd-K should open with ':' prefix already inserted + show all commands for empty query @km/tui #bug #P1

blocks:: [[@km/tui]]

## User feedback

'cmd-k opens it up and only shows commands but there is no : prefix — when I type : I don't see any results anymore. My expectation was that cmd-k should open it up with : in the search field therefore scoped to commands by default, and could already show all commands (don't wait for me to type more chars to list something).'

## Two bugs

### Bug 1: cmd-k doesn't pre-fill the buffer with ':'

Currently cmd-k opens the legacy Omnibox with an empty buffer. The user expects it to open with ':' already inserted (since cmd-k semantically means 'command mode'). The sigil prefix makes the mode visible in the input and primes the user to type the command name.

### Bug 2: typing ':' filters results to zero

When the user types ':' into the (currently empty) buffer, the legacy Omnibox's scoreResult() calls fuzzyScore(':', commandName). The ':' char doesn't match any command name, so every command scores 0 and gets filtered out. Result list goes empty.

Root cause: the legacy Omnibox doesn't recognize ':' as a sigil the way the unified Omnibox does (via modeOf() + strip-leading-sigil). It scores the RAW query against labels.

## Fix

Two paths:

(a) **Legacy patch**: in apps/@km/tui/src/views/Omnibox.tsx, strip the leading sigil from deferredQuery before scoring. When buffer starts with ':', search commands only with the tail; with empty tail, show all commands.

(b) **Phase 12 flip**: reroute cmd-k / ':' to open the unified Omnibox which already handles this correctly. This is the bigger cleanup tracked in @km/tui/omnibox-quality-plateau. Would resolve this bug as a side-effect.

Recommend (a) as the immediate fix + (b) as the follow-through. (a) is a minimal patch; (b) takes longer and needs dogfood verification.

## Acceptance

(a) cmd-k opens the omnibox with buffer := ':'
(b) Typing ':' keeps all commands visible (empty query matches all after sigil strip)
(c) Typing ':mov' narrows to commands whose name/description/id fuzzy-matches 'mov'
(d) Existing omnibox tests still pass

Related: @km/tui/omnibox-quality-plateau

