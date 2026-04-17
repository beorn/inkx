<!-- llm-meta: {"model":"GPT-5.4 Pro","session":"f8196c1c","timestamp":"2026-03-23T18:17:36.151Z","query":"Review this plan for decoupling the silvery TUI framework from its TEA state management layer. Be constructive and creative. Specifically: (1) Is the phase ordering correct? What would you change? (2) Are there adoption barriers we missed? Think about a developer choosing between Ink and silvery TODAY. (3) The plan proposes moving core types from tea to term. Is there a cleaner package architecture? Consider: should there be a @silvery/core? (4) What is the competitive positioning we are not seeing? What would make a developer switch from Ink to silvery? (5) Any risks or anti-patterns in the plan? (6) Creative ideas we have not considered — marketing, developer experience, ecosystem plays. Be thorough, opinionated, and specific.","cost":"$4.46","tokens":24782,"durationMs":732451} -->

## 1. Overview / summary

**Short verdict:** the plan is directionally very strong, and the decoupling is not just a cleanup — it is probably **the** prerequisite for making silvery broadly adoptable.

But I would change two big things:

1. **Move docs/API simplification earlier.**  
   Your biggest adoption problem is not only dependency shape; it is that the public story teaches the hardest path first. Fix that immediately, even before the refactor is fully complete.

2. **Use a cleaner layering model than “term absorbs everything.”**  
   I would introduce a **small internal core layer** now, and only make it public later if it proves useful. Terminal input parsing and focus should stay terminal-specific; geometry/tree/shared model types can live in core.

My strongest opinion:

> **Silvery should be positioned as “React terminal UI that starts as simply as Ink, but scales much further.”**  
> TEA should become an **optional scaling path**, not part of the default mental model.

Also: don’t underestimate this point:

> A developer choosing between Ink and silvery is often actually choosing between **Ink, prompt libraries, or “just stdout”** — not just Ink vs silvery.

So the winning story is not “we have more layers,” it’s:

- **simpler install**
- **simpler hello world**
- **richer out-of-the-box UX**
- **no native build pain**
- **a growth path when the app stops being simple**

---

## 2. Key details and facts

---

### A. Is the phase ordering correct? What would I change?

### What is right in your ordering

Your current ordering has the right core logic:

- **Phase 1 code split first** makes sense because the dependency graph is wrong.
- **Docs split** is necessary because perception is currently as damaging as the code coupling.
- **Positioning/website** should happen after the technical story is true.
- **Release prep** is essential because this is the kind of refactor that can silently regress packaging and install behavior.

So the structure is good.

### What I would change

I would add a **Phase 0** and move some docs/API work earlier.

---

### Recommended revised phase order

#### **Phase 0 — Define the public contract before moving files**

Before moving code, decide:

- What is the **main beginner API**?
  - I strongly recommend `render(<App />)` or equivalent.
  - `run(<App />, term)` is fine as a lower-level API, but it should not be the first thing users see.
- What belongs to:
  - renderer/runtime
  - terminal I/O
  - shared model/core
  - optional TEA/app architecture
- What import paths will be public in 1 year?
- What metrics define success?
  - install without TEA
  - hello-world lines of code
  - startup time
  - no native deps
  - non-TTY behavior
  - React 18/19 matrix
  - Node version matrix

Also add CI rules early:

- dependency boundary checks
- bundle/install smoke tests
- no `term -> tea` regressions

---

#### **Phase 1 — Fix the onboarding story immediately**

Do this **before or in parallel with** the refactor:

- README starts with:
  ```tsx
  import { render, Text } from "silvery"
  render(<Text>Hello</Text>)
  ```
- “Counter” example uses `useState` + `useInput`
- component docs stop teaching TEA-first patterns
- “State Management” page says:
  - start with hooks
  - use reducers/context if needed
  - use external stores if you want
  - use `@silvery/tea` when the app becomes command/effect-heavy

This is the fastest way to reduce the current “I have to learn TEA” impression.

