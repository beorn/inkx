# Blog Visuals Reference

Mermaid diagrams and hero images for each article. Review these before finalizing the blog posts -- the diagrams can be embedded directly, and hero images can be used for OG/social cards.

---

## Article 1: Comparing macOS Terminal Emulators in 2026

**Hero image:** `hero-terminal-emulators.png`

### Feature Support Scores

```mermaid
%%{init: {'theme': 'dark'}}%%
xychart-beta
    title "terminfo.dev Probe Pass Rate (%)"
    x-axis ["iTerm2", "Ghostty", "Kitty", "Warp", "WezTerm", "Terminal.app"]
    y-axis "Pass Rate (%)" 80 --> 100
    bar [94.5, 93.3, 93.3, 89.6, 89.0, 86.0]
```

### Protocol Support Matrix

```mermaid
%%{init: {'theme': 'dark'}}%%
block-beta
    columns 7
    space header1["Ghostty"] header2["Kitty"] header3["iTerm2"] header4["WezTerm"] header5["Warp"] header6["Terminal.app"]

    kitty_kb["Kitty Keyboard"]:1 g1["Yes"]:1 k1["Yes"]:1 i1["Yes"]:1 w1["Yes"]:1 wp1["Yes"]:1 t1["No"]:1
    sync["Sync Output"]:1 g2["Yes"]:1 k2["Yes"]:1 i2["Yes"]:1 w2["Yes"]:1 wp2["Yes"]:1 t2["Yes"]:1
    osc52w["OSC 52 Write"]:1 g3["Yes"]:1 k3["Yes"]:1 i3["Yes"]:1 w3["Yes"]:1 wp3["Yes"]:1 t3["Yes"]:1
    osc52r["OSC 52 Read"]:1 g4["No"]:1 k4["No"]:1 i4["Yes"]:1 w4["No"]:1 wp4["No"]:1 t4["No"]:1
    osc8["Hyperlinks"]:1 g5["Yes"]:1 k5["Yes"]:1 i5["Yes"]:1 w5["Yes"]:1 wp5["Yes"]:1 t5["Yes"]:1
    kgfx["Kitty Graphics"]:1 g6["Yes"]:1 k6["Yes"]:1 i6["No"]:1 w6["No"]:1 wp6["Yes"]:1 t6["Yes"]:1
    sixel["Sixel"]:1 g7["No"]:1 k7["No"]:1 i7["No"]:1 w7["Yes"]:1 wp7["No"]:1 t7["Yes"]:1
    focus["Focus Report"]:1 g8["Yes"]:1 k8["Yes"]:1 i8["Yes"]:1 w8["Yes"]:1 wp8["Yes"]:1 t8["Yes"]:1
    tc["Truecolor"]:1 g9["Yes"]:1 k9["Yes"]:1 i9["Yes"]:1 w9["Yes"]:1 wp9["Yes"]:1 t9["Yes"]:1
    sem["Semantic Prompts"]:1 g10["Yes"]:1 k10["Yes"]:1 i10["Yes"]:1 w10["Yes"]:1 wp10["Yes"]:1 t10["Yes"]:1

    style t1 fill:#933,color:#fff
    style g4 fill:#933,color:#fff
    style k4 fill:#933,color:#fff
    style w4 fill:#933,color:#fff
    style wp4 fill:#933,color:#fff
    style t4 fill:#933,color:#fff
    style i6 fill:#933,color:#fff
    style w6 fill:#933,color:#fff
    style g7 fill:#933,color:#fff
    style k7 fill:#933,color:#fff
    style i7 fill:#933,color:#fff
    style wp7 fill:#933,color:#fff
```

### Rendering Architecture Comparison

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    subgraph GPU-Accelerated
        G[Ghostty]
        K[Kitty]
        W[WezTerm]
        WP[Warp]
    end
    subgraph CPU Rendering
        I[iTerm2<br/>Core Text]
        T[Terminal.app<br/>Core Text]
    end
