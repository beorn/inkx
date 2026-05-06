---
mentions:
  - km
id: "@km/inkz/12-docs"
aliases:
  - km-inkz.12-docs
  - km-inkz-12-docs
created_at: 2026-01-19T12:02:51Z
closed_at: 2026-01-19T14:50:48Z
---

# [x] InkZ: Complete documentation for public consumption @km/inkz #task #P2

## Goal

Create comprehensive, LLM-friendly documentation for InkZ that serves developers, AI assistants, and contributors.

## Documentation Deliverables

### 1. Static Documentation Site (VitePress)

Structure:

```
docs/site/
├── .vitepress/config.ts
├── index.md
├── guide/
├── api/
├── migration/
└── examples/
```

### 2. LLM-Friendly Files (llmstxt.org Standard)

- /llms.txt - Quick overview with links to key sections
- /llms-full.txt - Complete docs concatenated for full context

### 3. API Documentation

Each component/hook documented with:

- **Purpose** - What it does in one sentence
- **Props** - Table with name, type, default, description
- **Examples** - Code + expected output

## Acceptance Criteria

- [ ] VitePress site builds and serves locally
- [ ] API reference for Box, Text, and all hooks
- [ ] 3+ runnable examples with READMEs
- [ ] llms.txt at project root
- [ ] GitHub Pages deploy config
- [ ] Dark mode and search work

