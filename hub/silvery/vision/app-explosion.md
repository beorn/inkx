# The App Explosion

_What happens when you strip apps down to pure business logic and let the framework handle everything else?_

## The Insight

Most apps are 80% plumbing and 20% domain logic. The plumbing — UI rendering, state management, persistence, undo/redo, keyboard shortcuts, accessibility, API surfaces, documentation, testing infrastructure — is the same across every app. The domain logic — _what the app actually does_ — is often surprisingly small.

[Command-centric design](../design/v15-tea/commands.md) crystallizes this. An app is:

1. **A command tree** — every action the app can perform, with names and types
2. **A state model** — the data the app manages
3. **Business rules** — how commands transform state

That's it. Everything else — the TUI, the CLI, the REPL, the AI agent, the MCP server, the tests, the docs — is auto-derived by the framework.

This means: **building a new app is almost entirely about defining commands and state.** The framework handles surfaces. The AI handles natural language. The result is a fully-featured, AI-native app from a remarkably small amount of code.

## The Opportunity

If building apps becomes this cheap, two things happen:

1. **The number of apps explodes.** Problems that weren't worth building a full app for become viable when the app is just 50-200 commands and a state model.
2. **Apps become interoperable by default.** Every command-centric app speaks the same protocols (code mode, tRPC, MCP). An orchestrator agent can connect them without custom integration.

Imagine a personal computing environment where you have 20-30 focused, single-purpose apps — each one excellent at its domain — all connected via an agent hub. Instead of one monolithic "productivity suite," you have a constellation of specialized tools that collaborate through AI.

This is not hypothetical. Each app below could be built as:

- **~50-200 commands** (the domain logic)
- **A state model** (what the app tracks)
- **Zero UI code** (framework handles rendering)
- **Zero API code** (framework handles surfaces)
- **Full AI integration** (for free, via withAI())

### The SaaS Disruption Angle

Most SaaS businesses are selling the plumbing, not the domain logic. A $20/mo project management tool is 90% UI/API/auth/hosting infrastructure and 10% "tasks have statuses and priorities." When the plumbing is free, the barrier to entry drops to near zero.

Command-centric apps can replace SaaS subscriptions with local-first, AI-native alternatives that:

- **Cost nothing to run** — no server, no subscription, local data
- **Are more powerful** — full code mode, AI agent, composable with other apps
- **Are more private** — your data stays on your machine
- **Are more flexible** — customize commands, extend with plugins

The catalog below focuses on apps that replace paid SaaS products — each one a potential subscription you no longer need.

## km: The PIM/PKM Hub

Before the catalog: **km** (Knowledge Machine) already handles the personal information/knowledge management domain as a single integrated app. Tasks, notes, calendar, contacts, bookmarks, reading lists, journals — these aren't separate apps, they're interconnected views of your personal knowledge base. Splitting them into separate apps would lose the connections that make them valuable.

km handles: tasks, notes, calendar, contacts, bookmarks, read-later, journal, habits, time tracking, flashcards, reading lists, research notes — essentially everything in the "Productivity & Knowledge" category.

The apps in this catalog are _other_ domains — things that don't belong in a PKM but benefit from the same architecture.

## Highlights

A sample of what command-centric apps could replace — one app per category to show the range:

| App                      | Domain               | Replaces               | What it is                                     |
| ------------------------ | -------------------- | ---------------------- | ---------------------------------------------- |
| **CRM**                  | Business & Sales     | HubSpot, Pipedrive     | Deals, pipeline, contacts, activities          |
| **Issue Tracker**        | Project & Team       | Linear, Jira           | Bugs, sprints, assignments, workflows          |
| **Help Desk**            | Customer & Support   | Zendesk, Freshdesk     | Tickets, SLAs, canned responses, KB            |
| **Newsletter Manager**   | Marketing & Growth   | ConvertKit, Mailchimp  | Subscribers, compose, schedule, analytics      |
| **Applicant Tracker**    | HR & People          | Greenhouse, Lever      | Job postings, pipeline, interviews, scorecards |
| **Incident Manager**     | DevOps & Engineering | PagerDuty, incident.io | Incidents, severity, postmortems, on-call      |
| **Approval Workflow**    | Operations           | Kissflow, ProcessMaker | Request types, multi-step approvals, audit     |
| **Bookkeeping**          | Finance              | QuickBooks, Xero       | Double-entry, reconciliation, reports          |
| **Compliance Checklist** | Legal                | Vanta, Drata           | SOC2/GDPR/HIPAA controls, evidence, audit      |
| **Property Manager**     | Real Estate          | Buildium, AppFolio     | Units, tenants, leases, maintenance            |
| **LMS**                  | Education            | Teachable, Thinkific   | Courses, quizzes, progress, certificates       |
| **Donor Manager**        | Nonprofit            | Bloomerang             | Donors, campaigns, receipts, stewardship       |

Each of these is ~50-200 commands and a state model. The framework handles everything else.

