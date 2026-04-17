<!-- llm-meta: {"model":"GPT-5.4 Pro","timestamp":"2026-04-02T17:30:35.035Z","query":"Deep research: should Silvery add structural diffing (IL/DL/SU/SD terminal operations) to its output phase? Focus on practical implementation, risks, and real-world framework usage.","cost":"$4.81","tokens":24806,"durationMs":809642} -->

## 1. Overview / summary

**Short answer:** **yes, but narrowly and conservatively.**

For Silvery, **structural diffing is worth adding as an optional layer above cell diffing**, but the value is **very uneven by operation and mode**:

- **Very worthwhile**
  - **`IL` / `DL`** for **mid-buffer line insertion/deletion**
  - especially in **inline mode**, where cell diff otherwise rewrites many shifted rows
  - and in **fullscreen** for list/view scrolling and viewport shifts

- **Probably not worthwhile in inline mode**
  - **`SU` / `SD`** without `DECSTBM`
  - because without a bounded scroll region they act on the **whole page**, not just Silvery’s block

- **Key practical conclusion**
  - **`IL`/`DL` can be used without `DECSTBM`**
  - but in **inline/main-buffer mode**, `IL` needs a **“make room first”** strategy, otherwise it may discard Silvery’s own bottom row if the render block touches the screen bottom
  - `DL` is easier and safer than `IL`
  - `SU`/`SD` are mostly a **fullscreen/alt-screen optimization**, not an inline one

If you implement this, the best design is:

1. keep the existing **cell diff** as ground truth
2. add a **row-level heuristic** that detects exact shifted-line patterns
3. apply **at most one small structural edit** (`IL`/`DL`, maybe `SU`/`SD` in fullscreen)
4. then run the existing cell diff against a **simulated transformed prev buffer**

That gives most of the gain without turning the output phase into a full terminal optimizer.

---

## 2. Key details and facts

---

### A. What `IL` / `DL` / `SU` / `SD` actually do

These are standard ANSI/ECMA-48 edit/scroll operations:

- **`CSI n L`** — **IL** — Insert `n` lines at the cursor row
- **`CSI n M`** — **DL** — Delete `n` lines at the cursor row
- **`CSI n S`** — **SU** — Scroll up `n` lines
- **`CSI n T`** — **SD** — Scroll down `n` lines

Semantically:

- They operate **within the current scrolling region**
- If no margins are set, that region is effectively the **whole screen/page**
- `IL` shifts lines **down**
- `DL` shifts lines **up**
- newly exposed lines become **blank**
- lines pushed out of the region are **discarded**

That last point matters a lot for inline mode.

---

### B. Practical sequence: “insert a line in the middle of a 50-row buffer”

There are **two different cases**.

---

#### Case 1: fixed-height viewport/fullscreen buffer

Example:

- screen height = 50 rows
- `prev` rows = `A1..A50`
- `next` rows = `A1..A19, X, A20..A49`
- row `A50` is gone

This is the ideal `IL` case.

**Sequence:**

1. Move cursor to row 20, column 1
2. Emit `CSI 1 L`
3. Paint row 20 (`X`)
4. Done

Example:

```ansi
CSI 20;1H
CSI 1L
<SGR/text for new row>
```

What terminal does:

- rows 20..49 shift to 21..50
- old row 50 is discarded
- row 20 becomes blank
- you paint the new row there

This can replace rewriting 31 full rows.

---

#### Case 2: inline mode where buffer height grows from 50 to 51

Example:

- `prev` has 50 rows
- `next` has 51 rows
- insertion is at row 20
- Silvery block is bottom-anchored in main buffer

**Plain `IL` is not enough.**  
If the block touches the screen bottom, `IL` will shift row 50 downward and the bottom-most line of the page gets discarded. That may discard your own content.

So the safe sequence is:

1. **Create disposable space below the block**
   - usually by appending one newline at the end of the block
   - this grows the controlled area by one physical line
2. Move back up to insertion row
3. Emit `CSI 1 L`
4. Paint the inserted row
5. Restore cursor to the desired final position

Pseudo-sequence:

```ansi
\n                         # grow block by one line
CSI <up-to-insert-row>A
\r
CSI 1L
<paint new row>
CSI <down-to-bottom>B
```

If the block already has blank rows below it on screen, step 1 may not be necessary.  
But in inline mode you usually **cannot assume that**, so a “make room first” strategy is the safe default.

