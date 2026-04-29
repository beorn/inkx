---
id: "@km/infra/session-promote"
aliases:
  - km-infra.session-promote
  - km-infra-session-promote
created_by: Bjørn Stabell
created_at: 2026-04-12T22:35:18Z
closed_at: 2026-04-12T23:17:35Z
close_reason: Built tools/session-promote.ts (528 lines). Scan/promote/status
  commands. Extracts fact/event/instruction from recall daily summaries,
  deduplicates against gbrain, writes pages via gbrain put. State tracking in
  promote-state.json. Integrated as backlog domain check in /sop SKILL.md.
owner: bjorn@stabell.org
assignee: Bjørn Stabell
dependencies:
  - issue_id: km-infra.session-promote
    depends_on_id: km-infra.org-redesign
    type: parent-child
    created_at: 2026-04-12T15:35:41Z
    created_by: Bjørn Stabell
    metadata: "{}"
---

# [x] Session promotion pipeline — extract durable knowledge from sessions into gbrain vault @km/infra #feature #P2 @Bjørn Stabell

blocks:: [[@km/infra/org-redesign]]

Build the bridge between recall (session history) and gbrain (personal brain). Extract decisions, lessons, people, concepts from Claude Code sessions and write them as gbrain pages in compiled-truth/timeline format. Triggered by post-session hook or manual command. Deep research fired on ENGRAM-like typed memory systems (resp_0cb815112f4c46710069dc160434d481909fa64e1041a62aaf).