---
mentions:
  - km
id: "@km/inbox/tree-1"
aliases:
  - km-tree-1
  - "@km/_orphan/tree-1"
created_at: 2026-01-20T21:42:07Z
closed_at: 2026-02-04T11:27:26Z
---

# [x] Click to follow links @km/_orphan #task #P4

## Phase 4: Click to Follow Links (~1-2 hours)

- Track link character ranges in rich.ts
- Register hit regions for each link span
- On click: `exec('open', linkUrl)`

**Challenge**: Links are inline within text. Need sub-element position tracking.

```typescript
if (target?.type === 'link') {
  exec('open', target.linkUrl);
}
```

## Files

- `rich.ts` - track link positions within rendered text
- `TreeNode.tsx` - register link hit regions (or delegate to text renderer)

## Verification

- Click on `[link](url)` opens in browser
- Non-link text still selects normally

## Risks

- Inline link detection is complex
- May start with whole-node links, defer inline

## Depends on

- @km/_orphan/mouse-2 (hit registry)

