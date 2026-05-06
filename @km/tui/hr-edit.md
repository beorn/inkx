---
mentions:
  - km
  - claude
id: "@km/tui/hr-edit"
aliases:
  - km-tui.hr-edit
  - km-tui-hr-edit
created_by: claude:a5c7f7de
created_at: 2026-02-15T09:18:47Z
closed_at: 2026-02-16T11:54:02Z
owner: bjorn@stabell.org
assignee: claude:a5c7f7de
---

# [x] Editing HR stops keyboard input; HR not converted to editable '---' card @km/tui #bug #P2 @claude:a5c7f7de

HR nodes: editable, preserve raw content, display centered, type conversion on save.

**Parser preserves raw content**: ast2nodes.ts stores raw thematic break text (---, ***, ___, etc.) in node.content.

**Serializer uses stored content**: nodes2md.ts outputs node.content ?? '---' for HR nodes (roundtrip fidelity).

**Display (not editing)**: HR content centered with SPACES (no decorative dash line). Just the text content padded with spaces. Yellow when selected, dimmed otherwise. Height: 1 row, no border.

**Display (editing)**: Normal bordered card with cyan border (focus ring), inline edit field pre-filled with stored content.

**Type conversion (→ hr)**: On save, if trimmed content matches valid HR pattern and node type is p/li, convert type to hr.

**Type conversion (→ p)**: On save, if content no longer matches HR pattern and node type is hr, convert type to p.

**Valid HR patterns**: At minimum: ---, ***, ___ (3+ of same char). Shared regex.