---

### C. Does `IL` work in inline mode on the main buffer?

**Yes, terminals generally support it in the main buffer.**  
The issue is **not support**, but **semantics**.

#### Important behavior:

- `IL` edits the **visible page/scroll region**
- it is **not a history-preserving append**
- content shifted out of the bottom of the region is typically **not moved into scrollback**

So for your question:

> Does it shift content into scrollback or just within the visible screen?

**For `IL`/`DL`: treat it as “just within the visible screen/region.”**  
Do **not** rely on `IL` putting displaced content into scrollback.

This is why `DECSTBM` being off the table matters less for `IL`/`DL` than for `SU`/`SD`, but it also means **you must manage room explicitly** in inline insertion cases.

---

### D. Do `IL`/`DL` preserve wide chars, wrapped text, and styles?

#### 1. Styled content

**Usually yes.**  
Terminals store each cell with its rendition/state. When a line is shifted, the cells and their attributes move with it.

So:

- foreground/background colors
- bold/italic/underline
- reverse video
- etc.

…generally move correctly with the shifted line.

#### 2. Wide characters

**Usually yes**, assuming the terminal already rendered them correctly.

A terminal that supports wide cells should move the whole line contents as stored. So if a row contains CJK or emoji cells, shifting the row up/down is normally fine.

#### 3. Newly created blank lines

These are the subtle part.

The blank line introduced by `IL`/`DL` is a **terminal-generated blank line**, and the exact attributes of those blanks can depend on terminal erase semantics / BCE behavior.

Practical implication:

- **do not rely on the inserted blank line already having the right background/style**
- when painting a new inserted row, paint it as a **full row** or use your existing clear/fill logic

#### 4. Wrapped text

This is where caution is needed.

If Silvery’s `TerminalBuffer` is already a **physical row grid**, then line edits are fine because you are diffing **physical rows**, not logical paragraphs.

If you rely on terminal soft-wrap state, things get murkier:

- some emulators track a “wrapped” flag per line
- moving/editing rows can preserve or expose that state in emulator-specific ways

**Recommendation:** structural diffing should operate on **physical terminal rows only**.  
If a resize or rewrap happened, fall back to full/cell rendering.

---

### E. Detection algorithm: how do you know it’s an insertion/deletion?

You do **not** need to know the “semantic truth.”  
You only need to detect a **row-shift pattern** that is cheaper than raw cell diffing.

The best practical approach is:

---

#### Option 1: simple contiguous-shift heuristic

Good first implementation.

1. Compute a hash/fingerprint for each row:
   - chars
   - style attributes
   - wide-cell markers / continuation cells
   - any wrap metadata you consider relevant

2. Find:
   - longest common prefix
   - longest common suffix

3. Check for simple patterns:
   - **insert candidate** at row `i`:
     - `next[i .. i+k)` are new
     - `prev[i .. end-k)` equals `next[i+k .. end)`
   - **delete candidate** at row `i`:
     - `prev[i .. i+k)` removed
     - `prev[i+k .. end)` equals `next[i .. end-k)`

This catches the most valuable cases:

- list row inserted
- list row removed
- viewport shifted by one or more rows

---

#### Option 2: row-level Myers / patience diff

More general, more expensive, more complexity.

Use line hashes as tokens and compute a shortest edit script.  
This is useful if you want:

- multiple insert/delete blocks
- ambiguity handling with repeated lines
- a more global optimization

But for a terminal renderer, this is often overkill. A simple contiguous-shift detector gets most of the value.

---

#### Option 3: simulate-and-price

Best practical architecture for Silvery.

For each candidate structural edit:

1. **simulate** the terminal effect on `prev`
   - apply row insert/delete/scroll to a scratch copy of the prev buffer
2. run existing **cell diff** from simulated buffer → `next`
3. compute byte cost:
   - cursor moves
   - structural op bytes
   - residual repaint bytes
4. choose structural only if cheaper

This is especially attractive for Silvery because you already have a good `changesToAnsi()`.

---

#### How do you distinguish true insertion from coincidence?

You mostly **don’t need to**.

If two different edit scripts produce the same final screen, choose the cheaper/safest one.

The real issue is **duplicate rows** causing ambiguous alignment.  
Example:

```text
foo
foo
foo
```

A row diff may “insert” at multiple possible positions.  
This is okay if:

