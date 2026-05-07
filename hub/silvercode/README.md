# hub/silvercode/ — internal workspace for silvercode

Private design docs, futures, research, and roadmap for silvercode (the multi-agent coding workspace built on Silvery). Companion to the public README at `apps/silvercode/README.md`.

## Layout

```
hub/silvercode/
  README.md                            # you are here
  design/                              # durable design + investigation docs
    ambient-context-safety.md          # role-prefix hallucination fix + re-introduction plan
  future/                              # long-horizon vision + research
    ai-terminal/                       # the foundational design corpus (numbered series)
```

## What lives here vs elsewhere

| Live here                                               | Live elsewhere                            |
| ------------------------------------------------------- | ----------------------------------------- |
| Long-horizon vision (silvercode-agent / ACP++)          | Public README → apps/silvercode/README.md |
| Strategic positioning vs other coding agents            | Live design docs → apps/silvercode/docs/  |
| Research notes (router landscape, host landscape, etc.) | Component design → silvery's internal hub |
| Quarterly review notes                                  | Issue tracking → beads                    |

## Promotion path

Drafts start here. They move to `apps/silvercode/docs/` (or further up to user-facing content) when polished and approved. Internal is the workspace; public is the showcase.

## Cross-references

- Public surface: [`apps/silvercode/README.md`](../../apps/silvercode/README.md)
- In-flight design docs: [`apps/silvercode/docs/`](../../apps/silvercode/docs/)
- Silvery (the framework): [`hub/silvery/`](../silvery/)
- Companion in-repo workspace: [`hub/km/`](../km/)

