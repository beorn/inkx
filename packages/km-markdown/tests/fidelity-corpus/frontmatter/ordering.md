---
id: 01HVQZ3MZYX0RNK8QKM7B1F4TD
title: Frontmatter key ordering
created: 2026-01-14T09:32:18+00:00
updated: 2026-04-02T14:10:00+00:00
tags:
  - fixture
  - frontmatter
aliases:
  - Frontmatter Order
  - FM Order
priority: P2
type: note
---

# Frontmatter key ordering

The keys here are in a deliberate order (id first, then title, then dates,
then arrays). The parser stores them in `data` or similar; the serializer
must emit them in a stable order — ideally the same order they came in.

If ordering can't be preserved, this fixture lives in `known-drift.ts`.