**Important:** your proposed “Hello World” still looks too advanced if it requires:

- `using`
- `createTerm()`
- `await`
- manual term lifecycle

That is still more cognitive load than Ink.

For marketing/onboarding, you want **zero ceremony**:

```tsx
import { render, Text } from "silvery"
render(<Text>Hello</Text>)
```

Then advanced docs can introduce `run()` and explicit terminals.

---

#### **Phase 2 — Internal extraction / package decoupling**

Now do the dependency cleanup:

- move shared types/utilities
- move terminal-specific input/focus code out of tea
- move actual TEA/store/app factory into `@silvery/tea`
- add compatibility re-exports
- add codemod or migration script

This is where the architectural cleanup happens.

---

#### **Phase 3 — Public API cleanup**

After the internal split:

- move `createApp` to `@silvery/tea`
- ideally rename or reframe it if needed
- stop exporting TEA-looking names from renderer-facing packages
- deprecate old import paths

This is where the mental model becomes consistent.

---

#### **Phase 4 — Release hardening and beta**

Before launch:

- test on macOS/Linux/Windows
- test in TTY and non-TTY
- test ESM and bundling workflows
- test React 18 and 19
- verify no native deps leak in
- verify tree-shaking/bundling only if you actually support that workflow
- publish a beta/canary and get early user feedback

---

#### **Phase 5 — Website/comparison/launch**

Only after the story is real:

- comparison pages
- benchmark pages
- migration guides
- “Why silvery?” landing page
- package READMEs

---

### One more opinionated change

I would **deprioritize “The Silvery Way” rewrite** relative to task-based docs.

Philosophy docs are nice, but adoption comes from:

- “How do I build a form?”
- “How do I add keyboard input?”
- “How do I render a list of 10k items?”
- “How do I test it?”
- “How do I migrate from Ink?”

The “way” should support the docs, not lead them.

---

## B. Adoption barriers you may be missing

You already identified the big ones. Here are the important missing ones.

---

### 1. **Your real competitor is not only Ink**

For many developers, the alternatives are:

- **Ink**
- **prompt libraries** (`enquirer`, `prompts`, `@clack/prompts`, etc.)
- **spinner/progress utilities** (`ora`, `listr`, etc.)
- **imperative TUI libs** (`blessed`, `neo-blessed`, `terminal-kit`)
- **“just print to stdout”**

That matters because many people do **not** start by thinking “I need a React TUI framework.”

#### What this means

Silvery should explain:

- when a prompt library is enough
- when silvery becomes worth it
- how to start with a small prompt-like UI and scale up later

A great positioning line would be:

> **Use silvery when your CLI stops being a prompt and starts becoming an app.**

That is much stronger than “we have more components.”

---

### 2. **Hello World is still too complicated if it uses `using`, `await`, and `createTerm()`**

This is a hidden adoption barrier.

`using` is elegant, but it is:

- unfamiliar to most JS developers
- tied to modern TS/JS support
- easy to break in copy-paste situations
- not what people expect in a tutorial

Similarly:

- top-level `await` adds module/toolchain assumptions
- `createTerm()` exposes runtime internals too early

#### Recommendation

Have two tiers of runtime API:

**Beginner**

```tsx
import { render, Text } from "silvery"
render(<Text>Hello</Text>)
```

**Advanced**

```tsx
using term = createTerm(...)
await run(<App />, term)
```

Beginner docs should almost never show `using` first.

---

### 3. **Trust / maturity / community size**

This is huge and often ignored.

A developer may choose Ink not because it is better technically, but because:

- it has more mindshare
- they have seen it before
- it appears battle-tested
- they assume more community help exists
- they assume fewer future migration risks

#### What to do

You need trust signals:

- real example apps
- benchmark repo
- compatibility matrix
- roadmap
- versioning policy
- migration guides
- visible tests
- maybe one or two production users / case studies

“30+ components” helps less than “people actually ship with this.”

---

### 4. **Non-TTY / piped output story**