```

---

## Article 2: Building an AI Coding Agent in the Terminal

**Hero image:** `hero-ai-agent-tui.png`

### Streaming Token Architecture

```mermaid
%%{init: {'theme': 'dark'}}%%
graph TD
    API["LLM API<br/>(50-150 tokens/sec)"] -->|"async iteration"| Buffer["Pending Buffer<br/>(accumulates tokens)"]
    Buffer -->|"16ms interval"| Batch["Batch Flush"]
    Batch -->|"setState"| React["React Reconciliation<br/>(max 62/sec)"]
    React --> Render["Silvery Incremental Render<br/>(sub-ms for text changes)"]
    Render --> Screen["Terminal Screen"]
    Screen -->|"exchange complete"| SB["Native Scrollback"]

    style API fill:#1a5276,color:#fff
    style Buffer fill:#7d3c98,color:#fff
    style Batch fill:#7d3c98,color:#fff
    style React fill:#1e8449,color:#fff
    style Render fill:#1e8449,color:#fff
    style Screen fill:#b7950b,color:#fff
    style SB fill:#555,color:#fff
```

### Three-Zone Scrollback Model

```mermaid
%%{init: {'theme': 'dark'}}%%
graph TB
    subgraph Terminal["Terminal Window"]
        direction TB
        Static["STATIC SCROLLBACK<br/>Terminal owns these lines<br/>User can scroll, search, select<br/>App cannot modify"]
        Dynamic["DYNAMIC SCROLLBACK<br/>App tracks as pre-rendered strings<br/>Re-emittable on resize<br/>Cheaply updatable"]
        Live["LIVE SCREEN<br/>Active React components<br/>Streaming response + input prompt<br/>Full interactivity"]
    end

    Static --- Dynamic --- Live

    style Static fill:#333,color:#999,stroke:#555
    style Dynamic fill:#2c3e50,color:#aaa,stroke:#7f8c8d
    style Live fill:#1a5276,color:#fff,stroke:#3498db
```

### Tool Call State Machine

```mermaid
%%{init: {'theme': 'dark'}}%%
stateDiagram-v2
    [*] --> Running: tool_use received
    Running --> Running: output chunks
    Running --> Done: result received
    Running --> Error: error/timeout

    state Running {
        [*] --> Streaming
        Streaming --> Streaming: append to tail buffer
        note right of Streaming: Show last N lines<br/>with "lines above" count
    }

    Done --> Frozen: exchange complete
    Error --> Frozen: exchange complete
    Frozen --> [*]: unmount, graduate to scrollback
```

---

## Article 3: Dynamic Scrollback

**Hero image:** `hero-dynamic-scrollback.png`

### Three-Zone Model (Detailed)

```mermaid
%%{init: {'theme': 'dark'}}%%
graph TB
    subgraph zones["Three-Zone Model"]
        direction TB
        SB["STATIC SCROLLBACK<br/>------<br/>Owned by terminal<br/>Scroll, search, select<br/>Destroyed on redraw (3J)"]
        DSB["DYNAMIC SCROLLBACK<br/>------<br/>Pre-rendered strings<br/>App tracks + can re-emit<br/>O(N) on resize"]
        LS["LIVE SCREEN<br/>------<br/>React components<br/>Hooks, state, effects<br/>Incremental rendering"]
    end

    LS -->|"isFrozen=true<br/>unmount + cache string"| DSB
    DSB -->|"past history limit<br/>data dropped"| SB

    style SB fill:#1c1c1c,color:#666,stroke:#444
    style DSB fill:#2a2a3a,color:#aaa,stroke:#556
    style LS fill:#0d3b66,color:#eee,stroke:#4a9eda
```

### Item Lifecycle

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    M["MOUNTED<br/>Active React component<br/>Hooks, state, effects"] -->|"scrolls off screen"| V["VIRTUALIZED<br/>Unmounted, output cached<br/>String re-emit only"]
    V -->|"past history limit"| G["GONE<br/>Data dropped<br/>Terminal has the text"]

    style M fill:#1e8449,color:#fff
    style V fill:#7d6608,color:#fff
    style G fill:#555,color:#999
```

