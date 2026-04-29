---
id: "@km/silvery/layout-churn-leaks-pixels"
aliases:
  - km-silvery.layout-churn-leaks-pixels
  - km-silvery-layout-churn-leaks-pixels
created_by: claude:019d032d
created_at: 2026-04-22T20:10:57Z
closed_at: 2026-04-25T06:47:41Z
close_reason: Unable to reproduce. Silvery agent followed pipeline mandate
  (failing test before fix); could not craft one. Live repro replay shows clean
  rendering. Likely pre-existing fix from sterling 0.20.0 work + signal refactor
  c022d937. 5 new STRICT scaffold tests landed in vendor/silvery 752bbc576 + km
  main 596e16bc7 — will fail noisily if regression returns. File a fresh bead if
  the symptom re-emerges.
---

# [x] Layout churn: silvery pipeline leaks pixels when columns reflow on staged content hydration @km/silvery #bug #P0 @claude:2405c72e

Reproduced by km agent during /explore session 2026-04-22. Trigger vault has BOTH file-boards (@next.md, @someday.md) AND folder-boards (done/, inbox/) with content. File-boards parse first (~T=500ms): columns render as @next | @someday | archive. Folder-boards hydrate later (~T=1500ms): columns reflow to archive | done | inbox. Silvery's incremental renderer leaks pixels from old layout into new — column separator dashes appear mid-card, old card chrome shows through, top borders go missing on cards 2+.

This is the SAME root cause behind:
- @km/cli/init-prompt-corrupts-tui (misdiagnosed — not a CLI bug)
- @km/tui/single-col-missing-top-borders (cards 2+ in single-column vault — same incremental-render leak class)

Repro:
mkdir -p /tmp/v/{inbox,done,next,archive,.km}
for i in 1 2 3; do echo "# t$i" > /tmp/v/inbox/t$i.md; echo "# t$i" > /tmp/v/done/t$i.md; echo "# t$i" > /tmp/v/next/t$i.md; done
touch /tmp/v/.km/changes.jsonl /tmp/v/.km/config.toml
printf '# Next\n\n## Inbox\n' > /tmp/v/@next.md
printf '# Someday\n\n## Ideas\n' > /tmp/v/@someday.md
bun km view /tmp/v   # broken
KM_EAGER_LOAD=1 bun km view --no-watch /tmp/v   # CLEAN

2x2 confirmed: lazy-hydrate AND watcher each independently produce the layout churn that the silvery pipeline mis-diffs.

Suspected location: vendor/silvery/packages/ag-term/src/pipeline/render-phase.ts — the incremental render path that produces the pixel-level diff between frames. Likely needs to invalidate prevBuffer on column-count change OR detect cross-column content shifts.

Approach: silvery agent must walk silvery-resolver, write a STRICT test reproducing the pixel leak (SILVERY_STRICT=2), then fix. Per km CLAUDE.md, never edit pipeline files without spawning the silvery agent.