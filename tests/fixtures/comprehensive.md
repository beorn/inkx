---
title: Comprehensive Test Fixture
type: fixture
tags:
  - test
  - comprehensive
  - markdown
author: test-user
created: 2025-01-08
priority: 1
---

# Main Section

This is a paragraph with **bold**, *italic*, and `inline code`.

## Tasks with Standard Marks

- [ ] Open task (default)
- [x] Completed task
- [X] Also completed (uppercase X)

Note: Custom marks like [/], [-], [?] are NOT recognized as tasks by GFM parser.
They are treated as regular list items. Use standard marks only for reliable parsing.

## Tasks with Metadata (Obsidian Tasks Format)

- [ ] Task with due date 📅 2025-03-15
- [ ] Task with scheduled date ⏳ 2025-03-10
- [ ] Task with high priority ⏫
- [ ] Task with medium priority 🔼
- [ ] Task with low priority 🔽
- [ ] Task with recurrence 🔁 every week
- [ ] Full metadata 📅 2025-04-01 ⏳ 2025-03-25 ⏫ 🔁 every day

## Tasks with Tags

- [ ] Task with #important tag
- [ ] Multiple tags #work #urgent #project-alpha
- [x] Completed with #done tag

## Nested Lists

- Parent item 1
  - Child item 1.1
  - Child item 1.2
    - Grandchild 1.2.1
- Parent item 2
  - Child item 2.1

## Nested Tasks

- [ ] Parent task
  - [ ] Subtask 1
  - [x] Subtask 2 (done)
    - [ ] Sub-subtask

## Ordered Lists

1. First item
2. Second item
3. Third item
   1. Nested first
   2. Nested second

## Blockquotes

> This is a simple blockquote.

> Multi-line blockquote
> with several lines
> of quoted text.

## Code Blocks

```javascript
function hello(name) {
  return `Hello, ${name}!`;
}
```

```python
def factorial(n):
    if n <= 1:
        return 1
    return n * factorial(n - 1)
```

```
Plain code block without language
```

## Tables

| Column 1 | Column 2 | Column 3 |
| -------- | -------- | -------- |
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |

## Horizontal Rules

---

Content after horizontal rule.

***

Another section after asterisk rule.

## Links and References

This has a [[wikilink]] and [[target#section|aliased link]].

Also [[note#heading]] and [[doc^blockid]].

Regular [markdown link](https://example.com).

## Images

![Alt text](image.png)

## HTML Blocks

<div class="custom">
  Custom HTML content
</div>

## Deep Section Hierarchy

### Level 3 Heading

Content at level 3.

#### Level 4 Heading

Content at level 4.

##### Level 5 Heading

Content at level 5.

###### Level 6 Heading

Content at level 6.

## Mixed Content Section

This paragraph has inline elements.

- [ ] A task item
- A regular list item

> A quote mixed in

```
code block
```

Final paragraph in section.

## Edge Cases

### Empty Task Content

- [ ]
- [x]

### Special Characters

- [ ] Task with "quotes" and 'apostrophes'
- [ ] Task with <angle> brackets
- [ ] Task with [square] brackets
- [ ] Task with emoji 🚀 🎉 ✨

### Unicode

- [ ] タスク in Japanese
- [ ] Задача in Russian
- [ ] 任务 in Chinese