A lot of real CLIs run in contexts like:

- CI
- redirected output
- pipes
- logs
- IDE terminals
- remote shells

A developer will hesitate if they are not sure what happens when `stdout` is not an interactive TTY.

#### Recommendation

Have a first-class story for:

- `renderStatic()`
- automatic non-interactive fallback
- capability detection
- “plain mode” rendering

This is not just a feature; it is adoption insurance.

---

### 5. **ESM/CJS/tooling friction**

Your plan mentions pure ESM and tree-shaking. That can be good, but it is also a barrier.

Many CLI developers still trip over:

- ESM vs CJS
- ts-node / tsx / bun / jest / vitest differences
- top-level await rules
- `require()` not working

Also, one detail in your plan conflicts:

> “Pure ESM”  
> and  
> `node -e "require('silvery')"`

Those do not line up.

#### Recommendation

Be explicit:

- If silvery is pure ESM, embrace it and document it clearly.
- If you support CJS, test it explicitly.
- Don’t make onboarding examples depend on advanced module behavior.

And test:

- npm
- pnpm
- bun
- tsx
- esbuild / ncc bundling if relevant

---

### 6. **Windows / terminal compatibility**

For terminal frameworks, “works everywhere” is not marketing fluff — it is core product value.

Developers care about:

- Windows terminals
- WSL
- Unicode width correctness
- resize behavior
- mouse support
- bracketed paste
- SSH behavior
- CI environments
- terminal capability differences

If silvery is better here, say it. If not, at least document support clearly.

---

### 7. **Single-binary/bundler friendliness**

A lot of CLI authors now care about bundling/distribution:

- `esbuild`
- `ncc`
- `pkg`-style workflows
- Bun single-file builds

Your pure-JS / no-native-deps story could be very attractive here.

#### Recommendation

Publish recipes:

- “Build a single executable with esbuild”
- “Bundle silvery into one file”
- “Why no native deps matters for distribution”

This may convert more users than tree-shaking rhetoric.

---

### 8. **TEA jargon itself may be a barrier**

Even if the implementation is good, “TEA” is not a familiar term to most React developers.

They know:

- hooks
- reducers
- context
- Zustand
- Redux
- XState

They do **not** automatically know “TEA.”

That means:

- `AgNode` is especially harmful
- TEA branding in core docs makes the whole framework feel more foreign than it is

#### Recommendation

Keep TEA as an optional advanced architecture, but don’t foreground the acronym in beginner-facing surfaces.

Possibly even consider whether `@silvery/tea` should remain the public name, versus a friendlier alias like `@silvery/app` or `silvery/app` later.

---

## C. Package architecture: should there be a `@silvery/core`?

### My recommendation

**Yes, probably internally. Maybe not publicly yet.**

That is the cleanest answer.

---

### The real question is not “core or term?”

The real question is:

> Do you have shared, stable, platform-agnostic primitives — or are you just moving clutter around?

If it is the former, a core package is right.  
If it is the latter, `@silvery/core` will become a junk drawer.

---

### A clean architecture rule of thumb

#### **Core**

Put something in core only if it is:

- renderer-agnostic
- state-management-agnostic
- terminal-agnostic
- likely to be reused by `term`, `test`, maybe future runtimes

Examples that **might** belong:

- geometry (`Rect`, `Point`, ranges)
- shared node/model interfaces, if truly cross-package
- tree traversal utilities
- maybe generic event/value types
- maybe text editing primitives if they are UI-agnostic

#### **Term**

Put something in term if it is terminal/runtime specific:

- key parsing
- ANSI conversion
- raw input splitting
- terminal capability detection
- focus management tied to rendered tree/layout
- renderer/runtime lifecycle
- scrollback rendering
- terminal event plumbing

#### **Tea**

Put something in tea if it is architectural/state specific:

- store creation
- update/dispatch
- commands/effects
- plugins
- app factory
- diagnostics tied to the TEA model

---

### My opinion on your specific items