- the resulting terminal state is correct
- cost is lower
- you simulate and verify residual diff

So the problem is not “truth,” but **stable, low-cost screen transformation**.

---

### F. Byte savings: what do you actually gain?

Structural ops help most when a change causes **many rows to shift**.

Assume:

- width = 80 columns
- row is mostly plain text
- cursor move costs ~5–8 bytes
- structural op costs ~4–6 bytes
- style overhead omitted or modest

#### 1. Insert 1 row in middle of 50-row buffer

Suppose insertion at row 20 shifts 31 rows.

**Cell-diff only**

- rewrites ~31 rows
- roughly `31 × 80 = 2480` text bytes
- plus cursor/style overhead
- practical range: **~2.5–3.0 KB**

**Structural (`IL`)**

- move to row: ~6 bytes
- `CSI 1 L`: ~4 bytes
- paint new row: ~80+ bytes
- restore cursor: ~6 bytes
- inline “make room first”: +1–2 bytes for newline (plus maybe a little motion)
- practical range: **~95–120 bytes**

**Savings:** often **20x–30x**, sometimes more with heavy styling.

---

#### 2. Delete 1 row in middle of 50-row buffer

**Cell diff**

- rewrite all shifted rows below deletion
- again **~2–3 KB**

**Structural (`DL`)**

- move to row
- `CSI 1 M`
- maybe clear/fix the new bottom row if needed
- practical range: **~10–30 bytes**

**Savings:** easily **100x** in favorable cases.

`DL` is the strongest structural win.

---

#### 3. Streaming response grows by one line at the bottom

This is the important “don’t over-engineer it” case.

If the change is simply:

- append one new line at the end

then your current incremental diff is probably **already near optimal**.

Cell diff may only need:

- newline / move
- the new row text

So structural diff gives **little to no extra benefit**.

**Conclusion:** structural diff is **not** mainly for append-at-bottom streaming.  
It is for **mid-buffer insert/delete** and **scroll-like shifts**.

---

#### 4. Fullscreen viewport scroll by one row

If a 50-row full-screen list scrolls by one:

**Cell diff**

- may rewrite all 50 rows
- roughly **4 KB+**

**`SU 1` + paint bottom row**

- `CSI 1 S`
- paint one row
- maybe ~90–110 bytes

Huge win.  
But this is mostly a **fullscreen** optimization, not inline.

---

## 3. Different perspectives / approaches

---

### Approach A: stay cell-diff-only

**Pros**

- simplest
- least risk
- current performance already excellent for point edits and append-only updates

**Cons**

- expensive for line shifts in large inline buffers
- misses obvious terminal-native optimizations

This is reasonable if Silvery’s common workload is mostly:

- stream append
- localized cell changes
- not many mid-buffer insert/delete events

---

### Approach B: add conservative `IL`/`DL` only

**Best balance for Silvery**

- detect only exact contiguous physical-row insert/delete
- in fullscreen: emit `IL`/`DL` directly
- in inline:
  - allow `DL`
  - allow `IL` only with “make room first” padding logic
- then run residual cell diff

**Pros**

- most of the value
- manageable complexity
- low risk

**Cons**

- won’t catch more exotic structural changes
- `SU`/`SD` still mostly unused inline

This is the approach I would recommend first.

---

### Approach C: full terminal optimizer (`IL`/`DL`/`SU`/`SD` with global row diff)

**Pros**

- maximum bandwidth reduction
- great for fullscreen scrolling UIs

**Cons**

- much more complexity
- more terminal-specific edge cases
- harder to reason about inline main-buffer safety

For Silvery, this seems justified **only if fullscreen scrolling perf becomes a major concern**.

---

## 4. Real-world framework usage

This is uneven.

---

### ncurses

**Yes — definitely precedent here.**

This is the strongest real-world evidence that structural terminal edits are worthwhile.

ncurses historically uses terminal capabilities like:

- insert line
- delete line
- scroll
- insert/delete char

Relevant APIs/options include:

- `insertln`, `deleteln`, `insdelln`
- `idlok()`
- `scrollok()`

ncurses’ update optimizer chooses whether these capabilities are cheaper than repainting.

**Takeaway:** line-edit structural diffing is not theoretical; it is classic terminal optimization practice.

---

### Ratatui

**As of current Rust ecosystem practice, Ratatui is mostly cell-buffer oriented.**

