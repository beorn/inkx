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
oi(fstype:mdfile, name:"my-project")
  h(content:"My Project")                    ← blocks[0] = title
  p(content:"This is the introduction paragraph.")
  p(content:"Here is another paragraph.")
```

**Key points:**

- H1 becomes blocks[0] with type "h" — it IS the title
- Paragraphs are blocks[1..n]
- name derived from filename (not shown in markdown)
- No subitems (no sub-headings)
- Title resolution: blocks[0].content → name → id

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
oi(fstype:mdfile, name:"todo-board")
  h(content:"Todo Board")                    ← blocks[0] = title
  p(content:"Some intro text.")              ← blocks[1]
  oi(fstype:mdsection, name:"backlog")       ← subitems[0]
    h(content:"Backlog")
    p(content:"Write docs for the API.")
  oi(fstype:mdsection, name:"in-progress")   ← subitems[1]
    h(content:"In Progress")
    oi(fstype:mdsection, name:"auth-module")
      h(content:"Auth module")
      p(content:"Almost done.")
    oi(fstype:mdsection, name:"payment-integration")
      h(content:"Payment integration")
      p(content:"Blocked on Stripe.")
```

**Key points:**

- Heading level is implicit from depth (H1=depth 0, H2=depth 1, H3=depth 2)
- Each section's heading text is blocks[0]
- "In Progress" has no blocks other than its heading — its children are subitems
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
oi(fstype:mdsection, name:"shopping")
  h(content:"Shopping")
  li(list_marker:"-")                        ← blocks[1]
    p(content:"Apples")                        ← li.blocks[0]
  li(list_marker:"-")                        ← blocks[2]
    p(content:"Bananas")
    li(list_marker:"-")                        ← nested li (subitem of parent li)
      p(content:"Green ones")
    li(list_marker:"-")
      p(content:"Ripe ones")
  li(list_marker:"-")                        ← blocks[3]
    p(content:"Milk")
  li(list_marker:"1.")                       ← blocks[4] — new list (different marker)
    p(content:"Wake up")
  li(list_marker:"2.")
    p(content:"Brush teeth")
  li(list_marker:"3.")
    p(content:"Make coffee")
```

**Key points:**

- li has .blocks[] not .content — the text is in blocks[0] (a p block)
- Nested list items are subitems of the parent li
- list_marker preserves original style ("-" vs "1.")
- Ordered numbering stored as-is in list_marker
- Consecutive lis with compatible list_markers serialize back to one markdown list

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
oi(fstype:mdsection, name:"sprint-3")
  h(content:"Sprint 3")
  li(list_marker:"-", task_marker:"[x]")
    p(content:"Deploy staging")
  li(list_marker:"-", task_marker:"[ ]")
    p(content:"Write migration")
  li(list_marker:"-", task_marker:"[/]")
    p(content:"Code review")
  li(list_marker:"-", task_marker:"[!]")
    p(content:"Waiting on design")
  oi(fstype:mdsection, name:"auth-overhaul", task_marker:"[x]")
    h(content:"Auth overhaul")
    p(content:"Completed last week.")
```

**Key points:**

- task_marker is the checkbox including brackets: "[x]", "[ ]", "[/]", "[!]", "[-]"
- task_status is derived: "[x]"→done, "[ ]"→todo, "[/]"→wip, "[!]"→blocked, "[-]"→dropped
- list_marker ("-") and task_marker ("[x]") are independent — both are "markers"
- The checkbox is NOT part of the content string — it's extracted to task_marker
- Section headings with `[x]` prefix → oi with task_marker

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
oi(fstype:mdsection, name:"setup")
  h(content:"Setup")
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

## Fixture 6: Embeds (link nodes)

### Markdown

```markdown
## Dashboard

![[weekly-report]]

Some commentary on the report.

![[monthly-metrics|Q4 Metrics]]
```

### AST

```
oi(fstype:mdsection, name:"dashboard")
  h(content:"Dashboard")
  link(link_to:"weekly-report", embed:true)  ← blocks[1]
  p(content:"Some commentary on the report.")
  link(link_to:"monthly-metrics", embed:true)
    p(content:"Q4 Metrics")                    ← alias as blocks[0]
```

**Key points:**

- Embeds are `link` nodes with `embed:true`
- No alias → link has no blocks, display falls back to target's title
- With alias → alias text is a block (blocks[0]) of the link node
- `[[references]]` (without !) stay inline in content strings, not nodes

## Fixture 7: Embed as section title

### Markdown

```markdown
## ![[project-overview]]

The project is going well.
```

### AST

```
oi(fstype:mdsection, name:"project-overview")
  link(link_to:"project-overview", embed:true) ← blocks[0] = title
  p(content:"The project is going well.")
```

**Key points:**

- A link node can be blocks[0] (the title position)
- name derived from embed target
- View layer shows target's title (or alias if link has blocks)

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
oi(fstype:folder, name:"projects")
  oi(fstype:mdfile, name:"projects")         ← index file (collapsible with folder)
    h(content:"Projects")
  oi(fstype:folder, name:"alpha")
    oi(fstype:mdfile, name:"alpha")
      h(content:"Project Alpha")
    oi(fstype:mdfile, name:"notes")
      h(content:"Notes")
  oi(fstype:folder, name:"beta")
    oi(fstype:mdfile, name:"beta")
      h(content:"Project Beta")
      oi(fstype:mdsection, name:"...")
        ...
