# km-ast Test Fixtures

Markdown input → expected AST for each scenario.
Notation: indentation shows parent→child. Fields shown only when non-default.

## Fixture 1: Simple file with heading and body

### Markdown

```markdown
# My Project

This is the introduction paragraph.

Here is another paragraph.
```

### AST

```
h item(fstype:mdfile, name:"my-project", content:"My Project")
  p(content:"This is the introduction paragraph.")
  p(content:"Here is another paragraph.")
```

**Key points:**

- H1 content goes into the item's content field — no child h node
- Paragraphs are children[0..n]
- name derived from filename (not shown in markdown)
- No sub-items (no sub-headings)
- Title resolution: content → name → id

## Fixture 2: File with sections

### Markdown

```markdown
# Todo Board

Some intro text.

## Backlog

Write docs for the API.

## In Progress

### Auth module

Almost done.

### Payment integration

Blocked on Stripe.
```

### AST

```
h item(fstype:mdfile, name:"todo-board", content:"Todo Board")
  p(content:"Some intro text.")                           ← children[0]
  h item(fstype:mdsection, name:"backlog", content:"Backlog")       ← sub-items[0]
    p(content:"Write docs for the API.")
  h item(fstype:mdsection, name:"in-progress", content:"In Progress") ← sub-items[1]
    h item(fstype:mdsection, name:"auth-module", content:"Auth module")
      p(content:"Almost done.")
    h item(fstype:mdsection, name:"payment-integration", content:"Payment integration")
      p(content:"Blocked on Stripe.")
```

**Key points:**

- Heading level is implicit from depth (H1=depth 0, H2=depth 1, H3=depth 2)
- Each section's title is in the item's content field
- "In Progress" has no children other than sub-items
- name is slugified from heading text for mdsection

## Fixture 3: Lists (unordered, ordered, nested)

### Markdown

```markdown
## Shopping

- Apples
- Bananas
  - Green ones
  - Ripe ones
- Milk

1. Wake up
2. Brush teeth
3. Make coffee
```

### AST

```
h item(fstype:mdsection, name:"shopping", content:"Shopping")
  p item(list:"-", content:"Apples")               ← children[0]
  p item(list:"-", content:"Bananas")               ← children[1]
    p item(list:"-", content:"Green ones")            ← nested (child item of parent item)
    p item(list:"-", content:"Ripe ones")
  p item(list:"-", content:"Milk")                  ← children[2]
  p item(list:"1.", content:"Wake up")              ← children[3] — new list (different marker)
  p item(list:"2.", content:"Brush teeth")
  p item(list:"3.", content:"Make coffee")
```

**Key points:**

- p item has .content directly — the text is in the content field
- Nested list items are child items of the parent p item
- item.list preserves original style ("-" vs "1.")
- Ordered numbering stored as-is in item.list
- Consecutive p items with compatible item.list values serialize back to one markdown list

## Fixture 4: Tasks (checkbox items)

### Markdown

```markdown
## Sprint 3

- [x] Deploy staging
- [ ] Write migration
- [/] Code review
- [!] Waiting on design

### [x] Auth overhaul

Completed last week.
```

### AST

```
h item(fstype:mdsection, name:"sprint-3", content:"Sprint 3")
  p item(list:"-", task:{marker:"[x]",status:"done"}, content:"Deploy staging")
  p item(list:"-", task:{marker:"[ ]",status:"todo"}, content:"Write migration")
  p item(list:"-", task:{marker:"[/]",status:"wip"}, content:"Code review")
  p item(list:"-", task:{marker:"[!]",status:"blocked"}, content:"Waiting on design")
  h item(fstype:mdsection, name:"auth-overhaul", task:{marker:"[x]",status:"done"}, content:"Auth overhaul")
    p(content:"Completed last week.")
```

**Key points:**

- item.task.marker is the checkbox including brackets: "[x]", "[ ]", "[/]", "[!]", "[-]"
- item.task.status is stored alongside marker: "[x]"→done, "[ ]"→todo, "[/]"→wip, "[!]"→blocked, "[-]"→dropped
- item.list ("-") and item.task are independent — both live inside the item object
- The checkbox is NOT part of the content string — it's extracted to item.task
- Section headings with `[x]` prefix → h item with task:{marker:"[x]",status:"done"}

