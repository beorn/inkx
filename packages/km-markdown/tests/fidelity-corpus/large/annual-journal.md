---
title: 2025 Annual Journal
id: 01HVQZ3MZYX0RNK8QKM7B1F4J5
type: journal
year: 2025
tags:
  - journal
  - annual
  - fixture
created: 2025-01-01T08:00:00+00:00
updated: 2025-12-31T22:00:00+00:00
---

# 2025 Annual Journal

This is a realistic long-form journal spanning twelve months. It exercises
headings, lists, tasks, wikilinks, block references, code fences, tables,
callouts, and Obsidian-isms. The goal is a ~50KB file that round-trips
cleanly.

## January ^jan

### Week 1

- [x] Set up the new year file structure ^task-jan-1
- [x] Review 2024 goals and archive them
- [x] Draft 2025 goals
- [ ] Share 2025 goals with [[People/Mentor]]

New year prep felt smoother than 2024. Spent the first two days just
reading through [[Notes/2024-lessons-learned]] and writing down what I
wanted to carry forward.

Read: [[Books/How to Take Smart Notes]] again. Still one of the best
books on knowledge work. The Zettelkasten ideas continue to shape how
I organize [[Projects/gbrain]].

### Week 2

Started the [[Projects/km]] rewrite. The old version had architectural
debt that was making every change painful. Key decisions this week:

1. **Layer discipline**: enforce the dependency direction with a linter.
   See [[Decisions/2025-01-08-layer-lint]].
2. **Factory functions, no classes**: matches my long-held preference
   but worth documenting as a first principle.
3. **Bun as runtime**: fast enough to make TDD feel instant. I don't
   miss Node's startup latency at all.

```typescript
// The new architecture in three types:
interface KNode {
  id: string // ULID — sortable by creation time
  type: NodeType // 'h' | 'p' | 'l' | 'code' | ...
  parent_id: string | null
  parent_idx: number
  // ... other fields, all optional
}

interface Board {
  columns: KNode[]
  cursor: string | null // ID of current node
}

interface Command {
  run(ctx: Context): void // Pure (action, state) -> [state, effects]
}
```

### Week 3

- [x] Ported the parser from the old codebase ^task-jan-3-parser
- [x] Wrote the KNode serializer ^task-jan-3-serializer
- [ ] Round-trip test corpus — see [[Beads/km-storage.markdown-fidelity-corpus]]

The round-trip test corpus is a meta note: I'm writing _this_ fixture
precisely because the corpus doesn't exist yet. Meta enough for you?

### Week 4

Meeting with [[People/Mike]] about [[Projects/decker]]. He's seeing good
traction on the collaborative editing flows; Yjs is holding up well at
~50 concurrent editors per doc. We talked about potentially sharing the
presence layer between decker and km.

Notes from the meeting:

- Yjs awareness protocol is ~2KB overhead per client
- 50 concurrent editors is fine; 500 would need sharding
- Server-side persistence uses the LevelDB plugin, fine for now
- Migration path to Postgres when needed: straightforward

## February ^feb

### Week 5

Shipped the first alpha of km. [[Decisions/2025-02-03-alpha-criteria]]
defines what "alpha" means: enough to use for daily notes and a few
project outlines. No sync, no collaboration, no mobile.

- [x] Alpha tag in git ^feat-alpha
- [x] Internal announcement on #team channel
- [x] Dogfood for 2 weeks before next milestone ^task-feb-dogfood

Dogfooding surfaced 11 bugs in the first week. Most were UI — the
Obsidian-style wikilink autocomplete wasn't triggering on `[[` inside
a code span, which is _correct_ behavior but not obvious.

### Week 6

Bugs found dogfooding:

| #   | Bug                                           | Priority | Status              |
| --- | --------------------------------------------- | -------- | ------------------- |
| 1   | Wikilink autocomplete in code                 | P3       | Won't fix (correct) |
| 2   | Drag-to-reorder loses focus                   | P2       | Fixed               |
| 3   | Escape in edit mode clears draft              | P1       | Fixed               |
| 4   | Tab key inserts literal tab                   | P2       | Fixed (indents now) |
| 5   | Markdown code fence swallows next block       | P1       | Fixed               |
| 6   | YAML frontmatter with comments crashes parser | P1       | Fixed               |
| 7   | Embedded image paths not resolved             | P2       | Fixed               |
| 8   | Double-click opens edit AND link              | P3       | Fixed               |
| 9   | Find-replace doesn't update search index      | P2       | Fixed               |
| 10  | Dark mode contrast fails WCAG on muted text   | P2       | Fixed               |
| 11  | Selection lost after paste                    | P1       | Fixed               |