Ratatui’s rendering model is built around drawing cells/regions, and its backend interface is effectively **cell-oriented**, not “terminal edit operation” oriented.

I’m not aware of Ratatui having a built-in structural line-diff pass comparable to ncurses’ optimizer.

**Takeaway:** modern Rust TUI frameworks mostly favor simpler diffing.

---

### Crossterm

Crossterm is more of a **terminal command/backend library** than an optimizer.

It exposes terminal control operations (including scrolling commands), but it does **not itself provide a curses-style structural diff optimizer**.

**Takeaway:** the primitives exist, but higher-level libs usually don’t exploit them aggressively.

---

### termwiz

termwiz is lower-level and capability-aware, and it is closer to the kind of library where structural terminal edits can be expressed.

That said, I am not aware of a widely adopted **automatic row-structural diff layer** in typical termwiz consumers on the same level as ncurses.

**Takeaway:** the ecosystem has the primitives, but not much mainstream use of them in modern Rust TUI rendering pipelines.

---

### Bottom line on framework usage

- **Classic terminal stack (ncurses): yes**
- **Modern Rust TUI stack: mostly no**
- not because `IL`/`DL` are bad
- but because:
  - cell diff is simpler
  - terminals are fast enough for many cases
  - inline/main-buffer semantics are tricky

This actually argues that Silvery could be **distinctive** here, especially because inline scrollback-preserving rendering is a less common niche.

---

## 5. Risks and failure modes

---

### 1. Main-buffer inline semantics are easy to get wrong

This is the biggest risk.

Without `DECSTBM`, line ops act on the **whole page region**, not Silvery’s logical block.

So:

- `DL` is usually okay if rows below the block are blank
- `IL` can discard your bottom row if the block touches the bottom of the viewport

Mitigation:

- use `IL` inline only with a **make-room-first** strategy

---

### 2. `SU`/`SD` are dangerous inline

Without a bounded region they scroll the **whole page**.

That means they can move:

- lines above Silvery’s block
- scrollback-visible content
- unrelated visible rows

**Recommendation:** don’t use `SU`/`SD` in inline mode unless Silvery truly owns the full visible page.

---

### 3. Background/erase semantics

Inserted blank lines may not have the style you expect.

Mitigation:

- paint inserted rows fully
- be careful with background fills
- test under terminals with different BCE behavior

---

### 4. Wide/combining-character edge cases

Modern terminals generally handle this, but older terminals/multiplexers have historically had bugs around:

- wide chars at line edges
- combining marks
- wrap-state interactions

Mitigation:

- include wide-cell markers in row equality
- keep a fallback to cell diff
- test under tmux/screen and major emulators

---

### 5. Multiplexers and Windows

Support is generally broad today, but:

- tmux/screen can expose edge cases
- old Windows console implementations were weaker
- modern Windows Terminal / ConPTY is much better

Mitigation:

- feature flag
- runtime kill switch
- terminal compatibility testing

---

### 6. Visual artifacts if updates are interrupted

Structural edits can be more visually dramatic mid-frame than cell repainting.

Mitigation:

- emit the whole update in one write
- use synchronized updates where available

---

## 6. Recent developments / current state

As of the modern terminal ecosystem:

- **ANSI edit ops are widely supported** in mainstream emulators:
  - xterm
  - VTE-based terminals (GNOME Terminal, etc.)
  - kitty
  - iTerm2
  - WezTerm
  - Alacritty
  - Windows Terminal / modern VT stack

- **Synchronized update support** has become more common, which reduces visible flicker and makes structural edits safer to batch.

- **Most modern TUI frameworks still prefer cell diffing**, not because structural ops lack value, but because:
  - implementation complexity is higher
  - fullscreen redraws are often “fast enough”
  - inline main-buffer correctness is subtle

So the current state is:

- **the terminal capability exists**
- **the optimization is proven in curses**
- **few modern frameworks exploit it deeply**
- which means Silvery has room to add it where it matters most

---

## 7. Recommendation for Silvery

### Recommended final stance

#### Yes: add **structural diffing**, but only in this form:

### Phase 1 — do this first

- implement **exact row-shift detection**
- support:
  - **`DL` in inline + fullscreen**
  - **`IL` in fullscreen**
  - **`IL` in inline only with make-room-first**
- then run existing cell diff on the transformed/simulated buffer

### Phase 2 — maybe