## Fixture 5: Code blocks and quotes

### Markdown

```markdown
## Setup

Install dependencies:

    npm install

Or use the script:

\`\`\`bash
./setup.sh --env production
\`\`\`

> Note: requires Node 20+
>
> See the docs for details.
```

### AST

```
h item(fstype:mdsection, name:"setup", content:"Setup")
  p(content:"Install dependencies:")
  code(content:"npm install")
  p(content:"Or use the script:")
  code(content:"./setup.sh --env production", data:{lang:"bash"})
  quote(content:"Note: requires Node 20+\n\nSee the docs for details.")
```

**Key points:**

- Code blocks preserve language info in data
- Indented code blocks and fenced blocks both become `code` type
- Quote blocks preserve internal paragraph structure in content

## Fixture 6: Embeds

### Markdown

```markdown
## Dashboard

![[weekly-report]]

Some commentary on the report.

![[monthly-metrics|Q4 Metrics]]
```

### AST

```
h item(fstype:mdsection, name:"dashboard", content:"Dashboard")
  embed(embed_of:"weekly-report")                  ← children[0]
  p(content:"Some commentary on the report.")
  embed(embed_of:"monthly-metrics", name:"Q4 Metrics")
```

**Key points:**

- Embeds are `embed` nodes with `embed_of` specifying the target
- No alias → display falls back to target's title
- With alias → name field holds the alias text
- `[[references]]` (without !) stay inline in content strings, not nodes

## Fixture 7: Embed as section title

### Markdown

```markdown
## ![[project-overview]]

The project is going well.
```

### AST

```
h item(fstype:mdsection, name:"project-overview")
  embed(embed_of:"project-overview")               ← children[0] = title position
  p(content:"The project is going well.")
```

**Key points:**

- An embed node can be children[0] (the title position)
- name derived from embed target
- View layer shows target's title (or alias if embed has name)

## Fixture 8: Folder structure

### Filesystem

```
projects/
├── projects.md       (with H1 "Projects")
├── alpha/
│   ├── alpha.md      (with H1 "Project Alpha")
│   └── notes.md      (with H1 "Notes")
└── beta/
    └── beta.md       (with H1 "Project Beta", sections inside)
```

### AST

```
h item(fstype:folder, name:"projects")
  h item(fstype:mdfile, name:"projects", content:"Projects")  ← index file (collapsible with folder)
  h item(fstype:folder, name:"alpha")
    h item(fstype:mdfile, name:"alpha", content:"Project Alpha")
    h item(fstype:mdfile, name:"notes", content:"Notes")
  h item(fstype:folder, name:"beta")
    h item(fstype:mdfile, name:"beta", content:"Project Beta")
      h item(fstype:mdsection, name:"...")
        ...
```

**Key points:**

- Folders have no content by default (name only)
- Folders can have an index file (same-name .md, README.md, or .md) providing body content and metadata
- View layer collapses folder + index file into one display node
- Files have title in content field
- Only h item inside h item

## Fixture 9: List item with children (rich list items)

### Markdown

```markdown
## API Endpoints

- **GET /users**

  Returns all users. Supports pagination.

  \`\`\`json
  {"users": [...], "total": 42}
  \`\`\`

- **POST /users**

  Creates a new user.
```

### AST

```
h item(fstype:mdsection, name:"api-endpoints", content:"API Endpoints")
  p item(list:"-", content:"**GET /users**")
    p(content:"Returns all users. Supports pagination.")
    code(content:"{\"users\": [...], \"total\": 42}", data:{lang:"json"})
  p item(list:"-", content:"**POST /users**")
    p(content:"Creates a new user.")
```

**Key points:**

- p item has multiple children (same as h item)
- content holds the "title" of the list item (rendered inline, not as heading)
- Rich content (code blocks, multiple paragraphs) under a list item

## Fixture 10: Mixed content (p item inside h item body alongside children)

### Markdown

```markdown
## Notes

Remember to check the logs.

- First finding
- Second finding

Also review the dashboard.

### Analysis

Deep dive results here.
```

### AST