### Week 7

- [x] Public announcement prep ^task-announce-prep
- [x] Landing page copy — collaborated with [[People/Alice]]
- [x] Product Hunt prep (scheduled for March 15)
- [ ] Record demo video ^task-demo-video

> [!note] Lesson about demo videos
> Don't try to record the "perfect" demo. Record 30 seconds, post, iterate.
> I spent three days on a 5-minute demo that nobody watched. A 30-second
> clip on Twitter got 10x the engagement.

### Week 8

Read [[Books/Working in Public]] by Nadia Eghbal. Insights on open-source
sustainability directly applicable to km. The "stadium model" vs
"federation model" distinction is useful — km should aim for federation
(many users, few direct contributors) rather than stadium (huge audience,
concentrated attention).

Implications:

1. Design for self-service. Good docs > community support queue.
2. Reduce surface area of contribution. Bugs easy, features gated.
3. Public roadmap so expectations are calibrated.

## March ^mar

### Week 9

Launch week! [[Events/2025-03-15-product-hunt]]. Ended up #3 on the day,
which exceeded expectations. Key metrics:

- Unique visitors: 8,400
- Sign-ups: 742
- Activated (completed onboarding): 221 (30%)
- D7 retention: 38% (reasonable for a dev tool)
- D30 retention: 18% (also reasonable)

The onboarding drop-off concentrated on step 3 (importing existing notes).
We'd assumed people would drag a folder; they wanted file-by-file control.
Fixed in [[Decisions/2025-03-22-import-flow]].

```typescript
// New import flow supports both paths
export function importFromVault(vault: VaultSource): AsyncIterable<ImportResult> {
  if (vault.kind === "folder") {
    return importFolder(vault.path) // bulk
  } else {
    return importFiles(vault.files) // file-by-file
  }
}
```

### Week 10

Post-launch firefighting. Two P1 bugs landed within 48 hours:

1. **Sync conflict loss on simultaneous edit** — the last-write-wins
   strategy was documented but obviously wrong. Fixed with a proper
   CRDT-backed merge. See [[Incidents/2025-03-17-sync-loss]].
2. **Onboarding fails for vaults with ^blockid syntax** — we crashed on
   parsing block IDs that contained dashes. Test coverage gap. Fixed.

### Week 11

- [x] Write post-launch retrospective ^task-launch-retro
- [x] Prioritize bug backlog (26 open bugs after launch)
- [x] Ship 2 weekly patch releases ^task-patches
- [ ] Start on collaborative editing feature

Retrospective notes (full doc at [[Retrospectives/2025-03-launch]]):

- Underestimated onboarding friction
- Overestimated users' tolerance for rough edges in week 1
- CDN pre-warm for the docs site saved us during the traffic spike
- Twitter engagement exceeded Product Hunt for long-term conversions

### Week 12

Start of collaborative editing. Decision: use Yjs, same as decker. The
CRDT guarantees are strong, the library is mature, and I already know
the ecosystem from the decker work.

Architecture sketch:

```
Client A                           Client B
   |                                  |
   |---- Y.Doc --[sync protocol]--- Y.Doc ----|
   |                                  |
   v                                  v
  UI                                 UI

Server
   |
   v
 Y.Doc persistence (LevelDB → Postgres later)
```

Open questions:

- [ ] How do we map KNode tree to Y.Map hierarchy?
- [ ] Conflict resolution for task marker changes?
- [ ] Presence / awareness indicator design?

## April ^apr

### Week 13

Spent most of the week on the KNode → Yjs mapping. The tricky part:
KNode has ordered children via `parent_idx`, but Y.Array ordering is
naturally resolved via fractional indexing. After reading [[Papers/FIG]],
I'm convinced fractional indexing is the right approach — we'll derive
the integer `parent_idx` for storage from the fractional index at
sync time.

- [x] POC of Y.Map + Y.Array for node tree ^task-yjs-poc
- [x] Benchmark 10k-node document sync
- [ ] Document the data model — see [[Design/Sync-Data-Model]]

