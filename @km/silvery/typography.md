---
id: "@km/silvery/typography"
aliases:
  - km-silvery.typography
  - km-silvery-typography
created_by: claude:73d7a332
created_at: 2026-03-11T21:17:56Z
closed_at: 2026-03-11T22:01:27Z
close_reason: "Implemented 16 typography components: H1-H3, P, Lead, Muted,
  Strong, Em, Code, Kbd, Blockquote, CodeBlock, HR, UL, OL, LI. UL/OL support
  nesting via React context. All components accept optional color prop. Updated
  all silvery example apps to use typography presets (Kbd for help bars, H1 for
  titles, Muted for secondary text). Exports from silvery main package."
owner: bjorn@stabell.org
---

# [x] Typography presets: H1, H2, H3, Muted, Lead components @km/silvery #feature #P2

Add typography preset components similar to shadcn/ui typography. TUIs lack font-size variation, so color + bold/dim/italic are the only hierarchy tools. Presets codify the recommended combinations from the semantic colors guide.

Components:
- <H1> → $primary + bold
- <H2> → $accent + bold  
- <H3> → $fg + bold
- <Muted> → $muted
- <Lead> → $fg + italic
- <Small> → $muted + dim (optional)

Should be simple wrapper components in @silvery/ui that apply the right color + typography props. Update the semantic colors guide to remove 'planned' caveat once implemented.