```

**Key points:**

- Folders have no blocks by default (name only)
- Folders can have an index file (same-name .md, README.md, or .md) providing body content and metadata
- View layer collapses folder + index file into one display node
- Files have H1 as blocks[0]
- Only oi inside oi

## Fixture 9: ListItem with blocks (rich list items)

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
oi(fstype:mdsection, name:"api-endpoints")
  h(content:"API Endpoints")
  li(list_marker:"-")
    p(content:"**GET /users**")              ← li.blocks[0] (item text)
    p(content:"Returns all users. Supports pagination.")
    code(content:"{\"users\": [...], \"total\": 42}", data:{lang:"json"})
  li(list_marker:"-")
    p(content:"**POST /users**")
    p(content:"Creates a new user.")
```

**Key points:**

- li has multiple blocks (same as oi)
- blocks[0] is the "title" of the list item (rendered inline, not as heading)
- Rich content (code blocks, multiple paragraphs) under a list item

## Fixture 10: Mixed content (li inside oi body alongside blocks)

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
oi(fstype:mdsection, name:"notes")
  h(content:"Notes")                         ← blocks[0]
  p(content:"Remember to check the logs.")   ← blocks[1]
  li(list_marker:"-")                        ← blocks[2] (li is a block in oi context)
    p(content:"First finding")
  li(list_marker:"-")                        ← blocks[3]
    p(content:"Second finding")
  p(content:"Also review the dashboard.")    ← blocks[4]
  oi(fstype:mdsection, name:"analysis")      ← subitems[0]
    h(content:"Analysis")
    p(content:"Deep dive results here.")
```

**Key points:**

- li appears among p blocks — it's a block in oi context
- Blocks come before subitems in parent_idx
- The paragraph after the list is still a block, before the subitem section

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
oi(fstype:mdsection, name:"project")
  h(content:"Project")
  p(content:"Some intro.")
  oi(fstype:mdsection, name:"phase-1")
    h(content:"Phase 1")
    p(content:"Done.")
    p(content:"More text here about the project.")  ← part of Phase 1 (before next heading)
  oi(fstype:mdsection, name:"phase-2")
    h(content:"Phase 2")
    p(content:"In progress.")
```

**Key points:**

- In markdown, content after `### Phase 1` and before `### Phase 2` belongs to Phase 1
- There's no way to "close" a section in markdown — content goes to the preceding heading
- This is NOT "content after subitems" — it's normal section body content
- The blocks-before-subitems rule applies to parent's children, not within sibling boundaries

## Fixture 12: Skipped heading levels

### Markdown

```markdown
# Deep Doc

### Jumped to H3
```

### AST

```
oi(fstype:mdfile, name:"deep-doc")
  h(content:"Deep Doc")
  oi(fstype:mdsection, name:"(synthetic)")   ← inserted for missing H2 level
    oi(fstype:mdsection, name:"jumped-to-h3")
      h(content:"Jumped to H3")
```

**Key points:**

- H1 → H3 (skipping H2) inserts a synthetic oi at the missing level
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
oi(fstype:mdsection, name:"status")
  h(content:"Status")
  table(content:"| Feature | Status |\n|---------|--------|\n| Auth    | Done   |\n| Search  | WIP    |")
  hr()
  p(content:"Legacy notes below.")
```

**Key points:**

- `---` in body = hr block. `---` at file start = YAML frontmatter (parsed into oi.data)
- table content preserves raw markdown format

## Fixture 14: Section without heading (name-only)

An outline item with no heading block, just a name (auto-generated or imported):

### AST

```
oi(fstype:mdsection, name:"untitled-section")
  p(content:"Some content here.")
  p(content:"More content.")
```

**Key points:**

- No blocks[0] of type "h" — no heading
- Title resolution: blocks[0].content ("Some content here.") → name → id
- View-mode dependent display:
  - Outliner: shows name or blocks[0].content
  - Doc view: shows blocks[0] as regular text (no heading style)
- If no blocks AND no name: shows id (distinctly styled)

## Fixture 15: Empty file (H1 only)

### Markdown

```markdown
# New Document
```

### AST

```
oi(fstype:mdfile, name:"new-document")
  h(content:"New Document")
```

**Key points:**

- Minimal valid file: just H1
- One and only one H1 required for files

## Fixture 16: Repo root

### AST

```
oi(fstype:repo, name:"my-vault")
  oi(fstype:folder, name:"projects")
    oi(fstype:mdfile, name:"readme")
      h(content:"README")
  oi(fstype:mdfile, name:"index")
    h(content:"Welcome")
