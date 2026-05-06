---
mentions:
  - km
  - claude
id: "@km/silvery/loggily-migration"
aliases:
  - km-silvery.loggily-migration
  - km-silvery-loggily-migration
created_by: claude:fed8de9e
created_at: 2026-03-29T07:05:37Z
closed_at: 2026-03-30T20:01:09Z
close_reason: 22 console.warn/error calls migrated to loggily across 8
  namespaces (silvery:keys, reconciler, render, pipeline, output, content,
  devtools, app). All warnings now suppressible via DEBUG env.
owner: bjorn@stabell.org
assignee: claude:db326126
---

# [x] Migrate console.warn/error to loggily in silvery @km/silvery #task #P1 @claude:db326126

Several silvery packages use console.warn/error for runtime warnings (Box-in-Text, shifted punct, pipeline, renderer). Migrate to loggily with namespaced loggers (silvery:keys, silvery:reconciler, silvery:pipeline, silvery:render) so they are suppressible via DEBUG env. Exception: content output (CLI, storybook, STRICT diagnostics) stays as console.