See [Appendix: Full Catalog](#appendix-full-catalog) for all 100 app ideas across 14 categories.

## The Math

A traditional SaaS app requires:

- UI framework, component library, responsive design
- Backend API, authentication, authorization
- Database, migrations, backups
- Payment processing, subscription management
- Hosting, CDN, monitoring
- Customer support infrastructure
- Documentation and onboarding

**With command-centric Silvery, you need:**

- Command definitions (the domain logic)
- A state model (what to persist)

Everything else is framework-provided. The 100 apps above share the same infrastructure. The difference between a CRM and a fleet manager is ~100 commands and a different state shape.

**What makes this realistic now:**

- AI agents can generate the command definitions from a description
- AI agents can use the apps once built (via code mode)
- Apps collaborate via the agent hub without custom integration
- The framework handles all the boring parts
- Local-first means no hosting costs, no subscriptions

**The SaaS subscription math:** A mid-size company using 10-20 of these SaaS tools could easily spend thousands per month on subscriptions. Even replacing a handful with local-first, command-centric alternatives reduces both cost and vendor lock-in.

## The Virtual Organization

The App Explosion thesis goes further than "lots of cheap apps." Each command-centric app is already an agent (via `withAI()`). And km already provides PIM/PKM tools — tasks, notes, calendar, communication. What if every domain app gets those tools too?

Each app-agent becomes a **team member** that can:

- **Manage its own backlog** — the CRM agent tracks its own tasks ("follow up with Acme," "update pipeline report")
- **Communicate** — agents message each other through the hub ("Hey Billing, Acme just closed — generate an invoice")
- **Take notes** — the Help Desk agent documents patterns ("third ticket this week about login timeouts")
- **Schedule** — the Compliance agent sets calendar reminders ("SOC2 audit prep due in 2 weeks")
- **Escalate** — the Incident Manager pages the on-call human when severity warrants it

Together, 20-30 domain agents form a **virtual organization** — a team of specialists that coordinate, delegate, and self-manage. The human sets goals and reviews work; the agents handle execution.

```
┌─────────────────────────────────────────────────────┐
│  Virtual Organization                               │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ CRM      │  │ Help Desk│  │ Billing  │           │
│  │ agent    │──│ agent    │──│ agent    │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│       │             │             │                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │ Hiring   │  │ Incidents│  │ Comms    │           │
│  │ agent    │──│ agent    │──│ agent    │           │
│  └──────────┘  └──────────┘  └──────────┘           │
│                     │                               │
│              ┌──────────────┐                       │
│              │  km (PIM/PKM)│  ← shared tools:      │
│              │  tasks, notes│    every agent gets   │ │
│              │  calendar,   │    task management,   │ │
│              │  contacts    │    notes, scheduling  │ │
│              └──────────────┘                       │
│                     │                               │
│              ┌──────────────┐                       │
│              │    Human     │  ← sets goals,        │
│              │  (you)       │    reviews work,      │ │
│              │              │    handles escalations│ │
│              └──────────────┘                       │
└─────────────────────────────────────────────────────┘
```

**Scenario: A customer churns.** The CRM agent notices an account went inactive. It creates a task on its own backlog to investigate, pulls context from the Help Desk agent (recent tickets), checks with the Billing agent (payment history), drafts a win-back email via the Comms agent, and escalates to the human with a summary: "Acme went dark — 3 unresolved tickets, last payment 45 days ago. Draft win-back email ready for review."

No human orchestrated those steps. Each agent did what it knows how to do, using the same PIM tools (tasks, notes, communication) that a human team member would use. The difference: it happened in seconds, not days.

This is the real disruption. Not "cheaper SaaS" — **a team of domain experts that never sleeps, never forgets, and coordinates automatically.** The 100 apps in the catalog aren't just tools. They're potential team members.

## The Vision

A computing environment where:

1. **Apps are cheap to build** — 50-200 commands, purpose-built for one domain
2. **Apps are agents** — each one reasons about its domain, manages its own work
3. **Agents share PIM tools** — tasks, notes, calendar, communication from km
4. **Agents self-organize** — a virtual org that coordinates without human micromanagement
5. **The human leads** — sets goals, reviews work, handles judgment calls
6. **All apps share the same interaction model** — learn one, know them all

This is the opposite of the current trend toward monolithic SaaS platforms. Instead of Salesforce trying to be CRM AND billing AND marketing AND analytics AND support, each concern gets its own agent — and they work together as a team.

The command-centric architecture makes this possible. The AI revolution makes it practical. Silvery makes it real.

---

_See also: [Command-Centric Design](../design/v15-tea/commands.md) — the architecture. [AI Mode](../design/v-undecided/ai-mode.md) — how AI agents use it._

---

## Appendix: Full Catalog

100 app ideas across 14 categories. Each is ~50-200 commands and a state model.

### Business & Sales

| #   | App                      | Description                                                     | Replaces                  | Revenue         |
| --- | ------------------------ | --------------------------------------------------------------- | ------------------------- | --------------- |
| 1   | **CRM**                  | Deals, pipeline stages, contacts, activities, reminders         | HubSpot, Pipedrive, Close | $15-150/user/mo |
| 2   | **Invoice & Billing**    | Create, send, track invoices, recurring billing, overdue alerts | FreshBooks, Wave          | $15-50/mo       |
| 3   | **Proposal Builder**     | Templates, pricing tables, e-signatures, client portal          | PandaDoc, Proposify       | $25-65/mo       |
| 4   | **Contract Manager**     | Templates, clause library, approval workflows, renewal tracking | Ironclad, Juro            | $50-200/mo      |
| 5   | **Expense Manager**      | Receipt capture, categorization, approval workflows, reporting  | Expensify, Ramp           | $5-10/user/mo   |
| 6   | **Subscription Billing** | Plans, trials, usage metering, dunning                          | Stripe Billing, Chargebee | $250-600/mo     |
| 7   | **Quoting & CPQ**        | Product catalog, pricing rules, quote generation, approvals     | DealHub, PandaDoc CPQ     | $30-75/user/mo  |
| 8   | **Commission Tracker**   | Sales reps, rules, tiers, payouts, disputes                     | CaptivateIQ, Spiff        | $15-30/user/mo  |

### Project & Team Management

| #   | App                  | Description                                                 | Replaces                | Revenue          |
| --- | -------------------- | ----------------------------------------------------------- | ----------------------- | ---------------- |
| 9   | **Issue Tracker**    | Bugs, features, sprints, assignments, priorities            | Linear, Jira, Shortcut  | $8-15/user/mo    |
| 10  | **Project Planner**  | Milestones, gantt, dependencies, resources, budgets         | Asana, Monday, Basecamp | $10-25/user/mo   |
| 11  | **OKR Tracker**      | Objectives, key results, progress, check-ins                | Gtmhub, Weekdone        | $7-15/user/mo    |
| 12  | **Retrospective**    | Templates, voting, action items, history, trends            | EasyRetro, Parabol      | $5-10/user/mo    |
| 13  | **Standup Bot**      | Async standups, team updates, blockers, history             | Geekbot, Standuply      | $3-5/user/mo     |
| 14  | **Resource Planner** | Team capacity, allocation, availability, utilization        | Float, Resource Guru    | $6-12/user/mo    |
| 15  | **Decision Log**     | Decisions, context, alternatives, outcomes, accountability  | Coda, Notion            | Part of $8-15/mo |
| 16  | **Risk Register**    | Risks, likelihood, impact, mitigation plans, review cadence | LogicGate, nTask        | $10-30/user/mo   |

### Customer & Support

| #   | App                      | Description                                                 | Replaces                | Revenue         |
| --- | ------------------------ | ----------------------------------------------------------- | ----------------------- | --------------- |
| 17  | **Help Desk**            | Tickets, assignments, SLA tracking, canned responses, KB    | Zendesk, Freshdesk      | $15-90/agent/mo |
| 18  | **Feedback Collector**   | User feedback, voting, status updates, public roadmap       | Canny, UserVoice        | $79-400/mo      |
| 19  | **NPS/Survey**           | Create surveys, collect responses, analyze, segment         | Typeform, SurveyMonkey  | $25-100/mo      |
| 20  | **Onboarding Checklist** | Customer steps, progress, automated reminders, health score | ChurnZero, Vitally      | $15-50/user/mo  |
| 21  | **Knowledge Base**       | Articles, categories, search, versioning, analytics         | HelpScout Docs, GitBook | $20-65/mo       |
| 22  | **Live Chat**            | Routing, canned responses, transcripts, bot escalation      | Intercom, Drift, Crisp  | $25-100/seat/mo |
| 23  | **Bug Reporter**         | User-facing bug reports, screenshots, metadata, status      | BugHerd, Userback       | $25-80/mo       |

### Marketing & Growth

| #   | App                        | Description                                               | Replaces                 | Revenue        |
| --- | -------------------------- | --------------------------------------------------------- | ------------------------ | -------------- |
| 24  | **Newsletter Manager**     | Subscriber lists, compose, schedule, analytics, segments  | ConvertKit, Mailchimp    | $9-50/mo       |
| 25  | **Social Media Scheduler** | Draft, schedule, cross-post, analytics, content calendar  | Buffer, Hootsuite        | $15-100/mo     |
| 26  | **Landing Page Builder**   | Templates, A/B testing, form capture, analytics           | Carrd, Leadpages         | $19-100/mo     |
| 27  | **SEO Tracker**            | Keywords, rankings, competitors, backlinks, site audit    | Ahrefs, SEMrush          | $99-450/mo     |
| 28  | **Affiliate Manager**      | Partners, links, commissions, payouts, fraud detection    | PartnerStack, Impact     | $50-500/mo     |
| 29  | **Waitlist Manager**       | Signups, referral links, position tracking, launch emails | Viral Loops, Waitlist.me | $20-80/mo      |
| 30  | **Content Calendar**       | Planning, assignments, deadlines, review workflows        | CoSchedule, Planable     | $19-50/user/mo |
| 31  | **Link Shortener**         | Custom domains, click tracking, UTM builder, QR codes     | Bitly, Short.io          | $29-200/mo     |

### HR & People

| #   | App                     | Description                                            | Replaces               | Revenue               |
| --- | ----------------------- | ------------------------------------------------------ | ---------------------- | --------------------- |
| 32  | **Applicant Tracker**   | Job postings, pipeline, interviews, scorecards, offers | Greenhouse, Lever      | $6-15/user/mo         |
| 33  | **Employee Directory**  | Profiles, org chart, reporting lines, skills           | BambooHR, Rippling     | Part of $8-15/user/mo |
| 34  | **Time-Off Manager**    | PTO requests, balances, approval workflows, calendar   | Timetastic, Absence.io | $1-3/user/mo          |
| 35  | **1:1 Meeting Tracker** | Agenda, talking points, action items, history          | Fellow, Hypercontext   | $5-10/user/mo         |
| 36  | **Performance Reviews** | Review cycles, self-assessments, peer feedback         | Lattice, 15Five        | $4-11/user/mo         |
| 37  | **Employee Onboarding** | Checklists, document collection, training assignments  | BambooHR, Gusto        | $5-10/user/mo         |
| 38  | **Shift Scheduler**     | Shifts, availability, swaps, coverage, overtime        | When I Work, Deputy    | $2-5/user/mo          |
| 39  | **Training Manager**    | Courses, assignments, completions, certifications      | TalentLMS, Docebo      | $5-15/user/mo         |

### DevOps & Engineering

| #   | App                    | Description                                             | Replaces               | Revenue          |
| --- | ---------------------- | ------------------------------------------------------- | ---------------------- | ---------------- |
| 40  | **Incident Manager**   | Incidents, severity, timeline, postmortems, on-call     | PagerDuty, incident.io | $20-40/user/mo   |
| 41  | **Server Monitor**     | Uptime checks, response times, alerts, correlation      | UptimeRobot, Pingdom   | $7-30/mo         |
| 42  | **Feature Flags**      | Toggle features, environments, targeting, rollout %     | LaunchDarkly, Flipt    | $10-25/seat/mo   |
| 43  | **CI/CD Dashboard**    | Pipeline status, build history, deploy tracking         | Jenkins, Buildkite     | $15-30/user/mo   |
| 44  | **Runbook Runner**     | Step-by-step procedures, execution log, approvals       | Rundeck, Shoreline     | $15-50/user/mo   |
| 45  | **Cloud Cost Tracker** | Multi-cloud spend, trends, anomalies, optimization      | Infracost, Vantage     | $50-500/mo       |
| 46  | **API Explorer**       | HTTP requests, collections, environments, tests         | Postman, Insomnia      | Free-$30/user/mo |
| 47  | **Database Browser**   | Browse tables, run queries, view results, schema        | TablePlus, DBeaver     | $9-20/mo         |
| 48  | **Log Viewer**         | Stream, filter, search structured logs, alerting        | Lnav, Papertrail       | $15-50/mo        |
| 49  | **Dependency Auditor** | Outdated deps, vulnerabilities, license compliance      | Snyk, Dependabot       | $25-100/mo       |
| 50  | **Status Page**        | Public status, incidents, maintenance windows           | Statuspage, Instatus   | $29-100/mo       |
| 51  | **Changelog**          | Release notes, categorization, subscriber notifications | Headway, LaunchNotes   | $29-100/mo       |

### Operations & Workflow

| #   | App                     | Description                                         | Replaces                     | Revenue             |
| --- | ----------------------- | --------------------------------------------------- | ---------------------------- | ------------------- |
| 52  | **Form Builder**        | Forms, conditional logic, submissions, integrations | Typeform, JotForm            | $25-80/mo           |
| 53  | **Approval Workflow**   | Request types, multi-step approvals, audit trail    | Kissflow, ProcessMaker       | $10-20/user/mo      |
| 54  | **SOP Manager**         | Procedures, versioning, acknowledgments, compliance | Process Street, SweetProcess | $12-30/user/mo      |
| 55  | **Asset Manager**       | Hardware/software inventory, assignments, lifecycle | Snipe-IT, Lansweeper         | $5-10/asset/mo      |
| 56  | **Visitor Management**  | Check-in, badges, host notifications, visitor log   | Envoy, SwipedOn              | $99-300/location/mo |
| 57  | **Meeting Room Booker** | Room calendar, availability, equipment, bookings    | Robin, Skedda                | $5-10/room/mo       |
| 58  | **Document Workflow**   | Templates, fill-in fields, routing, e-signatures    | DocuSign, SignNow            | $10-30/user/mo      |

### Finance & Accounting

| #   | App                     | Description                                              | Replaces                   | Revenue        |
| --- | ----------------------- | -------------------------------------------------------- | -------------------------- | -------------- |
| 59  | **Bookkeeping**         | Double-entry, chart of accounts, reconciliation, reports | QuickBooks, Xero           | $15-80/mo      |
| 60  | **Budget Planner**      | Departmental budgets, forecasting, variance analysis     | Anaplan, Adaptive Planning | $50-200/mo     |
| 61  | **Accounts Payable**    | Bills, approvals, payment scheduling, vendor management  | Bill.com, Melio            | $15-40/user/mo |
| 62  | **Accounts Receivable** | Invoices, collections, aging reports, payment reminders  | YayPay, Tesorio            | $20-50/user/mo |
| 63  | **Payroll**             | Pay runs, deductions, tax calculations, compliance       | Gusto, ADP                 | $6-12/user/mo  |
| 64  | **Equity Manager**      | Cap table, option grants, vesting, 409A, dilution        | Carta, Pulley              | $50-300/mo     |

### Legal & Compliance

| #   | App                      | Description                                          | Replaces                | Revenue            |
| --- | ------------------------ | ---------------------------------------------------- | ----------------------- | ------------------ |
| 65  | **Policy Manager**       | Policies, versions, acknowledgments, training links  | PowerDMS, ConvergePoint | $5-15/user/mo      |
| 66  | **Compliance Checklist** | SOC2/GDPR/HIPAA controls, evidence, audit prep       | Vanta, Drata            | $100-500/mo        |
| 67  | **GDPR/Privacy Manager** | Data inventory, consent tracking, DSAR handling      | OneTrust, TrustArc      | $50-300/mo         |
| 68  | **Audit Trail**          | Actions, timestamps, users, searchable log, export   | AuditBoard, custom      | Part of compliance |
| 69  | **IP Portfolio**         | Patents, trademarks, filing dates, renewal deadlines | IPfolio, Anaqua         | $50-200/mo         |

### Commerce & Marketplace

| #   | App                       | Description                                              | Replaces                  | Revenue            |
| --- | ------------------------- | -------------------------------------------------------- | ------------------------- | ------------------ |
| 70  | **Product Catalog**       | SKUs, variants, pricing, categories, inventory levels    | Shopify, Salsify          | Part of $29-300/mo |
| 71  | **Order Manager**         | Orders, fulfillment, shipping, returns, refunds          | ShipStation, Ordoro       | $25-100/mo         |
| 72  | **Inventory Manager**     | Stock levels, locations, reorder points, purchase orders | Cin7, QuickBooks Commerce | $30-100/mo         |
| 73  | **Pricing Engine**        | Price rules, tiers, discounts, dynamic pricing           | Prisync, Competera        | $50-300/mo         |
| 74  | **Marketplace Dashboard** | Multi-channel listings, sync inventory, unified orders   | ChannelAdvisor, Sellbrite | $50-200/mo         |

### Real Estate & Property

| #   | App                     | Description                                          | Replaces                       | Revenue        |
| --- | ----------------------- | ---------------------------------------------------- | ------------------------------ | -------------- |
| 75  | **Property Manager**    | Units, tenants, leases, maintenance, rent collection | Buildium, AppFolio             | $50-200/mo     |
| 76  | **Lease Tracker**       | Lease terms, renewals, escalations, critical dates   | LeaseQuery, VTS                | $10-30/unit/mo |
| 77  | **Maintenance Tracker** | Work orders, assignments, parts, vendor contacts     | UpKeep, Maintenance Connection | $35-75/user/mo |

### Healthcare, Education, Hospitality

| #   | App                       | Description                                              | Replaces                     | Revenue            |
| --- | ------------------------- | -------------------------------------------------------- | ---------------------------- | ------------------ |
| 78  | **Patient Scheduler**     | Appointments, provider availability, reminders, waitlist | Jane App, Calendly (medical) | $20-80/provider/mo |
| 79  | **Practice Manager**      | Patients, visits, billing, insurance, referrals          | SimplePractice, TherapyNotes | $30-60/provider/mo |
| 80  | **Clinical Checklist**    | Protocols, procedures, compliance, certifications        | Custom                       | —                  |
| 81  | **LMS**                   | Courses, lessons, quizzes, progress, certificates        | Teachable, Thinkific         | $39-200/mo         |
| 82  | **Student Tracker**       | Enrollment, grades, attendance, behavior                 | PowerSchool, Alma            | $5-15/student/yr   |
| 83  | **Tutoring Manager**      | Sessions, students, scheduling, progress, billing        | TutorCruncher, Teachworks    | $20-50/mo          |
| 84  | **Certification Manager** | Requirements, exams, certifications, renewals            | Certemy, Credly              | $5-10/user/mo      |
| 85  | **Reservation Manager**   | Tables, timeslots, parties, waitlist, no-shows           | OpenTable, Resy              | $50-300/mo         |
| 86  | **Menu Manager**          | Items, categories, pricing, allergens, rotation          | TouchBistro, Toast           | Part of POS        |
| 87  | **Appointment Scheduler** | Services, providers, booking, reminders                  | Acuity, Square Appointments  | $15-45/mo          |
| 88  | **Membership Manager**    | Plans, members, billing, access levels, renewals         | Wild Apricot, GlueUp         | $25-100/mo         |

### Logistics, Nonprofit, Creative

| #   | App                       | Description                                          | Replaces                       | Revenue           |
| --- | ------------------------- | ---------------------------------------------------- | ------------------------------ | ----------------- |
| 89  | **Fleet Manager**         | Vehicles, drivers, maintenance, fuel, routes         | Fleetio, Samsara               | $5-10/vehicle/mo  |
| 90  | **Dispatch Board**        | Jobs, assignments, routing, status tracking          | ServiceTitan, Jobber           | $30-100/user/mo   |
| 91  | **Field Service**         | Work orders, checklists, time tracking, sign-off     | ServiceMax, Housecall Pro      | $30-65/user/mo    |
| 92  | **Delivery Tracker**      | Orders, routes, driver location, proof of delivery   | Onfleet, Routific              | $30-100/driver/mo |
| 93  | **Donor Manager**         | Donors, donations, campaigns, receipts, stewardship  | Bloomerang, Little Green Light | $20-80/mo         |
| 94  | **Grant Tracker**         | Applications, deadlines, requirements, reporting     | Submittable, Fluxx             | $50-200/mo        |
| 95  | **Volunteer Manager**     | Signups, shifts, hours, skills, recognition          | VolunteerHub, SignUpGenius Pro | $20-100/mo        |
| 96  | **Event Manager**         | Events, RSVPs, tickets, schedules, vendors, budgets  | Eventbrite, Splash             | $30-100/event     |
| 97  | **Digital Asset Manager** | Files, metadata, tags, versions, permissions, CDN    | Bynder, Brandfolder            | $50-300/mo        |
| 98  | **Production Tracker**    | Projects, milestones, approvals, revisions, delivery | Frame.io, Monday               | $15-30/user/mo    |
| 99  | **Talent Manager**        | Roster, availability, rates, bookings, contracts     | Casting Networks, Crew         | $20-50/user/mo    |
| 100 | **Licensing Tracker**     | Assets, licenses, territories, royalties, renewals   | RightsTech, FADEL              | $30-100/mo        |