### Alternate Screen vs Dynamic Scrollback

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    subgraph alt["Alternate Screen"]
        direction TB
        A1["App draws everything"]
        A2["Exit = content gone"]
        A3["No native scroll"]
        A4["No Cmd+F search"]
        A5["No text selection across screens"]
    end

    subgraph dyn["Dynamic Scrollback"]
        direction TB
        D1["Live screen + scrollback"]
        D2["Exit = history preserved"]
        D3["Native scroll works"]
        D4["Cmd+F works"]
        D5["Full text selection"]
    end

    alt -.-|"vs"| dyn

    style alt fill:#4a1a1a,color:#ccc,stroke:#833
    style dyn fill:#1a3a1a,color:#ccc,stroke:#3a8
```

---

## Article 4: Terminal Protocols You Should Know in 2026

**Hero image:** `hero-terminal-protocols.png`

### Protocol Adoption Tiers

```mermaid
%%{init: {'theme': 'dark'}}%%
graph TB
    subgraph universal["UNIVERSAL (6/6 terminals)"]
        TC["Truecolor<br/>24-bit RGB"]
        SO["Synchronized Output<br/>DEC mode 2026"]
        OSC8["Hyperlinks<br/>OSC 8"]
        FR["Focus Reporting<br/>DEC mode 1004"]
        SP["Semantic Prompts<br/>OSC 133"]
        CW["Clipboard Write<br/>OSC 52"]
    end

    subgraph widespread["WIDESPREAD (5/6 terminals)"]
        KKP["Kitty Keyboard Protocol<br/>CSI u — all except Terminal.app"]
    end

    subgraph fragmented["FRAGMENTED (no consensus)"]
        KG["Kitty Graphics<br/>Ghostty, Kitty, Warp, Terminal.app"]
        SX["Sixel<br/>Terminal.app, WezTerm"]
        IT["iTerm2 Images<br/>OSC 1337 — iTerm2 only"]
        CR["Clipboard Read<br/>OSC 52 — iTerm2 only (default)"]
    end

    style universal fill:#1a3a1a,color:#ccc,stroke:#3a8
    style widespread fill:#2a2a1a,color:#ccc,stroke:#aa8
    style fragmented fill:#3a1a1a,color:#ccc,stroke:#a55
```

### Graphics Protocol Coverage

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    subgraph kitty_gfx["Kitty Graphics"]
        G_K["Ghostty"]
        K_K["Kitty"]
        W_K["Warp"]
        T_K["Terminal.app"]
    end

    subgraph sixel_gfx["Sixel"]
        T_S["Terminal.app"]
        WZ_S["WezTerm"]
    end

    subgraph iterm_gfx["iTerm2 Protocol"]
        I_I["iTerm2"]
    end

    T_K -.- T_S

    style kitty_gfx fill:#1a3050,color:#ccc,stroke:#4a8
    style sixel_gfx fill:#302a1a,color:#ccc,stroke:#a84
    style iterm_gfx fill:#301a30,color:#ccc,stroke:#a4a
```

### Synchronized Output Sequence

```mermaid
%%{init: {'theme': 'dark'}}%%
sequenceDiagram
    participant App as TUI Application
    participant Term as Terminal

    App->>Term: ESC[?2026h (begin sync)
    Note over Term: Buffer all output...
    App->>Term: Move cursor, set colors
    App->>Term: Write characters
    App->>Term: More drawing commands
    App->>Term: ESC[?2026l (end sync)
    Note over Term: Present entire<br/>frame atomically
    Term->>Term: Display (no flicker)
```

---

## Article 5: Layout-First Rendering

**Hero image:** `hero-layout-first.png`

### Standard vs Silvery Pipeline

```mermaid
%%{init: {'theme': 'dark'}}%%
graph LR
    subgraph standard["Standard Pipeline (Ink)"]
        direction LR
        R1["React Render<br/>width=???"] --> L1["Yoga Layout<br/>compute sizes"] --> O1["Output<br/>write to terminal"]
        L1 -.->|"measureElement()"| R1b["Re-render<br/>now knows width"]
        R1b --> O1
    end

    subgraph silvery["Silvery Pipeline"]
        direction LR
        S["Structure Pass<br/>extract flex props"] --> L2["Flexily Layout<br/>compute sizes"] --> R2["Content Render<br/>useBoxRect()"] --> D["Diff<br/>compare frames"] --> O2["Output<br/>write changes only"]
    end

    style standard fill:#3a1a1a,color:#ccc,stroke:#a55
    style silvery fill:#1a3a1a,color:#ccc,stroke:#3a8
    style R1 fill:#555,color:#ccc
    style R1b fill:#555,color:#ccc,stroke:#a55,stroke-dasharray: 5 5
```

