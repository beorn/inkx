---
aliases:
  - km-cli.bd-update-collapse-design
  - km-cli-bd-update-collapse-design
created_at: 2026-05-06T17:12:25.034Z
closed_at: 2026-05-06T17:28:25.743Z
closeReason: Closing as invalid under the on-ramp reframe. Audit doc recommended
  porting --type/--description/--notes to km set, but km doesn't have a
  description/notes/type concept in its general-purpose surface yet — and
  there's no need to artificially introduce them. bd-update stays bd-shaped (its
  compound-mutator semantics ARE the bd UX). --claim is already lifted to task
  claim. Until km grows description/notes/type as first-class concepts (separate
  design question), nothing to port.
---

# [x] bd-update legacy collapse design review. bd-update.ts (235 LOC) is the largest legacy holdout in bd*.ts. Its --description/--notes/--parent semantics differ from km set: --parent triggers filesystem relocation (sibling-tree rewrite), --description/--notes mutate child paragraphs (not single-field set), --priority rewrites the H1 hashtag. Need design review on whether to lift these into km set as task-domain extensions, or keep bd-update as a bd-specific compound mutator. #P3

