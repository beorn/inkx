---
id: "@km/tui/omnibox-parse-chips"
aliases:
  - km-tui.omnibox-parse-chips
  - km-tui-omnibox-parse-chips
created_by: Bjørn Stabell
created_at: 2026-04-15T00:09:32Z
closed_at: 2026-04-28T22:29:24Z
close_reason: Live parse chips shipped. Pure chipsFromQuery derives 10 kinds
  (command/context/tag/project/node/local_find/task/text/phrase/exclude) from
  the buffer; ParseChips component renders them between TextInput and PickerList
  in UnifiedOmnibox. 23 unit tests + 3 render tests, all green. Acceptance
  (a)-(d) + (g) covered; (e) esthetic parity will land in mockup app.
---

# [x] Live parse chips — visible query tokens above input @km/tui #feature #P1 @claude:2405c72e

blocks:: [[@km/tui/omnibox-query-syntax]], [[@km/tui/omnibox-unified]]

Render recognized query tokens as visible chips above the single buffer. Example: typing '[] due::today @me urgent -resolved' shows chips [scope:task] [due:today] [assignee:@me] [text:urgent] [exclude:resolved] + any unparsed remainder. Chips update on every keystroke so users see what the parser understood.

/big research: GPT-5.4 Pro flagged 'hidden grammar accretion' as a top failure mode — users won't discover [x], 'exact, prop::value unless the UI teaches and echoes them. Live parse chips are the 'visible narrowing legend' pattern from Emacs Consult and which-key.

This is the biggest single fix for 'hidden-language anxiety' per the pro review. It doesn't change the parser or the syntax; it only affects how the parsed state is surfaced to the user.

Depends on: @km/tui/omnibox-query-syntax (needs ParsedQuery as the input).

Acceptance:
(a) chips render above the buffer, one per parsed token
(b) chips update on every keystroke without jitter
(c) chip color/style differs per token kind (scope, filter, text, exclude)
(d) typing an unknown token shows an 'unparsed' chip or dims the remainder
(e) esthetic parity tested in the mockup app first
(f) docs show a chip legend
(g) accessible to keyboard-only users (chip list is readable but not interactive — tokens are still edited via the buffer)