### When useBoxRect() Is Available

```mermaid
%%{init: {'theme': 'dark'}}%%
gantt
    title When Dimensions Are Available
    dateFormat X
    axisFormat %s

    section Ink Pipeline
    React render (width unknown)    :r1, 0, 1
    Yoga layout                     :l1, 1, 2
    Output                          :o1, 2, 3
    measureElement effect fires     :milestone, m1, 3, 0
    Re-render (width known)         :r2, 3, 4
    Re-layout                       :l2, 4, 5
    Re-output                       :o2, 5, 6

    section Silvery Pipeline
    Structure extraction            :s1, 0, 1
    Flexily layout                  :s2, 1, 2
    Content render (width known)    :crit, s3, 2, 3
    Diff + output                   :s4, 3, 4
```

### Structure vs Content Separation

```mermaid
%%{init: {'theme': 'dark'}}%%
graph TD
    JSX["JSX Tree<br/>&lt;Box flexDir=row padding=1&gt;"] --> Split{{"Separate"}}

    Split -->|"flex props"| Structure["Structure Tree<br/>flexDirection, padding,<br/>border, width, height,<br/>min/max constraints"]

    Split -->|"children"| Content["Content<br/>Text, truncation,<br/>compact vs full layout,<br/>conditional elements"]

    Structure --> Layout["Flexily Layout<br/>Compute positions + sizes"]
    Layout -->|"useBoxRect()"| Content
    Content --> Paint["Paint<br/>Write to terminal buffer"]

    style Split fill:#7d6608,color:#fff
    style Structure fill:#1a5276,color:#fff
    style Content fill:#1e8449,color:#fff
    style Layout fill:#5b2c6f,color:#fff
    style Paint fill:#784212,color:#fff
```

### Responsive Kanban Board

```mermaid
%%{init: {'theme': 'dark'}}%%
graph TB
    subgraph narrow["width < 60: 1 column"]
        N1["| To Do |<br/>card 1<br/>card 2<br/>card 3"]
    end

    subgraph medium["width 60-119: 2 columns"]
        M1["| To Do    |"]
        M2["| In Prog  |"]
    end

    subgraph wide["width >= 120: 3 columns"]
        W1["| To Do    |"]
        W2["| In Prog  |"]
        W3["| Done     |"]
    end

    CR["useBoxRect()"] -->|"width"| narrow
    CR -->|"width"| medium
    CR -->|"width"| wide

    style narrow fill:#2c3e50,color:#ccc,stroke:#555
    style medium fill:#2c3e50,color:#ccc,stroke:#555
    style wide fill:#2c3e50,color:#ccc,stroke:#555
    style CR fill:#7d3c98,color:#fff
```

---

## Hero Images

All generated via Gemini 2.5 Flash Image (`gemini-2.5-flash-image` model). Prompts focused on dark, minimal, developer-aesthetic with neon accent colors and no readable text.

| Article            | File                          | Size   |
| ------------------ | ----------------------------- | ------ |
| Terminal Emulators | `hero-terminal-emulators.png` | 1.4 MB |
| AI Agent TUI       | `hero-ai-agent-tui.png`       | 1.5 MB |
| Dynamic Scrollback | `hero-dynamic-scrollback.png` | 1.2 MB |
| Terminal Protocols | `hero-terminal-protocols.png` | 1.6 MB |
| Layout-First       | `hero-layout-first.png`       | 932 KB |

To use as OG images, resize to exactly 1200x630 and compress:

```bash
for f in hero-*.png; do
  convert "$f" -resize 1200x630^ -gravity center -extent 1200x630 -quality 85 "og-${f%.png}.jpg"
done
```