| Item                                                    | Best home                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------- |
| `AgNode` / node model                                   | **core** if shared; otherwise keep internal, not public             |
| `BoxProps`, `TextProps`                                 | public surface of main package, implementation may live outside tea |
| `Rect`                                                  | core                                                                |
| `parseKey`, `splitRawInput`, `keyToAnsi`, `matchHotkey` | term                                                                |
| `FocusManager`, focus events/queries                    | term initially                                                      |
| `merge`, `filter`, `takeUntil`                          | internal utils, not necessarily public core                         |
| `tree-utils`                                            | core or internal shared utils                                       |
| `createStore`, `dispatch`, `silveryUpdate`              | tea                                                                 |
| `text-cursor`, `text-ops`                               | depends; likely shared utility or text module, not tea by default   |

---

### Public vs internal `@silvery/core`

#### Option 1 — **Public `@silvery/core`**

**Pros**

- clean dependency graph
- lets advanced users build extensions
- future-proofs alternative renderers/test hosts

**Cons**

- creates a semver burden immediately
- users may import internals you later want to change
- increases package surface/cognitive load

#### Option 2 — **Internal workspace core package**

**Pros**

- fixes architecture without exposing internals
- fewer promises to users
- best balance for now

**Cons**

- less extensibility for third-party package authors

### My recommendation

Start with:

- internal `@silvery/core` in the monorepo
- public `silvery` as the beginner package
- optional public `@silvery/tea`
- optional public `@silvery/test`

Then later, if real extension authors need it, make core public intentionally.

---

### A cleaner public package story

I would avoid making users think about monorepo internals.

#### Ideal public surface

- `silvery` → components, hooks, render/run
- `@silvery/tea` → optional app architecture
- `@silvery/test` → optional testing helpers

Internally:

- `@silvery/core`
- `@silvery/ag-term`
- etc.

**Do not make users learn your package graph to build a counter.**

---

### Should `createApp` move from term to tea?

**Yes. Strong yes.**

If it creates stores and dispatches and embodies architectural conventions, it belongs in the optional architecture package.

Also: `createApp` sounds like the default path. That naming alone may be part of why docs drifted TEA-first.

If it stays public, consider whether the advanced layer should use a more explicit name, or at least live under a clearly advanced package.

---

### Should you rename `AgNode`?

**If it is public: yes.**  
**If it can be hidden: even better.**

Best outcome:

- renderer-internal node types are not public
- public users work with components and props, not host tree internals

If it must be public, `AgNode` is the wrong name because it falsely ties a renderer primitive to a state architecture.

`SilveryNode` is better.  
`UINode` is probably too generic.  
`HostNode` or `RenderNode` might be best if it is internal-ish.

---

## D. Competitive positioning: what you may not be seeing

### The strongest switch reasons are not all in your current positioning

Your three selling points are good, but I would sharpen them.

Right now the plan sounds a bit like:

- React you know
- zero native deps
- many components

That is solid, but it is not yet the most compelling narrative.

---

### What actually makes someone switch from Ink?

Usually one of these:

#### 1. **Ink starts simple, but gets hard when the app gets real**

Silvery can win by saying:

> **Start with the same React mental model. When your CLI becomes a real app, you don’t need to outgrow the framework.**

That means:

- text inputs
- focus management
- virtualization
- search
- scrollback
- theming
- structured architecture when complexity rises

That is a better switch story than “more components.”

---

#### 2. **Install/distribution reliability**

This is especially compelling for:

- enterprise users
- Windows users
- Alpine/musl users
- air-gapped or locked-down environments
- bundler users

“Zero native deps” is not just convenience. It means:

- fewer install failures
- fewer toolchain surprises
- easier reproducibility
- easier security review

That is a big real-world decision factor.

---

#### 3. **Production-grade UX primitives**

If silvery has these working well, these are major differentiators:

- real text input / textarea
- focus scopes and keyboard traversal
- virtualized large lists
- scrollback and search
- richer theming/design tokens
- deterministic testing
- smoother incremental updates