- add **fullscreen `SU`/`SD`**
- useful for scrolling lists/viewports in fullscreen or alt screen

### Avoid for now

- `SU`/`SD` in inline main-buffer mode without scroll regions

---

### Why this is the right cut

It matches your constraints:

- preserves scrollback better than `DECSTBM`
- gives large wins where cell diff is worst
- avoids the dangerous whole-page scroll behavior of `SU`/`SD` inline
- reuses existing `changesToAnsi()`

---

### Suggested implementation strategy

1. **Prepass**
   - compute row hashes for prev/next
   - look for one contiguous insert/delete/scroll candidate

2. **Cost model**
   - estimate bytes for:
     - structural op + inserted/deleted rows + cursor restore
     - existing cell diff
   - choose structural only if meaningfully cheaper

3. **Simulation**
   - apply candidate op to scratch-prev
   - then call existing `changesToAnsi(scratchPrev, next)`

4. **Mode gating**
   - inline:
     - `DL`: yes
     - `IL`: yes, but only with room-making step
     - `SU`/`SD`: no
   - fullscreen/alt:
     - all four are candidates

5. **Fallback**
   - width change, wrap uncertainty, ambiguous cases, unknown terminal → current cell diff/full render

---

## 8. Direct answers to your numbered questions

1. **How would IL/DL work in practice?**  
   Move to row, emit `CSI n L/M`, then repaint only the inserted/deleted rows and residual mismatches. In inline insertion, first create room below the block.

2. **Does IL work in inline/main buffer?**  
   **Yes**, but it edits the visible page/region. It does **not** reliably push displaced content into scrollback. Treat it as in-place page editing.

3. **Wide chars / wrapped / styles?**  
   Shifted lines generally preserve contents and styles correctly. New blank lines need repainting. Wrapped-line metadata is the trickiest part; operate on physical rows, not logical text flow.

4. **Detection algorithm?**  
   Use row hashes + common-prefix/common-suffix + contiguous shift detection. Optionally simulate candidates and choose the cheapest valid plan.

5. **Actual byte savings?**  
   Huge for mid-buffer insert/delete and fullscreen scrolls; small for append-at-bottom. Typical savings are **10x–100x+** depending on width and shifted rows.

6. **Do real frameworks do this?**  
   **ncurses: yes.**  
   **Modern Rust TUIs: generally no, or not automatically.**

7. **Risks?**  
   Biggest risks are inline main-buffer semantics, whole-page effects without margins, erase/background quirks, and terminal/multiplexer edge cases.

8. **Can IL/DL be used without DECSTBM?**  
   **Yes.** They work fine without scroll regions. But without `DECSTBM`, they apply to the default full-page region, so inline usage must be conservative.

---

## 9. Sources / references

Where possible, these are the primary references to consult:

1. **ECMA-48 / ISO 6429**  
   Standard definitions for `IL`, `DL`, `SU`, `SD`
   - ECMA-48 standard page:  
     https://ecma-international.org/publications-and-standards/standards/ecma-48/

2. **xterm Control Sequences**  
   Practical terminal semantics for ANSI/DEC sequences, including margins and editing ops
   - https://invisible-island.net/xterm/ctlseqs/ctlseqs.html

3. **VT510 / DEC terminal manuals**  
   Historical reference for line insertion/deletion behavior
   - https://vt100.net/docs/

4. **ncurses man pages**
   - `curs_insdel(3X)` — insert/delete line functions
   - `curs_outopts(3X)` — includes options like `idlok`, `scrollok`
   - ncurses manpage index:  
     https://invisible-island.net/ncurses/man/

5. **Crossterm docs**  
   For terminal command support and backend capabilities
   - https://docs.rs/crossterm/latest/crossterm/

6. **Ratatui docs / source**  
   For backend draw model and cell-oriented rendering
   - https://docs.rs/ratatui/latest/ratatui/

7. **termwiz docs**  
   For lower-level terminal capability abstractions
   - https://docs.rs/termwiz/latest/termwiz/

8. **Microsoft Console Virtual Terminal Sequences**  
   For Windows VT support status
   - https://learn.microsoft.com/windows/console/console-virtual-terminal-sequences

---

If you want, I can next turn this into a **Silvery-specific design proposal**: detection heuristic, ANSI sequences, safety conditions, and pseudocode for integrating structural diffing into `changesToAnsi()` / `inlineIncrementalRender()`.
