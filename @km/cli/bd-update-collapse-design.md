---
aliases:
  - km-cli.bd-update-collapse-design
  - km-cli-bd-update-collapse-design
created_at: 2026-05-06T17:12:25.034Z
---

# bd-update legacy collapse design review. bd-update.ts (235 LOC) is the largest legacy holdout in bd*.ts. Its --description/--notes/--parent semantics differ from km set: --parent triggers filesystem relocation (sibling-tree rewrite), --description/--notes mutate child paragraphs (not single-field set), --priority rewrites the H1 hashtag. Need design review on whether to lift these into km set as task-domain extensions, or keep bd-update as a bd-specific compound mutator. #P3