```
h item(fstype:mdsection, name:"notes", content:"Notes")
  p(content:"Remember to check the logs.")              ← children[0]
  p item(list:"-", content:"First finding")       ← children[1] (p item is a child in h item context)
  p item(list:"-", content:"Second finding")      ← children[2]
  p(content:"Also review the dashboard.")                ← children[3]
  h item(fstype:mdsection, name:"analysis", content:"Analysis")  ← sub-items[0]
    p(content:"Deep dive results here.")
```

**Key points:**

- p item appears among p children — it's a child in h item context
- Body children come before sub-items in parent_idx
- The paragraph after the list is still a child, before the sub-item section

## Fixture 11: Content between sibling sections

### Markdown

```markdown
## Project

Some intro.

### Phase 1

Done.

More text here about the project.

### Phase 2

In progress.
```

### AST

```
h item(fstype:mdsection, name:"project", content:"Project")
  p(content:"Some intro.")
  h item(fstype:mdsection, name:"phase-1", content:"Phase 1")
    p(content:"Done.")
    p(content:"More text here about the project.")       ← part of Phase 1 (before next heading)
  h item(fstype:mdsection, name:"phase-2", content:"Phase 2")
    p(content:"In progress.")
```

**Key points:**

- In markdown, content after `### Phase 1` and before `### Phase 2` belongs to Phase 1
- There's no way to "close" a section in markdown — content goes to the preceding heading
- This is NOT "content after sub-items" — it's normal section body content
- The children-before-sub-items rule applies to parent's children, not within sibling boundaries

## Fixture 12: Skipped heading levels

### Markdown

```markdown
# Deep Doc

### Jumped to H3
```

### AST

```
h item(fstype:mdfile, name:"deep-doc", content:"Deep Doc")
  h item(fstype:mdsection, name:"(synthetic)")          ← inserted for missing H2 level
    h item(fstype:mdsection, name:"jumped-to-h3", content:"Jumped to H3")
```

**Key points:**

- H1 → H3 (skipping H2) inserts a synthetic h item at the missing level
- Parse issues a warning
- Round-trip normalizes: serializes as H1 → H2 → H3
- No serialization hints — heading level always equals tree depth

## Fixture 13: Table and HR

### Markdown

```markdown
## Status

| Feature | Status |
| ------- | ------ |
| Auth    | Done   |
| Search  | WIP    |

---

Legacy notes below.
```

### AST

```
h item(fstype:mdsection, name:"status", content:"Status")
  table(content:"| Feature | Status |\n|---------|--------|\n| Auth    | Done   |\n| Search  | WIP    |")
  hr()
  p(content:"Legacy notes below.")
```

**Key points:**