### Week 14

Benchmark results from last week. 10k nodes, two clients, 100 concurrent
edits:

| Metric                | Value |
| --------------------- | ----- |
| Initial sync (cold)   | 340ms |
| Edit propagation p50  | 18ms  |
| Edit propagation p99  | 95ms  |
| Memory per client     | 47MB  |
| Persistence write p50 | 4ms   |

> [!warning] Caveat
> Benchmark was on local network. WAN adds 50-200ms RTT, which will
> dominate edit propagation. Need to re-benchmark on realistic latency
> before publishing numbers.

### Week 15

- [x] Re-benchmark with simulated WAN latency ^task-wan-bench
- [x] Draft the sync data model doc ^task-sync-doc
- [x] Review design with [[People/Mike]] and [[People/Alice]]
- [ ] Begin implementing sync in km

WAN results:

| Metric               | LAN   | WAN (100ms RTT) |
| -------------------- | ----- | --------------- |
| Initial sync         | 340ms | 680ms           |
| Edit propagation p50 | 18ms  | 118ms           |
| Edit propagation p99 | 95ms  | 420ms           |

Acceptable. The p99 is high but users perceive it as "fast enough" in
the presence of presence indicators (seeing other cursors move smooths
over the latency).

### Week 16

End of April — tracking against Q2 goals:

- [x] Ship sync alpha (dogfood)
- [ ] Ship sync beta (invite-only)
- [ ] Build admin panel for workspace management

Off track for beta. Root cause: sync alpha surfaced bugs in the
presence layer that need architectural rework. Not slipping the date,
rescoping the feature.

## May ^may

### Week 17

Sync alpha shipped internally. First week of dogfooding with 3 users.
Findings:

1. **Cursor "teleport" on reconnect** — when a user reconnects after a
   drop, their cursor appears at last-known position, then jumps.
   Visually jarring. Fix: fade in at correct position, skip the teleport.
2. **Presence cursor for idle users** — currently we show cursor
   indefinitely. Should timeout after 2min idle. Fix planned.
3. **Offline edits not synced on reconnect** — this was a bug, the
   offline queue wasn't being drained. Fixed.

### Week 18

- [x] Cursor fade-in on reconnect ^task-cursor-fade
- [x] Idle cursor timeout (2 min) ^task-cursor-idle
- [x] Offline queue drain fix ^task-offline-drain
- [x] Ship sync alpha v2

### Week 19

Published the [[Design/Sync-Data-Model]] doc. Early feedback from Mike
and Alice was positive. Alice suggested a clarification on the "trailing
delete" edge case — added.

Read: [[Books/The Design of Everyday Things]] for the first time. Late
to the party. Mental models and affordances — now I see them everywhere.

Applied to km:

- The "click to edit" affordance should be more discoverable. Added a
  hover hint.
- The `Escape` key's discard-vs-save behavior was ambiguous. Added a
  discard confirmation if there are unsaved changes >5 chars.

### Week 20

- [x] Sync beta invite list (20 users) ^task-beta-invites
- [x] Beta onboarding flow ^task-beta-onboard
- [x] Monitoring dashboard for sync traffic
- [ ] Beta announcement draft

## June ^jun

### Week 21

Beta launched. Bugs found in the first 72 hours:

1. **Cross-device sync stalls** — if you edit on mobile, desktop doesn't
   see updates until you manually reconnect. Root cause: background
   sync was disabled in the alpha. Fixed.
2. **Large-document stall** — opening a 5000-node doc caused 2s freeze.
   Fix: incremental render.
3. **Paste of rich content from Notion strips formatting** — expected
   behavior, but users complained. Deferred fix — this is a Notion
   clipboard format issue, not a km issue.

### Week 22

- [x] Background sync fix ^task-bg-sync
- [x] Incremental render for large docs ^task-incr-render
- [x] Document the Notion paste limitation ^task-notion-paste-docs

Mid-year check-in with [[People/Mentor]]. Reviewed H1 progress. Ahead
on engineering milestones, behind on marketing/community engagement.
Plan for H2: ship a weekly newsletter, write one deep-dive post per
month.

### Week 23

Started the weekly newsletter. First issue: "Why km uses factory
functions, not classes." Went live Wednesday, 340 reads in 24h.

