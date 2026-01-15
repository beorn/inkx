# Inbox

Quick capture for unprocessed items.

## Wiki Links

- [ ] Simple link to [[Resources/Design System]]
- [ ] Link with alias [[Resources/Design System|design tokens]]
- [ ] Link with section [[Projects/API Refactor#Authentication]]
- [ ] Multiple links: see [[Resources/API Guidelines]] and [[Resources/Design System]]

## Rich Text Formatting

- [ ] Task with **bold** text and _italic_ emphasis
- [ ] Task with **_bold italic_** combined
- [ ] Task with ~~strikethrough~~ text
- [ ] Task with `inline code` backticks
- [ ] Task with **nested _formatting_ here**
- [ ] Mixed: Check `config.json` for **API_KEY** setting

## Markdown Links

- [ ] Standard link [Google](https://google.com)
- [ ] Link with title [Example](https://example.com "Example Site")
- [ ] Reference-style link [docs][1]
- [ ] Auto-link: review https://github.com/org/repo/issues/42

[1]: https://docs.example.com

## Inline Fields (Dataview style)

- [ ] Task with due date [due:: 2025-02-01]
- [ ] Task with priority [priority:: 1]
- [ ] Task with multiple fields [due:: 2025-01-20] [priority:: 2]
- [ ] Task with custom field [status:: waiting] [context:: work]
- [ ] Task with assignee [assigned:: @alice]

## Obsidian Tasks Metadata

- [ ] Due with emoji 📅 2025-01-25
- [ ] Scheduled with emoji ⏳ 2025-01-18
- [ ] High priority ⏫
- [ ] Medium priority 🔼
- [ ] Low priority 🔽
- [ ] Recurring task 🔁 every week
- [ ] Full metadata 📅 2025-02-01 ⏳ 2025-01-15 ⏫ 🔁 every month

## Tags and Mentions

- [ ] Task with #urgent tag
- [ ] Task with multiple #tags #work #project
- [ ] Mention @sarah for review
- [ ] Project context +website-redesign
- [ ] Combined: @bob #review +api-project

## Edge Cases

- [ ] Very long task description that should test wrapping behavior when displayed in narrow columns or constrained TUI views that need proper truncation with ellipsis
- [ ] Short
- [ ] Empty inline field [note:: ]
- [ ] Special chars: "quotes", 'apostrophes', & ampersand, <brackets>
- [ ] Unicode: emoji 🎯 and symbols → ← ↔ ✓ ✗
- [ ] Nested [[link with **bold** inside]]