- `---` in body = hr block. `---` at file start = YAML frontmatter (parsed into item's data)
- table content preserves raw markdown format

## Fixture 14: Section without heading (name-only)

An item with no heading, just a name (auto-generated or imported):

### AST

```
h item(fstype:mdsection, name:"untitled-section")
  p(content:"Some content here.")
  p(content:"More content.")
```

**Key points:**

- No content field — no heading
- Title resolution: children[0].content ("Some content here.") → name → id
- View-mode dependent display:
  - Outliner: shows name or children[0].content
  - Doc view: shows children[0] as regular text (no heading style)
- If no children AND no name: shows id (distinctly styled)

## Fixture 15: Empty file (H1 only)

### Markdown

```markdown
# New Document
```

### AST

```
h item(fstype:mdfile, name:"new-document", content:"New Document")
```

**Key points:**

- Minimal valid file: just H1
- One and only one H1 required for files

## Fixture 16: Repo root

### AST

```
h item(fstype:repo, name:"my-vault")
  h item(fstype:folder, name:"projects")
    h item(fstype:mdfile, name:"readme", content:"README")
  h item(fstype:mdfile, name:"index", content:"Welcome")
```

**Key points:**

- repo is the top-level fstype, always exactly one
- repo has no content (name only)
- Direct children can be folders or files

## Fixture 17: Embed as list item

### Markdown

```markdown
## References

- ![[design-doc]]
- ![[api-spec|API Specification]]
- Regular item
```

### AST

```
h item(fstype:mdsection, name:"references", content:"References")
  p item(list:"-")
    embed(embed_of:"design-doc")                     ← children[0]
  p item(list:"-")
    embed(embed_of:"api-spec", name:"API Specification")
  p item(list:"-", content:"Regular item")
```

**Key points:**

- embed node can be children[0] of a p item (same as h item)
- Display uses alias (embed's name) or target's title
- The embed node itself lives inside the p item's children

## Fixture 18: Deeply nested list with rich content

### Markdown

````markdown
## Architecture

- Frontend
  - React components

    Each component has its own directory.

    ```tsx
    export function App() { ... }
    ```

  - State management
    - Redux store
    - Local state

- Backend
````

### AST

```
h item(fstype:mdsection, name:"architecture", content:"Architecture")
  p item(list:"-", content:"Frontend")
    p item(list:"-", content:"React components")
      p(content:"Each component has its own directory.")
      code(content:"export function App() { ... }", data:{lang:"tsx"})
    p item(list:"-", content:"State management")
      p item(list:"-", content:"Redux store")
      p item(list:"-", content:"Local state")
  p item(list:"-", content:"Backend")
```

**Key points:**

- p item nests to arbitrary depth (p item → p item → p item)
- Each p item level follows the same split: children (non-item) before child items (p item)
- Rich content (paragraphs, code) at any nesting level

## Fixture 19: Ordered task list

### Markdown

```markdown
## Release Checklist

1. [x] Tag release
2. [/] Run CI pipeline
3. [ ] Deploy to staging
4. [ ] Smoke test
```

### AST

```
h item(fstype:mdsection, name:"release-checklist", content:"Release Checklist")
  p item(list:"1.", task:{marker:"[x]",status:"done"}, content:"Tag release")
  p item(list:"2.", task:{marker:"[/]",status:"wip"}, content:"Run CI pipeline")
  p item(list:"3.", task:{marker:"[ ]",status:"todo"}, content:"Deploy to staging")
  p item(list:"4.", task:{marker:"[ ]",status:"todo"}, content:"Smoke test")
```

**Key points:**

- Ordered lists can also be tasks
- item.list preserves original numbering
- item.task is independent of item.list

## Fixture 20: HTML block

### Markdown

```markdown
## Widget

<div class="custom-widget">
  <span>Hello</span>
</div>

Some text after.
```

### AST

```
h item(fstype:mdsection, name:"widget", content:"Widget")
  html(content:"<div class=\"custom-widget\">\n  <span>Hello</span>\n</div>")
  p(content:"Some text after.")
```

## Fixture 21: Footnotes

### Markdown

```markdown
## Research

This claim needs a source[^1]. See also the extended discussion[^note].

[^1]: Smith et al., 2024
[^note]: The full analysis is available in the appendix.
```

### AST

```
h item(fstype:mdsection, name:"research", content:"Research")
  p(content:"This claim needs a source[^1]. See also the extended discussion[^note].")
  p item(list:"[^1]", content:"Smith et al., 2024")
  p item(list:"[^note]", content:"The full analysis is available in the appendix.")
```

**Key points:**

- Footnote references (`[^1]`) stay inline in content strings
- Footnote definitions become p item nodes with footnote-style item.list
- Visible, editable, deletable — same as any other p item
- item.list format: `"[^1]"`, `"[^note]"` etc.

## Fixture 22: Non-embed link reference

### Markdown

```markdown
## See Also

- [[related-project]]
- [[other-doc|See this doc]]
```

### AST

```
h item(fstype:mdsection, name:"see-also", content:"See Also")
  p item(list:"-")
    embed(embed_of:"related-project")                ← reference, not transclusion
  p item(list:"-")
    embed(embed_of:"other-doc", name:"See this doc")
```

**Key points:**

- `[[ref]]` as standalone block → embed node
- `[[ref]]` inline in text → stays in content string, indexed in links table
- References display as clickable reference cards, don't transclude content

## Fixture 23: Frontmatter

### Markdown

```markdown
---
tags: [project, active]
priority: 2
due: 2026-03-01
---

# Sprint Plan

Tasks for this sprint.
```

### AST

```
h item(fstype:mdfile, name:"sprint-plan", content:"Sprint Plan", data:{tags:["project","active"], priority:2, due:"2026-03-01"})
  p(content:"Tasks for this sprint.")
```

**Key points:**

- Frontmatter is NOT a node — it's parsed into the `data` JSON field on the file's h item
- Round-trip: `data` is serialized back to YAML frontmatter on write
- Frontmatter fields can be queried (`priority:2`, `tags:active`)

## Fixture 24: Math blocks

### Markdown

```markdown
## Derivation

The integral is:

$$
\int_0^1 f(x) \, dx = F(1) - F(0)
$$

And inline math like $E = mc^2$ stays in text.
```

### AST

```
h item(fstype:mdsection, name:"derivation", content:"Derivation")
  p(content:"The integral is:")
  math(content:"\\int_0^1 f(x) \\, dx = F(1) - F(0)")
  p(content:"And inline math like $E = mc^2$ stays in text.")
```

**Key points:**

- `$$...$$` block math → `math` node (distinct from `code`)
- Inline math (`$...$`) stays in content strings (block-level AST only)
- Content is raw LaTeX without the `$$` delimiters

## Fixture 25: Callout / Admonition

### Markdown

```markdown
## Setup

> [!WARNING] Requires admin access
> This operation modifies system files.
> Make sure you have a backup.

Follow the steps below.
```

### AST

```
h item(fstype:mdsection, name:"setup", content:"Setup")
  quote(data:{callout_type:"WARNING", callout_title:"Requires admin access"})
    p(content:"This operation modifies system files.\nMake sure you have a backup.")
  p(content:"Follow the steps below.")
```

**Key points:**

- Callouts are `quote` nodes — syntactically they ARE blockquotes
- `data.callout_type` stores the type (NOTE, WARNING, TIP, etc.)
- `data.callout_title` stores the optional title text after the type
- Rendering can style based on callout_type (icons, colors)
- Regular blockquotes have no `data.callout_type`

## Fixture 26: Nested blockquote

### Markdown

```markdown
## Discussion

> Alice said:
>
> > Bob originally wrote:
> >
> > This is the original proposal.
>
> I agree with this approach.
```

### AST

```
h item(fstype:mdsection, name:"discussion", content:"Discussion")
  quote
    p(content:"Alice said:")
    quote
      p(content:"Bob originally wrote:")
      p(content:"This is the original proposal.")
    p(content:"I agree with this approach.")
```

**Key points:**

- Nested blockquotes are `quote` containing `quote` — recursive
- Each quote level is a separate node (not tracked by depth number)
- Content after inner quote returns to outer quote's children

## Fixture 27: List inside blockquote

### Markdown

```markdown
## Requirements

> The system must:
>
> - Handle 1000 requests/sec
> - Support graceful degradation
>   - Fallback to cache
>   - Show stale data indicator
> - [ ] Implement rate limiting
```

### AST

```
h item(fstype:mdsection, name:"requirements", content:"Requirements")
  quote
    p(content:"The system must:")
    p item(list:"-", content:"Handle 1000 requests/sec")
    p item(list:"-", content:"Support graceful degradation")
      p item(list:"-", content:"Fallback to cache")
      p item(list:"-", content:"Show stale data indicator")
    p item(list:"-", task:{marker:"[ ]",status:"todo"}, content:"Implement rate limiting")
```

**Key points:**

- Lists inside blockquotes work — `p item` can appear in `quote` children
- Nested lists inside blockquotes also work (p item within p item within quote)
- Task items in blockquotes preserve their markers
- Heading inside a blockquote stays as `h` block (not a new `h item`)

## Fixture 28: Multi-paragraph list item

### Markdown

```markdown
## Notes

- First point with a long explanation.

  This continues the first point with a second paragraph.

  ```python
  print("still part of first item")
  ```

- Second point.
```

### AST

```
h item(fstype:mdsection, name:"notes", content:"Notes")
  p item(list:"-", content:"First point with a long explanation.")
    p(content:"This continues the first point with a second paragraph.")
    code(content:"print(\"still part of first item\")", data:{lang:"python"})
  p item(list:"-", content:"Second point.")
```

**Key points:**

- Multi-paragraph list items have multiple `p` children of the `p item`
- Code blocks, quotes, etc. can also appear inside a list item
- Indented continuation (4 spaces or 1 tab) signals same list item