Those solve problems teams actually hit in non-trivial terminal apps.

---

#### 4. **A better path for AI / streaming terminal apps**

This is a major current opportunity.

Modern CLI apps increasingly look like:

- chat UIs
- streaming token output
- multi-pane logs
- searchable history
- long-running interactive sessions
- dashboards with keyboard navigation

Silvery seems structurally well-suited to that category.

This is a much stronger market story than generic “terminal UI.”

A sharp positioning line could be:

> **Silvery is for building serious terminal apps: chat UIs, dashboards, forms, log viewers, not just prompts.**

---

### A better positioning stack

Instead of:

1. React you know
2. Zero native deps
3. 30+ components

I would test something like:

1. **Start as simply as Ink**
   - `render(<Text>Hello</Text>)`
   - hooks-first
   - no store required

2. **Scale into real terminal apps**
   - inputs, focus, lists, scrollback, theming, testing
   - optional app architecture when complexity grows

3. **Works where CLIs actually live**
   - zero native deps
   - bundler-friendly
   - cross-platform
   - good in CI/SSH/non-TTY environments

That is a stronger adoption story.

---

### One more important point: don’t over-index on component count

“30+ components” is nice, but it is not a primary purchase driver unless those components are:

- ergonomic
- well-documented
- keyboard-complete
- composable
- production-proven

I would highlight **5 hero capabilities**, not 30 count:

- `TextInput` / `TextArea`
- `SelectList` / `MultiSelect`
- `VirtualList`
- focus system
- scrollback/search

Those are sticky.

---

## E. Risks and anti-patterns in the plan

---

### 1. **Fixing the dependency graph without fixing the beginner API**

This is the biggest strategic risk.

If you split packages but beginners still see:

- `using`
- `createTerm`
- `await run`
- advanced architecture docs

then adoption still won’t improve enough.

The public first-run experience matters more than the internal graph alone.

---

### 2. **Overexposing internal types**

If you make `@silvery/core` public too early, you may freeze the wrong abstractions.

Risk areas:

- internal node representations
- focus manager details
- tree traversal utilities
- streams helpers

Recommendation:

- expose less
- use export maps
- prefer public component/hook APIs
- keep internals internal until demand exists

---

### 3. **`@silvery/core` becoming a junk drawer**

Very common anti-pattern.

If “core” becomes:

- geometry
- terminal key parsing
- store interfaces
- random streams utilities
- testing helpers

then it is not core; it is “misc.”

Define a rule and enforce it.

---

### 4. **Too many public packages**

Good architecture does not have to mean more public complexity.

If users have to learn:

- `@silvery/ag-term`
- `@silvery/ag-react`
- `@silvery/theme`
- `@silvery/core`
- `@silvery/tea`
- `@silvery/test`

that hurts adoption.

Prefer:

- one beginner package
- one optional advanced architecture package
- one optional test package

Internals can stay modular.

---

### 5. **Two ways to do everything**

If docs over-correct, you can create a new problem:

- hooks path
- reducer path
- external store path
- TEA path

If all are presented equally, users feel lost.

#### Recommendation

Use a clear escalation ladder:

1. local hooks
2. `useReducer`/context
3. external store if you already use one
4. `@silvery/tea` for complex command/effect-driven apps

This should be explicit.

---

### 6. **Using implementation details as philosophy**

I would be careful with principles like:

- “using for lifecycle”
- “incremental rendering awareness”

Those are not good top-level philosophy for most users.

Better high-level principles for terminal UI are things like:

- keyboard-first design
- semantic theming
- composable focusable components
- graceful degradation in non-TTY mode
- start simple, scale architecture later

Implementation details belong in advanced docs.

---

### 7. **`sideEffects: false` can be dangerous if applied lazily**

If any module has top-level behavior, registration, or runtime effects, blanket `sideEffects: false` can cause subtle breakage.

Audit it carefully rather than assuming it.