```

**Key points:**

- repo is the top-level fstype, always exactly one
- repo has no blocks (name only)
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
oi(fstype:mdsection, name:"references")
  h(content:"References")
  li(list_marker:"-")
    link(link_to:"design-doc", embed:true)   ← li.blocks[0]
  li(list_marker:"-")
    link(link_to:"api-spec", embed:true)
      p(content:"API Specification")           ← alias as blocks[0] of link
  li(list_marker:"-")
    p(content:"Regular item")
```

**Key points:**

- link node can be blocks[0] of a li (same as oi)
- Display uses alias (link's blocks[0]) or target's title
- The link node itself lives inside the li's blocks

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
oi(fstype:mdsection, name:"architecture")
  h(content:"Architecture")
  li(list_marker:"-")                        ← "Frontend"
    p(content:"Frontend")
    li(list_marker:"-")                      ← nested: "React components"
      p(content:"React components")
      p(content:"Each component has its own directory.")
      code(content:"export function App() { ... }", data:{lang:"tsx"})
    li(list_marker:"-")                      ← nested: "State management"
      p(content:"State management")
      li(list_marker:"-")                    ← doubly nested
        p(content:"Redux store")
      li(list_marker:"-")
        p(content:"Local state")
  li(list_marker:"-")                        ← "Backend"
    p(content:"Backend")
```

**Key points:**

- li nests to arbitrary depth (li → li → li)
- Each li level follows the same split: blocks (non-li) before subitems (li)
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
oi(fstype:mdsection, name:"release-checklist")
  h(content:"Release Checklist")
  li(list_marker:"1.", task_marker:"[x]")
    p(content:"Tag release")
  li(list_marker:"2.", task_marker:"[/]")
    p(content:"Run CI pipeline")
  li(list_marker:"3.", task_marker:"[ ]")
    p(content:"Deploy to staging")
  li(list_marker:"4.", task_marker:"[ ]")
    p(content:"Smoke test")
```

**Key points:**

- Ordered lists can also be tasks
- list_marker preserves original numbering
- task_marker is independent of list_marker

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
oi(fstype:mdsection, name:"widget")
  h(content:"Widget")
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
oi(fstype:mdsection, name:"research")
  h(content:"Research")
  p(content:"This claim needs a source[^1]. See also the extended discussion[^note].")
  li(list_marker:"[^1]")
    p(content:"Smith et al., 2024")
  li(list_marker:"[^note]")
    p(content:"The full analysis is available in the appendix.")
```

**Key points:**

- Footnote references (`[^1]`) stay inline in content strings
- Footnote definitions become li nodes with footnote-style list_marker
- Visible, editable, deletable — same as any other li
- list_marker format: `"[^1]"`, `"[^note]"` etc.

## Fixture 22: Non-embed link reference

### Markdown

```markdown
## See Also

- [[related-project]]
- [[other-doc|See this doc]]
```

### AST

```
oi(fstype:mdsection, name:"see-also")
  h(content:"See Also")
  li(list_marker:"-")
    link(link_to:"related-project", embed:false)  ← reference, not transclusion
  li(list_marker:"-")
    link(link_to:"other-doc", embed:false)
      p(content:"See this doc")
```

**Key points:**

- `[[ref]]` as standalone block → link node with embed:false
- `[[ref]]` inline in text → stays in content string, indexed in links table
- embed:false = show as a clickable reference card, don't transclude content

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
oi(fstype:mdfile, name:"sprint-plan", data:{tags:["project","active"], priority:2, due:"2026-03-01"})
  h(content:"Sprint Plan")
  p(content:"Tasks for this sprint.")
```

**Key points:**

- Frontmatter is NOT a node — it's parsed into the `data` JSON field on the file's oi
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
oi(fstype:mdsection, name:"derivation")
  h(content:"Derivation")
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
oi(fstype:mdsection, name:"setup")
  h(content:"Setup")
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
oi(fstype:mdsection, name:"discussion")
  h(content:"Discussion")
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
oi(fstype:mdsection, name:"requirements")
  h(content:"Requirements")
  quote
    p(content:"The system must:")
    li(list_marker:"-")
      p(content:"Handle 1000 requests/sec")
    li(list_marker:"-")
      p(content:"Support graceful degradation")
      li(list_marker:"-")
        p(content:"Fallback to cache")
      li(list_marker:"-")
        p(content:"Show stale data indicator")
    li(list_marker:"-", task_marker:"[ ]")
      p(content:"Implement rate limiting")
```

**Key points:**

- Lists inside blockquotes work — `li` can appear in `quote` children
- Nested lists inside blockquotes also work (li within li within quote)
- Task items in blockquotes preserve their markers
- Heading inside a blockquote stays as `h` block (not a new `oi`)

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
oi(fstype:mdsection, name:"notes")
  h(content:"Notes")
  li(list_marker:"-")
    p(content:"First point with a long explanation.")
    p(content:"This continues the first point with a second paragraph.")
    code(content:"print(\"still part of first item\")", data:{lang:"python"})
  li(list_marker:"-")
    p(content:"Second point.")
```

**Key points:**

- Multi-paragraph list items have multiple `p` blocks as children of `li`
- Code blocks, quotes, etc. can also appear inside a list item
- Indented continuation (4 spaces or 1 tab) signals same list item