Follow-up topics lined up:

- [ ] Why we chose Yjs for sync
- [ ] How the reconciliation job works
- [ ] What Obsidian gets right (and what we'd change)
- [ ] Building a TUI in 2025: Silvery rationale

### Week 24

End of H1 retro. Full doc at [[Retrospectives/2025-H1]]. Highlights:

- Shipped alpha, beta, sync, admin panel, docs site
- 742 sign-ups from Product Hunt; 2100 more from organic channels
- 4 P1 incidents, 18 P2, acceptable for year-one product
- Team grew from 1 to 3 (Alice joined in March, Mike contract in May)

## July ^jul

### Week 25

Summer break planning. Taking two weeks off in early August. Before then:

- [x] Stabilize beta for no-owner periods ^task-stabilize
- [x] Write runbooks for Alice and Mike ^task-runbooks
- [x] Pre-schedule newsletter issues

### Week 26

Shipped GA! ~~beta~~ moved to production. Invited the full waiting list
(~2200 users). Metrics after week 1:

| Metric            | Value             |
| ----------------- | ----------------- |
| Active users (D7) | 1,341             |
| Documents created | 18,927            |
| Sync sessions     | 142,000           |
| p99 sync latency  | 384ms             |
| Support tickets   | 87 (most docs Qs) |

### Week 27

Bug triage week. 87 tickets → closed 61, escalated 14 to engineering,
deferred 12 to post-break.

- [x] Close P3/P4 tickets ^task-triage-close
- [x] Escalate P1/P2 ^task-triage-esc
- [x] Write "known issues" doc for support team

### Week 28

- [x] Final pre-break checks
- [x] Status page set to "monitoring only"
- [x] Newsletter scheduled for 3 weeks

Hiking in the Dolomites for two weeks. Not reading email. Alice and Mike
have the keys.

## August ^aug

### Week 29-30

Away.

### Week 31

Back from break. Status:

- Zero P1 incidents during the break. Well done team.
- 3 P2 incidents, all handled well.
- Sign-ups up 11% vs July (organic growth).
- Inbox: 400+ messages. Triage planned for next 3 days.

### Week 32

- [x] Inbox triage ^task-inbox-triage
- [x] Catch up on team standups ^task-catchup
- [ ] Plan Q4

## September ^sep

### Week 33

Q4 planning. Three epics shortlisted:

1. **Public API** — users have asked for automation hooks. Scope: REST
   API for CRUD on documents + webhook for document events.
2. **Mobile app** — iOS + Android. Scope: read-only for v1, edit in v2.
3. **Plugin system** — allow user-written extensions. Scope: sandboxed
   TypeScript plugins, CLI-only initially.

Picked #1 and #2 for Q4. #3 deferred to Q1 2026 — too ambitious for
the quarter.

### Week 34

- [x] Public API design doc ^task-api-design
- [x] Review with team ^task-api-review
- [ ] Start implementation

Design doc at [[Design/Public-API]]. Key decisions:

- REST, not GraphQL. Simpler for the initial audience (scripters).
- API tokens via personal access tokens (PATs). No OAuth flow yet.
- Rate limits: 1000 requests/hour per token.
- Pagination: cursor-based, not offset.

### Week 35

- [x] Scaffold API server ^task-api-scaffold
- [x] Implement GET /documents ^task-api-get-docs
- [x] Implement POST /documents ^task-api-post-docs
- [ ] Implement PATCH and DELETE

### Week 36

API progress continues. Mobile app work started in parallel — Alice
is owning iOS, Mike is owning Android. First milestone: read-only
document viewer.

## October ^oct

### Week 37

- [x] Complete CRUD endpoints ^task-api-crud
- [x] Webhook dispatcher ^task-api-webhooks
- [x] API docs (Markdown + OpenAPI)
- [ ] Beta test with 10 external developers

### Week 38

API beta. 10 developers invited. Feedback:

1. "Rate limits too low for sync use cases" — raised to 5000/hour for
   PATs; will revisit pricing tiers later.
2. "Want GraphQL" — deferred, but noted the consistent feedback.
3. "Webhook retries don't have jitter" — fixed (exponential backoff
   with jitter added).

### Week 39

Hallowe'en week. Shipped the mobile apps in TestFlight / internal beta.
Read-only for v1. Demo video here: [[Media/Mobile-V1-Demo]].

- [x] iOS TestFlight submission ^task-ios-tf
- [x] Android internal test submission ^task-and-int
- [x] Landing page mobile section ^task-landing-mobile

### Week 40

Mobile beta feedback from 50 testers:

| Issue                             | Count | Priority |
| --------------------------------- | ----- | -------- |
| Offline sync weirdness            | 12    | P1       |
| Pinch-zoom doesn't work in editor | 8     | P2       |
| Dark mode contrast                | 6     | P2       |
| Font rendering on Android         | 4     | P2       |
| Misc UI polish                    | 20    | P3       |

## November ^nov

### Week 41

Thanksgiving week (US) was quieter for community. Focused on mobile
P1 fix: offline sync.

- [x] Diagnose offline sync bug ^task-offline-diag
- [x] Fix the offline queue on mobile ^task-offline-fix
- [x] Ship mobile beta v2 ^task-mobile-v2
- [ ] Public mobile launch

### Week 42

- [x] Polish mobile UI (pinch-zoom, fonts) ^task-mobile-polish
- [x] Dark mode contrast audit ^task-mobile-dark
- [x] Landing page refresh for mobile launch ^task-landing-refresh

### Week 43

Mobile public launch! iOS App Store approval took 8 days (longer than
expected because of the sync background mode entitlement). Android
released simultaneously.

Launch metrics (day 1):

- App Store featured: yes (promoted in Productivity)
- iOS downloads: 1,840
- Android downloads: 620
- Crash-free rate: 99.4% (iOS), 98.9% (Android)
- Avg session: 4.2 min (acceptable for a read-focused v1)

### Week 44

- [x] Fix the 1 crash pattern discovered post-launch ^task-crash-fix
- [x] Respond to App Store reviews
- [x] Plan v2 (edit support)

## December ^dec

### Week 45

Planning for 2026. Candidate epics:

- [ ] Mobile v2: full edit support
- [ ] Plugin system (carried from Q3 deferred)
- [ ] Enterprise features (SSO, audit logs, role-based access)
- [ ] Offline-first desktop mode (no server required for personal use)

Ranked by impact × effort. Mobile v2 wins on both; plugins has highest
long-term potential but biggest research unknowns.

### Week 46

- [x] 2026 OKRs draft ^task-okr-draft
- [x] Team review of OKRs ^task-okr-review
- [x] Budget approval for hire #4 ^task-budget
- [ ] Interview candidates in January

### Week 47

- [x] Holiday release freeze ^task-freeze
- [x] Monitoring set for minimal on-call ^task-oncall
- [x] Team thank-you notes

### Week 48

Year-end reflection. Read through my January goals and scored against
what actually happened:

| Goal                          | Target | Actual | Notes      |
| ----------------------------- | ------ | ------ | ---------- |
| Ship km v1                    | Q1     | March  | On time    |
| 1000 active users             | EoY    | 8000+  | Exceeded   |
| Newsletter with 500 subs      | EoY    | 2,100  | Exceeded   |
| One deep-dive post/month      | EoY    | 11/12  | Missed one |
| Launch mobile                 | Q4     | Nov    | On time    |
| Hire 2 engineers              | EoY    | 2      | On time    |
| Public API                    | Q4     | Q4     | On time    |
| Plugin system                 | Q3     | N/A    | Deferred   |
| Personal: 50 books            | 50     | 42     | Missed     |
| Personal: 3 countries visited | 3      | 5      | Exceeded   |

### Week 49

Closing notes. 2025 was the year km went from sketch to real product.
Themes that worked:

1. **Small batches, frequent releases.** Every Friday, a release.
2. **Reconciliation-first migrations.** Caught bugs before customers.
3. **Dogfooding before dogfooding.** Internal use for a week minimum
   before any feature goes to alpha.
4. **Incident retros within 48h.** Faster learning, less cumulative
   cost.

Themes that didn't:

1. **Daily standups.** Too interruptive for async-first engineering.
2. **Tight-coupling of mobile and desktop feature parity.** We wasted
   two sprints on parity we didn't need.
3. **Over-investment in the demo video.** See the February note.

On to 2026. See [[Planning/2026]].

<!-- This file is ~50KB and exercises most markdown features we care about. -->