---

### 8. **Pure ESM claims need product discipline**

If you go ESM-first:

- own it
- test it
- document it

But don’t mix ESM messaging with CJS smoke tests.

---

### 9. **Migration churn**

Renaming types and moving imports can cause:

- broken examples
- community frustration
- stale blog posts
- TS duplicate type weirdness

Mitigations:

- compatibility re-exports
- deprecated aliases
- codemod
- migration guide
- one full release cycle of soft deprecation

---

### 10. **Hiding TEA too much**

The current problem is TEA overexposure.  
The future risk is TEA underexposure.

If silvery really has a good optional app architecture story, that is still a differentiator. Don’t bury it so deeply that advanced users never discover it.

The right framing is:

> **Hooks first. Architecture when you need it.**

Not:

- “TEA everywhere”
- or “TEA doesn’t matter”

---

## F. Creative ideas you have not considered

Here are the highest-leverage ones.

---

### 1. **Add a `render()` beginner API**

This is probably the single best DX improvement.

- `render(<App />)` for 80% use cases
- `run(<App />, term)` for advanced/custom terminal control

That mirrors how people think and reduces friction enormously.

---

### 2. **“Choose your path” docs landing page**

Instead of leading with packages/layers, lead with intent:

- **I want a simple prompt**
- **I want an interactive component with hooks**
- **I want a complex app with commands/state**
- **I want to migrate from Ink**
- **I want to test in CI**

This is much more discoverable.

---

### 3. **Ink compatibility package + codemod**

This could be a huge ecosystem play.

Examples:

- `@silvery/ink`
- `npx silvery migrate-ink`

Even if it only covers 60–80% of common cases, it lowers perceived switching cost dramatically.

---

### 4. **“Doctor” / capability diagnostics**

A command or helper like:

- `silvery doctor`
- `useTerminalCapabilities()`

that reports:

- TTY or not
- color support
- Unicode width assumptions
- Kitty support
- mouse support
- bracketed paste
- OS/shell/terminal info

This is gold for debugging, docs, and support.

---

### 5. **Flagship reference apps**

Don’t just ship examples. Ship a few killer examples that demonstrate why silvery exists:

- AI chat terminal
- log viewer / search UI
- form wizard
- package manager dashboard
- task runner with panes and focus
- database/browser viewer

These should be polished enough to serve as “proof of category.”

---

### 6. **Prompt-library bridge**

Since prompt libraries are a real competitor, consider a high-level package or examples that let users get:

- confirm
- select
- multiselect
- input
- password
- progress

with very little setup.

That can pull people in before they need a whole app.

---

### 7. **Bundling/distribution recipes**

Make “zero native deps” tangible with docs like:

- build a single binary
- bundle with esbuild
- use in pnpm monorepos
- deploy on Alpine
- run in corporate locked-down environments

This converts pragmatic teams.

---

### 8. **Interactive docs / browser terminal playground**

If possible, a docs playground backed by a terminal emulator in the browser would be a huge win.

Even prerecorded sessions/GIFs are valuable.

Show:

- keyboard navigation
- focus changes
- search
- scrolling
- virtualized lists

Terminal UX is easier to trust when people can see it.

---

### 9. **Record/replay testing and demos**

Since you have input parsing and a test story, consider tooling for:

- recording input traces
- replaying sessions
- snapshotting screen states

This would help:

- demos
- bug reports
- CI
- docs
- performance regressions

---

### 10. **Own the AI terminal app niche**

This is the most interesting positioning opportunity I see.

Silvery seems naturally good for:

- streaming text
- search/history
- focusable panes
- text inputs
- selection lists
- long sessions

That is exactly where terminal UX is getting more ambitious.

A dedicated “Build AI-native terminal apps” track could be very effective.

---

## 3. Different perspectives / approaches

There are at least three viable strategic approaches here.

---

### Approach 1 — **Pragmatic DX-first**

If you want the fastest adoption improvement:

- fix README and docs immediately
- add `render()`
- move `createApp` out of beginner docs
- publish hooks-first examples
- then do the internal refactor

**Best if:** you want quick wins and lower launch risk.

---

### Approach 2 — **Architecture-first cleanup**

If long-term correctness matters most:

- create internal `core`
- enforce dependency boundaries
- move terminal concerns to term
- move app/store concerns to tea
- keep public API stable via re-exports
- launch after internals are clean

**Best if:** the current package graph is blocking everything else.

---

### Approach 3 — **Single-package public UX, multi-package internal architecture**

This is the approach I would most likely recommend.

Publicly:

- `silvery`
- `@silvery/tea`
- `@silvery/test`

Internally:

- `@silvery/core`
- `@silvery/ag-term`
- etc.

This gives:

- clean layering
- low user cognitive load
- future flexibility

**Best if:** you want both clean internals and simple adoption.

---

## 4. Recent developments / current state

A few broader ecosystem realities matter here.

---

### 1. Terminal apps are getting richer

Developers increasingly expect:

- proper text input
- keyboard navigation
- search
- scrolling
- panes
- links/images in capable terminals
- polished states and transitions

That makes “app-grade terminal UI” more relevant now than a few years ago.

---

### 2. AI/agent CLIs are expanding the category

Modern terminal tools are not just one-shot commands anymore. Many are:

- long-lived
- streaming
- conversational
- pane-based
- search-heavy

This favors frameworks with stronger input, focus, and incremental rendering models.

---

### 3. Installation reliability matters more than ever

Pure JS / no native deps is increasingly valuable because teams care about:

- reproducibility
- CI reliability
- cross-platform behavior
- bundling
- security review / supply chain surface area

This is a major real-world advantage if silvery can substantiate it.

---

### 4. ESM is more common, but still a friction point

The ecosystem has moved toward ESM, but tooling differences remain painful. A clear compatibility story is still important.

---

### 5. React developers want optional architecture, not mandatory dogma

The default expectation in React is:

- start with hooks
- add structure only when needed

Silvery should align with that expectation. TEA can still be a strong advanced story, but it should feel optional and additive.

---

## 5. Sources and references

I can’t verify live npm/package metrics from here, so for anything you publish publicly — especially dependency counts, unpacked size, install size, and competitor comparisons — I would validate against the current release manifests and tooling at launch time.

Useful primary references:

- **Ink repository / docs**  
  https://github.com/vadimdemedes/ink

- **React docs (`useState`, hooks, rendering model)**  
  https://react.dev/

- **The Elm Architecture (for TEA background)**  
  https://guide.elm-lang.org/architecture/

- **TypeScript 5.2: Explicit Resource Management / `using`**  
  https://devblogs.microsoft.com/typescript/announcing-typescript-5-2/

- **Node.js ECMAScript modules documentation**  
  https://nodejs.org/api/esm.html

- **Yoga layout engine**  
  https://github.com/facebook/yoga

- **Zustand docs**  
  https://github.com/pmndrs/zustand

For final launch materials, I’d also verify:

- current package dependency trees from `package.json`
- `npm pack` tarball sizes
- Bundlephobia or equivalent bundle inspection where relevant
- cross-platform install tests in CI
- benchmark results from your own public benchmark harness

---

## Final recommendation in one paragraph

The plan is right, but I would make it more **product-led**: add a **simple `render()` onboarding API**, move **docs/examples before or alongside the code split**, create a **small internal core package** rather than dumping everything into term, keep **terminal-specific concerns in term** and **app architecture in tea**, and reposition silvery not as “the TEA framework with a renderer,” but as **the easiest way to build serious terminal apps in React — with TEA as an optional scaling path**. If you do that, the strongest switch reasons from Ink become clear: **same familiar React start, less install pain, richer built-in UX, and a better path when the app becomes complex.**

If you want, I can also turn this into a **concrete proposed package graph + import map + migration plan**, including example `exports` fields and a phased semver rollout.
