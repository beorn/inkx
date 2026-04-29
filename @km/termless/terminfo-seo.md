---
id: "@km/termless/terminfo-seo"
aliases:
  - km-termless.terminfo-seo
  - km-termless-terminfo-seo
created_by: claude:4929065a
created_at: 2026-03-24T05:06:54Z
closed_at: 2026-03-24T05:19:39Z
close_reason: "Done: dynamic routes for terminals (/terminal/ghostty), features
  (/sgr/sgr-bold), categories (/sgr), tags (/ecma-48). Sidebar + nav dropdowns.
  Sitemap. features.json with tags + groups."
owner: bjorn@stabell.org
assignee: claude:4929065a
---

# [x] Terminfo.dev SEO: per-feature pages, per-backend pages, sitemap @km/termless #feature #P2 @claude:4929065a

Generate individual pages for maximum SEO value:

1. Per-feature pages: /feature/sgr-bold, /feature/kitty-graphics, etc.
   - What the feature is, spec reference link
   - Which terminals support it (matrix row as a standalone page)
   - SEO slug derived from feature ID

2. Per-backend pages: /backend/ghostty, /backend/xterm-js, etc.
   - Backend description, upstream link, version
   - All features with support status
   - Score/percentage

3. Per-category pages: /category/sgr, /category/cursor, etc.
   - All features in the category with full matrix
   - Category description

4. Sitemap.xml for search engines

5. Home page feature list links to per-feature pages

Data: features.json (names, URLs), backends.json (metadata), census results (support data)